import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { hasWallet, getStoredAddress, getBalance } from "../lib/localWallet";

// Holds the in-browser wallet's UI state. The decrypted signer lives here in
// memory ONLY while unlocked; it is dropped on lock/refresh and never persisted.
const WalletCtx = createContext(null);
export const useWallet = () => useContext(WalletCtx);

export function WalletProvider({ children }) {
  const [exists, setExists] = useState(hasWallet());
  const [address, setAddress] = useState(getStoredAddress());
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
