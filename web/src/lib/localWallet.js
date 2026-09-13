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

// --- create / import ---------------------------------------------------------
// Each returns { address, mnemonic? } and persists the encrypted keystore.
// scrypt encryption is intentionally slow; callers should show a spinner.
async function persist(wallet, password) {
  const json = await wallet.encrypt(password);
  saveKeystore(json, wallet.address);
  return { address: wallet.address, mnemonic: wallet.mnemonic?.phrase || null };
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
export async function unlockWallet(password) {
  const json = getKeystore();
  if (!json) throw new Error("No wallet on this device yet.");
  let wallet;
  try {
    wallet = await ethers.Wallet.fromEncryptedJson(json, password);
  } catch (e) {
    throw new Error("Wrong password.");
  }
  return wallet.connect(getProvider());
}

// Reveal the secret for backup — requires the password again.
export async function exportSecret(password) {
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
