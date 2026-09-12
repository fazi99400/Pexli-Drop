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

const REF_KEY = "pexli_ref";
// Capture ?ref=CODE as early as possible (before the router rewrites the URL)
// and remember it until the user is signed in and we can bind it server-side.
function captureRefFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) localStorage.setItem(REF_KEY, code.trim().toUpperCase());
  } catch (e) {
    /* storage blocked — ignore */
  }
}
captureRefFromUrl();

function safeRemove(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {
    /* ignore */
  }
}

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

  // Bind a captured referral code once the user is signed in (set-once).
  const applyPendingReferral = useCallback(async (prof) => {
    let code;
    try {
      code = localStorage.getItem(REF_KEY);
    } catch (e) {
      code = null;
    }
    if (!code || prof?.referredBy || code === prof?.referralCode) {
      if (code) safeRemove(REF_KEY);
      return prof;
    }
    try {
      await api.setReferrer({ code });
      safeRemove(REF_KEY);
      const res = await api.getMe();
      return res.data;
    } catch (e) {
      // Invalid/self/already-set — stop retrying.
      safeRemove(REF_KEY);
      return prof;
    }
  }, []);

  // Auth state → ensure profile exists, read admin claim, apply referral.
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await api.ensureProfile();
          const token = await u.getIdTokenResult(true);
          setIsAdmin(token.claims.admin === true);
          let prof = (await api.getMe()).data;
          prof = await applyPendingReferral(prof);
          setProfile(prof);
        } catch (e) {
          console.warn("post-login setup failed", e?.message);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, [applyPendingReferral]);

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
