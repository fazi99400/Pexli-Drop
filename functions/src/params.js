// Runtime parameters & secrets.
//
// All owner-supplied "<<FILL_IN>>" values from the build spec are wired here.
// Non-secret values are plain params (safe in config); credentials are
// secrets (stored in Google Secret Manager, never committed).
//
// Set params/secrets before deploy, e.g.:
//   firebase functions:secrets:set X_CLIENT_SECRET
//   firebase deploy --only functions
// or via .env files in this folder for the emulator (see .env.example).
const { defineString, defineSecret } = require("firebase-functions/params");

// --- Chain (non-secret) -----------------------------------------------------
// Pexli is EVM-compatible. Chain id 78901 (0x13435). Copy the RPC + explorer
// from https://chainlist.org/chain/78901.
const PEXLI_RPC_URL = defineString("PEXLI_RPC_URL", { default: "" });
const PEXLI_EXPLORER_API = defineString("PEXLI_EXPLORER_API", { default: "" });
const PEXLI_CHAIN_ID = defineString("PEXLI_CHAIN_ID", { default: "78901" });

// On-chain task target addresses (lowercased for comparison).
const FAUCET_ADDRESS = defineString("FAUCET_ADDRESS", { default: "" });
const DEX_ROUTER_ADDRESS = defineString("DEX_ROUTER_ADDRESS", { default: "" });

// --- X / Twitter OAuth 2.0 --------------------------------------------------
const X_CLIENT_ID = defineString("X_CLIENT_ID", { default: "" });
const X_CLIENT_SECRET = defineSecret("X_CLIENT_SECRET");
// Public numeric id of the Pexli account users must follow (@PexliLabs).
const X_PEXLI_USER_ID = defineString("X_PEXLI_USER_ID", { default: "" });
// Where X redirects back after OAuth (must match the app settings).
const X_REDIRECT_URI = defineString("X_REDIRECT_URI", {
  default: "https://drop.pex.li/x/callback",
});

// --- App ---------------------------------------------------------------------
// Comma-separated list of origins allowed to call the HTTP (OAuth) endpoints.
const ALLOWED_ORIGINS = defineString("ALLOWED_ORIGINS", {
  default: "https://drop.pex.li,http://localhost:5173",
});

module.exports = {
  PEXLI_RPC_URL,
  PEXLI_EXPLORER_API,
  PEXLI_CHAIN_ID,
  FAUCET_ADDRESS,
  DEX_ROUTER_ADDRESS,
  X_CLIENT_ID,
  X_CLIENT_SECRET,
  X_PEXLI_USER_ID,
  X_REDIRECT_URI,
  ALLOWED_ORIGINS,
};
