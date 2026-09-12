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
  OAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

// Minimum needed for the SDK to initialize meaningfully.
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app = null;
let auth = null;
let db = null;
let functions = null;
let googleProvider = null;
let appleProvider = null;

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || "us-central1");

  googleProvider = new GoogleAuthProvider();
  appleProvider = new OAuthProvider("apple.com");
  appleProvider.addScope("email");
  appleProvider.addScope("name");

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

export { app, auth, db, functions, googleProvider, appleProvider };
