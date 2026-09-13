// Firebase client bootstrap. Config comes from Vite env (VITE_FIREBASE_*).
//
// If the env vars are missing (e.g. Cloudflare Pages was deployed without them)
// we DON'T call getAuth()/initializeApp with an empty apiKey — that throws at
// import time and blanks the whole page. Instead we expose `firebaseConfigured`
// so the app can show a friendly setup screen.
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  TwitterAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { FIREBASE_CONFIG, FUNCTIONS_REGION } from "./firebase.config";

// Values come from build-time env vars if set, else from src/firebase.config.js
// (the easy, commit-your-values path — Firebase web config is not secret).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FIREBASE_CONFIG.appId,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_CONFIG.messagingSenderId,
};

const functionsRegion =
  import.meta.env.VITE_FUNCTIONS_REGION || FUNCTIONS_REGION || "us-central1";

// Minimum needed for the SDK to initialize meaningfully.
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app = null;
let auth = null;
let db = null;
let functions = null;
let googleProvider = null;
let twitterProvider = null;

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, functionsRegion);

  googleProvider = new GoogleAuthProvider();
  twitterProvider = new TwitterAuthProvider();

  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
  }
} else {
  // Loud in the console so the operator knows exactly what's wrong.
  console.error(
    "[Pexli] Firebase is not configured. Set VITE_FIREBASE_API_KEY, " +
      "VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID (see web/.env.example).",
  );
}

export { app, auth, db, functions, googleProvider, twitterProvider };
