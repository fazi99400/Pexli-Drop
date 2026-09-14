// Non-custodial in-browser wallet.
//
// The private key NEVER leaves this device and is NEVER sent to any server.
// It is stored only as a password-encrypted JSON keystore (ethers' standard
// scrypt + AES-128-CTR format — the same format MetaMask/geth use) in
// localStorage. The decrypted signer lives only in memory while the wallet is
// unlocked. On the server we store nothing but the PUBLIC address.
//
// This is what makes "log in with your seed phrase and swap in-app" safe:
// the app is a client-side signer, not a custodian. See /security page + Terms.
import { ethers } from "ethers";
import { PEXLI_CHAIN } from "./chain";

const KEYSTORE_KEY = "pexli_wallet_keystore_v1";
const ADDRESS_KEY = "pexli_wallet_address_v1";

// --- storage helpers (all guarded — private windows / blocked storage) -------
function ls() {
  return typeof window !== "undefined" ? window.localStorage : null;
}
export function hasWallet() {
  try {
    return !!ls()?.getItem(KEYSTORE_KEY);
  } catch (e) {
    return false;
  }
}
export function getStoredAddress() {
  try {
    return ls()?.getItem(ADDRESS_KEY) || null;
  } catch (e) {
    return null;
  }
}
function saveKeystore(json, address) {
  const store = ls();
  if (!store) throw new Error("This browser is blocking local storage, so a wallet can't be saved here.");
  store.setItem(KEYSTORE_KEY, json);
  store.setItem(ADDRESS_KEY, address);
}
export function removeWallet() {
  try {
    ls()?.removeItem(KEYSTORE_KEY);
    ls()?.removeItem(ADDRESS_KEY);
  } catch (e) {
    /* ignore */
  }
}
export function getKeystore() {
  try {
    return ls()?.getItem(KEYSTORE_KEY) || null;
  } catch (e) {
    return null;
  }
}

// --- provider ----------------------------------------------------------------
let _provider = null;
export function getProvider() {
  if (_provider) return _provider;
  const rpc = PEXLI_CHAIN.rpcUrls[0];
  if (!rpc) throw new Error("Pexli RPC is not configured.");
  _provider = new ethers.JsonRpcProvider(rpc, {
    chainId: parseInt(PEXLI_CHAIN.chainId, 16),
    name: PEXLI_CHAIN.chainName,
  });
  return _provider;
}

// --- encryption (WebCrypto: PBKDF2 + AES-GCM) --------------------------------
// We store the secret ourselves rather than ethers' scrypt keystore because
// scrypt is extremely slow on phones (create/unlock could take 20-30s and feel
// broken). PBKDF2 is hardware-accelerated and unlocks in well under a second,
// while staying strong (250k iterations, AES-256-GCM). The plaintext secret
// never leaves memory; only this ciphertext is written to localStorage.
const VAULT_VERSION = 2;
const PBKDF2_ITERS = 250000;

function b64(bytes) {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encryptVault(secretObj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const pt = new TextEncoder().encode(JSON.stringify(secretObj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return JSON.stringify({ v: VAULT_VERSION, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}
async function decryptVault(vaultStr, password) {
  const obj = JSON.parse(vaultStr);
  const key = await deriveKey(password, unb64(obj.salt));
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(obj.iv) }, key, unb64(obj.ct));
  return JSON.parse(new TextDecoder().decode(ptBuf)); // { mnemonic?, privateKey }
}
function isNewVault(str) {
  try {
    const o = JSON.parse(str);
    return o && o.v === VAULT_VERSION && o.salt && o.iv && o.ct;
  } catch (e) {
    return false;
  }
}

// Build an ethers wallet (connected to the provider) from a decrypted secret.
function walletFromSecret(secret) {
  const w = secret.mnemonic
    ? ethers.Wallet.fromPhrase(secret.mnemonic)
    : new ethers.Wallet(secret.privateKey);
  return w.connect(getProvider());
}

// --- create / import ---------------------------------------------------------
// Each returns { address, mnemonic? } and persists the encrypted vault.
async function persist(wallet, password) {
  const secret = { mnemonic: wallet.mnemonic?.phrase || null, privateKey: wallet.privateKey };
  const vault = await encryptVault(secret, password);
  saveKeystore(vault, wallet.address);
  return { address: wallet.address, mnemonic: secret.mnemonic };
}

export async function createWallet(password) {
  const wallet = ethers.Wallet.createRandom();
  return persist(wallet, password);
}

export async function importFromMnemonic(phrase, password) {
  const clean = String(phrase || "").trim().replace(/\s+/g, " ").toLowerCase();
  let wallet;
  try {
    wallet = ethers.Wallet.fromPhrase(clean);
  } catch (e) {
    throw new Error("That recovery phrase isn't valid. Check the words and spacing.");
  }
  return persist(wallet, password);
}

export async function importFromPrivateKey(pk, password) {
  let key = String(pk || "").trim();
  if (key && !key.startsWith("0x")) key = "0x" + key;
  let wallet;
  try {
    wallet = new ethers.Wallet(key);
  } catch (e) {
    throw new Error("That private key isn't valid.");
  }
  return persist(wallet, password);
}

// --- unlock / export ---------------------------------------------------------
// Returns an ethers Wallet connected to the Pexli provider (in memory only).
// Handles both the fast WebCrypto vault (v2) and any legacy ethers scrypt
// keystore, so wallets created before this change still open.
export async function unlockWallet(password) {
  const stored = getKeystore();
  if (!stored) throw new Error("No wallet on this device yet.");
  if (isNewVault(stored)) {
    let secret;
    try {
      secret = await decryptVault(stored, password);
    } catch (e) {
      throw new Error("Wrong password.");
    }
    const wallet = walletFromSecret(secret);
    // Opportunistically nothing to migrate — already v2.
    return wallet;
  }
  // Legacy scrypt keystore: decrypt, then re-save as a fast v2 vault so future
  // unlocks are instant.
  let legacy;
  try {
    legacy = await ethers.Wallet.fromEncryptedJson(stored, password);
  } catch (e) {
    throw new Error("Wrong password.");
  }
  try {
    await persist(legacy, password); // upgrade in place
  } catch (e) {
    /* non-fatal: keep using the legacy keystore */
  }
  return legacy.connect(getProvider());
}

// Reveal the secret for backup — requires the password again.
export async function exportSecret(password) {
  const stored = getKeystore();
  if (!stored) throw new Error("No wallet on this device yet.");
  if (isNewVault(stored)) {
    let secret;
    try {
      secret = await decryptVault(stored, password);
    } catch (e) {
      throw new Error("Wrong password.");
    }
    const w = walletFromSecret(secret);
    return { address: w.address, privateKey: w.privateKey, mnemonic: secret.mnemonic || null };
  }
  const wallet = await unlockWallet(password);
  return { address: wallet.address, privateKey: wallet.privateKey, mnemonic: wallet.mnemonic?.phrase || null };
}

// --- chain reads -------------------------------------------------------------
export async function getBalance(address) {
  const addr = address || getStoredAddress();
  if (!addr) return "0";
  const wei = await getProvider().getBalance(addr);
  return ethers.formatEther(wei);
}

export function explorerTxUrl(hash) {
  const base = PEXLI_CHAIN.blockExplorerUrls[0];
  return base ? `${base.replace(/\/+$/, "")}/tx/${hash}` : null;
}

export { ethers };
