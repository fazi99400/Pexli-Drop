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
  apiKey: "",
  authDomain: "", // e.g. your-project.firebaseapp.com
  projectId: "",
  appId: "",
  messagingSenderId: "",
};

// Cloud Functions region (leave as-is unless you deployed functions elsewhere).
export const FUNCTIONS_REGION = "us-central1";

// Pexli chain (optional now; needed for wallet auto-add + explorer links).
// Copy from https://chainlist.org/chain/78901
export const PEXLI_RPC_URL = "";
export const PEXLI_EXPLORER_URL = "";
