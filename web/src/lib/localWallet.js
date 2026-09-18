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

// Storage is namespaced per signed-in Firebase account (uid) — see
// setWalletUser() below — so that logging into a DIFFERENT account on the
// same device/browser never sees a PREVIOUS account's wallet. Before this,
// every account shared one fixed key, so switching accounts on one device
// made account B land straight on account A's (locked) wallet instead of
// its own "set up a wallet" screen.
const KEYSTORE_BASE = "pexli_wallet_keystore_v2";
const ADDRESS_BASE = "pexli_wallet_address_v2";
// Pre-namespacing keys, kept only so the one-time migration below can find
// and claim an existing wallet the first time this ships.
const LEGACY_KEYSTORE_KEY = "pexli_wallet_keystore_v1";
const LEGACY_ADDRESS_KEY = "pexli_wallet_address_v1";

let _uid = null; // the currently signed-in account; null while signed out

// Call this whenever the signed-in account changes (sign-in, sign-out,
// switching accounts) — see WalletContext.jsx. Runs a one-time migration:
// the FIRST account that sees a pre-namespacing wallet claims it (matches
// prior behaviour for the common single-account-per-device case); the
// legacy key is then removed so no OTHER account can ever pick it up too.
export function setWalletUser(uid) {
  _uid = uid || null;
  if (_uid) migrateLegacyWallet(_uid);
}
function keystoreKeyFor(uid) {
  return `${KEYSTORE_BASE}:${uid || "anon"}`;
}
function addressKeyFor(uid) {
  return `${ADDRESS_BASE}:${uid || "anon"}`;
}
function migrateLegacyWallet(uid) {
  try {
    const store = ls();
    if (!store) return;
    const legacy = store.getItem(LEGACY_KEYSTORE_KEY);
    if (!legacy) return; // nothing pre-namespacing to migrate
    if (!store.getItem(keystoreKeyFor(uid))) {
      // This account doesn't have its own scoped wallet yet — it claims the
      // pre-existing one-per-device wallet.
      store.setItem(keystoreKeyFor(uid), legacy);
      const legacyAddr = store.getItem(LEGACY_ADDRESS_KEY);
      if (legacyAddr) store.setItem(addressKeyFor(uid), legacyAddr);
    }
    // Consumed either way — remove it so a different account can never also
    // inherit it later.
    store.removeItem(LEGACY_KEYSTORE_KEY);
    store.removeItem(LEGACY_ADDRESS_KEY);
  } catch (e) {
    /* storage blocked — nothing to migrate then */
  }
}

// --- storage helpers (all guarded — private windows / blocked storage) -------
function ls() {
  return typeof window !== "undefined" ? window.localStorage : null;
}
export function hasWallet() {
  try {
    return !!ls()?.getItem(keystoreKeyFor(_uid));
  } catch (e) {
    return false;
  }
}
export function getStoredAddress() {
  try {
    return ls()?.getItem(addressKeyFor(_uid)) || null;
  } catch (e) {
    return null;
  }
}
function saveKeystore(json, address) {
  const store = ls();
  if (!store) throw new Error("This browser is blocking local storage, so a wallet can't be saved here.");
  store.setItem(keystoreKeyFor(_uid), json);
  store.setItem(addressKeyFor(_uid), address);
}
export function removeWallet() {
  try {
    ls()?.removeItem(keystoreKeyFor(_uid));
    ls()?.removeItem(addressKeyFor(_uid));
  } catch (e) {
    /* ignore */
  }
}
export function getKeystore() {
  try {
    return ls()?.getItem(keystoreKeyFor(_uid)) || null;
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
  // staticNetwork tells ethers the chain never changes, so it STOPS doing an
  // eth_chainId network-detection round-trip around every call. On the slow
  // Pexli test RPC that extra probe is a big source of latency AND of the
  // intermittent "missing revert data" (a cold probe racing the real call).
  const net = new ethers.Network(PEXLI_CHAIN.chainName, parseInt(PEXLI_CHAIN.chainId, 16));
  _provider = new ethers.JsonRpcProvider(rpc, net, { staticNetwork: net });
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

// Change the wallet's password: requires the CURRENT password (the secret is
// re-encrypted, never reset blind — there is no "forgot password" bypass for
// a properly encrypted vault; that's what makes it non-custodial). If the
// password is truly forgotten, the only way back in is re-importing the
// recovery phrase (see removeWallet + importFromMnemonic).
export async function changeWalletPassword(oldPassword, newPassword) {
  const stored = getKeystore();
  if (!stored) throw new Error("No wallet on this device yet.");
  let secret;
  if (isNewVault(stored)) {
    try {
      secret = await decryptVault(stored, oldPassword);
    } catch (e) {
      throw new Error("Current password is wrong.");
    }
  } else {
    let legacy;
    try {
      legacy = await ethers.Wallet.fromEncryptedJson(stored, oldPassword);
    } catch (e) {
      throw new Error("Current password is wrong.");
    }
    secret = { mnemonic: legacy.mnemonic?.phrase || null, privateKey: legacy.privateKey };
  }
  const wallet = walletFromSecret(secret);
  const vault = await encryptVault(secret, newPassword);
  saveKeystore(vault, wallet.address);
  return { address: wallet.address };
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
