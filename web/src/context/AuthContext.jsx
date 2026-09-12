import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, googleProvider, appleProvider } from "../firebase";
import { api } from "../lib/functions";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.getMe();
      setProfile(res.data);
    } catch (e) {
      console.warn("getMe failed", e?.message);
    }
  }, []);

  // Auth state → ensure profile exists, read admin claim.
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await api.ensureProfile();
          const token = await u.getIdTokenResult(true);
          setIsAdmin(token.claims.admin === true);
          await refreshProfile();
        } catch (e) {
          console.warn("post-login setup failed", e?.message);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, [refreshProfile]);

  // Live config (task toggles / point values / locks).
  useEffect(() => {
    return onSnapshot(
      doc(db, "config", "global"),
      (snap) => snap.exists() && setConfig(snap.data()),
      (e) => console.warn("config listen failed", e?.message),
    );
  }, []);

  const signInGoogle = () => signInWithPopup(auth, googleProvider);
  const signInApple = () => signInWithPopup(auth, appleProvider);
  const logout = () => signOut(auth);

  const value = {
    user,
    profile,
    isAdmin,
    config,
    loading,
    refreshProfile,
    setProfile,
    signInGoogle,
    signInApple,
    logout,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
