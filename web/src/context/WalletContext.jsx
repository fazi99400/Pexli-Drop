import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { setWalletUser, hasWallet, getStoredAddress, getBalance } from "../lib/localWallet";

// Holds the in-browser wallet's UI state. The decrypted signer lives here in
// memory ONLY while unlocked; it is dropped on lock/refresh and never persisted.
const WalletCtx = createContext(null);
export const useWallet = () => useContext(WalletCtx);

export function WalletProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid || null;

  const [exists, setExists] = useState(false);
  const [address, setAddress] = useState(null);
  const [signer, setSigner] = useState(null); // in-memory only
  const [balance, setBalance] = useState(null);

  const unlocked = !!signer;

  const refreshBalance = useCallback(async (addr) => {
    const a = addr || address;
    if (!a) return;
    try {
      setBalance(await getBalance(a));
    } catch (e) {
      /* RPC hiccup — leave last known */
    }
  }, [address]);

  // Called after create/import/unlock: adopt the live signer + address.
  const adopt = useCallback((sgn) => {
    setSigner(sgn);
    setAddress(sgn.address);
    setExists(true);
    refreshBalance(sgn.address);
  }, [refreshBalance]);

  const lock = useCallback(() => setSigner(null), []);

  // Re-scope local wallet storage to the signed-in account every time it
  // changes — sign-in, sign-out, or switching to a different account on the
  // same device. This is what stops one account's wallet from ever showing
  // up under a different one: each account only ever sees its own.
  useEffect(() => {
    setWalletUser(uid);
    setSigner(null); // never carry an unlocked signer across an account change
    setBalance(null);
    setExists(hasWallet());
    setAddress(getStoredAddress());
  }, [uid]);

  // Re-sync the known address/existence when the tab regains focus (another tab
  // may have created/removed the wallet).
  useEffect(() => {
    function sync() {
      setExists(hasWallet());
      setAddress(getStoredAddress());
    }
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    if (address) refreshBalance(address);
  }, [address, refreshBalance]);

  const value = {
    exists,
    address,
    signer,
    unlocked,
    balance,
    adopt,
    lock,
    refreshBalance,
    setExists,
    setAddress,
  };
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
