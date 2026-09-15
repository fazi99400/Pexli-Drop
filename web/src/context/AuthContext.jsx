import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCustomToken,
  linkWithPopup,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, googleProvider, firebaseConfigured } from "../firebase";
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

// The X sign-in callback returns ?xt=<firebase custom token>. Grab it (once)
// and strip it from the URL so a refresh can't replay it.
function takeXToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("xt");
    if (!t) return null;
    params.delete("xt");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    return t;
  } catch (e) {
    return null;
  }
}
const PENDING_X_TOKEN = takeXToken();

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
  // Set when the server refuses a call because the account is blocked (see
  // requireNotBlocked in functions/src/callable.js, which attaches structured
  // `details` rather than just a message so this never relies on string
  // matching). { blockedUntil: ms|null, reason: string } | null.
  const [blockInfo, setBlockInfo] = useState(null);

  // Firebase callable errors carry the thrown HttpsError's third argument as
  // `.details`. Returns true (and records it) if this error is a block.
  const applyIfBlocked = useCallback((e) => {
    if (e?.details?.blocked) {
      setBlockInfo({ blockedUntil: e.details.blockedUntil ?? null, reason: e.details.reason || "" });
      return true;
    }
    return false;
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.getMe();
      setProfile(res.data);
      setBlockInfo(null); // a successful call proves the account isn't (or is no longer) blocked
    } catch (e) {
      if (!applyIfBlocked(e)) console.warn("getMe failed", e?.message);
    }
  }, [applyIfBlocked]);

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

  // Exchange the X sign-in custom token (from ?xt=) for a Firebase session.
  // Runs once, before we decide the user is signed out.
  const [xTokenPending, setXTokenPending] = useState(!!PENDING_X_TOKEN);
  useEffect(() => {
    if (!PENDING_X_TOKEN || !firebaseConfigured) return;
    signInWithCustomToken(auth, PENDING_X_TOKEN)
      .catch((e) => console.warn("X sign-in failed", e?.message))
      .finally(() => setXTokenPending(false));
  }, []);

  // Auth state → ensure profile exists, read admin claim, apply referral.
  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return undefined;
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setBlockInfo(null); // reset on every auth transition; a real block re-sets it below
      if (u) {
        try {
          await api.ensureProfile();
          const token = await u.getIdTokenResult(true);
          setIsAdmin(token.claims.admin === true);
          let prof = (await api.getMe()).data;
          prof = await applyPendingReferral(prof);
          setProfile(prof);
        } catch (e) {
          if (!applyIfBlocked(e)) console.warn("post-login setup failed", e?.message);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, [applyPendingReferral, applyIfBlocked]);

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

  // Sign up / sign in with X. We don't use Firebase's native Twitter provider
  // (that needs OAuth 1.0a keys configured in the console); instead we start our
  // own X OAuth flow whose callback returns a Firebase custom token — see
  // functions/src/tasks/x.js. This reuses the same X app as the connect flow.
  const signInX = async () => {
    const res = await api.xLoginStart();
    window.location.href = res.data.url;
  };

  // Link the OTHER provider during activation. Google is a native Firebase
  // provider, so linking it enforces one-Google-per-account for free (a Google
  // already on another account throws auth/credential-already-in-use). After
  // linking, ensureProfile refreshes the stored provider list.
  const linkGoogle = async () => {
    if (!auth.currentUser) throw new Error("Sign in first.");
    await linkWithPopup(auth.currentUser, googleProvider);
    try {
      await api.ensureProfile();
    } catch (e) {
      /* provider refresh best-effort */
    }
    await refreshProfile();
  };

  const logout = () => signOut(auth);

  // Whether each login method is linked to this account.
  const googleLinked = !!(profile && (profile.authProviders || []).includes("google"));
  const xLinked = !!(profile && profile.xHandle);

  // Account is "active" (can enter the airdrop) once it has a reward wallet AND
  // BOTH logins linked (Google + X) — one person, one X, one Google. An admin
  // can waive the two-provider requirement per-account (profile.forceActivated)
  // for a legitimate single-provider sign-up; a wallet is still required.
  const isActive = !!(
    profile &&
    profile.walletAddress &&
    (profile.forceActivated || (xLinked && googleLinked))
  );

  const value = {
    user,
    profile,
    isAdmin,
    config,
    loading: loading || xTokenPending,
    firebaseConfigured,
    isActive,
    googleLinked,
    xLinked,
    blockInfo,
    refreshProfile,
    setProfile,
    signInGoogle,
    signInX,
    linkGoogle,
    logout,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
