// ─────────────────────────────────────────────────────────────────────────
//  FIREBASE WEB CONFIG  —  fill these 5 values and commit this file.
// ─────────────────────────────────────────────────────────────────────────
//
//  These values are NOT secret. Firebase web config always ships inside the
//  browser bundle by design, so it is safe to commit here. Your app is secured
//  by Firestore rules + Auth "Authorized domains", not by hiding the apiKey.
//
//  Where to get them:
//    Firebase console → ⚙ Project settings → General → "Your apps" →
//    Web app (</>)  →  copy the values from the shown `firebaseConfig`.
//
//  After editing, commit/push (or edit right here on GitHub and commit).
//  Cloudflare rebuilds automatically — no Cloudflare "Variables" needed.
//
//  (Advanced: VITE_FIREBASE_* env vars, if set at build time, override these.)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB0ftO8g-e70xMBFTndsaJdy78qWx2AEHA",
  authDomain: "pexli-drop.firebaseapp.com",
  projectId: "pexli-drop",
  appId: "1:632066138675:web:2a2cb9470b1dbb0e9f7946",
  messagingSenderId: "632066138675",
};

// Cloud Functions region (leave as-is unless you deployed functions elsewhere).
export const FUNCTIONS_REGION = "us-central1";

// Pexli chain (used for wallet auto-add network + explorer links).
export const PEXLI_RPC_URL = "https://testrpc.pex.li";
export const PEXLI_EXPLORER_URL = "https://explorer.pex.li";
