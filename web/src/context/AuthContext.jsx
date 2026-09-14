import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  getAdditionalUserInfo,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, googleProvider, twitterProvider, firebaseConfigured } from "../firebase";
import { api } from "../lib/functions";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";

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
    if (!firebaseConfigured) {
      setLoading(false);
      return undefined;
    }
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

  // Live config (task toggles / point values / locks). Falls back to defaults
  // when the doc doesn't exist yet or rules block the read, so the dashboard
  // still renders before the backend is fully deployed.
  useEffect(() => {
    if (!firebaseConfigured) return undefined;
    return onSnapshot(
      doc(db, "config", "global"),
      (snap) => setConfig(snap.exists() ? { ...DEFAULT_CONFIG, ...snap.data() } : DEFAULT_CONFIG),
      (e) => {
        console.warn("config listen failed — using defaults", e?.message);
        setConfig(DEFAULT_CONFIG);
      },
    );
  }, []);

  const signInGoogle = () => signInWithPopup(auth, googleProvider);
  // Signing in with X also captures the X handle automatically, so the user
  // never has to press a separate "Connect X" — it's verified once, at sign-up,
  // and simply re-confirmed on later logins. Best-effort: if it fails, the user
  // can still connect X manually from Settings.
  const signInX = async () => {
    const result = await signInWithPopup(auth, twitterProvider);
    try {
      const info = getAdditionalUserInfo(result);
      const username = info?.username || result?._tokenResponse?.screenName || null;
      if (username) {
        await api.setSocialHandle({ platform: "x", handle: String(username).replace(/^@/, "") });
        await refreshProfile();
      }
    } catch (e) {
      console.warn("auto X-handle capture failed", e?.message);
    }
    return result;
  };
  const logout = () => signOut(auth);

  // Account is "active" (can enter the airdrop) once it has a reward wallet AND
  // an X account linked. This raises the bar for bot/fake accounts.
  const isActive = !!(profile && profile.walletAddress && profile.xHandle);

  const value = {
    user,
    profile,
    isAdmin,
    config,
    loading,
    firebaseConfigured,
    isActive,
    refreshProfile,
    setProfile,
    signInGoogle,
    signInX,
    logout,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
