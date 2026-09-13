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
const { defineString } = require("firebase-functions/params");

// --- Chain (non-secret) -----------------------------------------------------
// Pexli is EVM-compatible. Chain id 78901 (0x13435). Copy the RPC + explorer
// from https://chainlist.org/chain/78901.
const PEXLI_RPC_URL = defineString("PEXLI_RPC_URL", { default: "https://testrpc.pex.li" });
// Blockscout/Etherscan-style API base (the code appends ?module=account&...).
const PEXLI_EXPLORER_API = defineString("PEXLI_EXPLORER_API", {
  default: "https://explorer.pex.li/api",
});
const PEXLI_CHAIN_ID = defineString("PEXLI_CHAIN_ID", { default: "78901" });

// On-chain task target addresses (lowercased for comparison).
// The Pexli faucet is a normal account (EOA) that dispenses native PEX.
// Faucet claim = user RECEIVES from it; tx task = user SENDS to it.
const FAUCET_ADDRESS = defineString("FAUCET_ADDRESS", {
  default: "0x2431bc9ff07Ad93152f7Cd18566CfC573731f732",
});
// Destination the "send a transaction" task requires PEX to be sent to
// (defaults to the faucet address per the owner's spec).
const TX_TARGET_ADDRESS = defineString("TX_TARGET_ADDRESS", {
  default: "0x2431bc9ff07Ad93152f7Cd18566CfC573731f732",
});
const DEX_ROUTER_ADDRESS = defineString("DEX_ROUTER_ADDRESS", {
  default: "0x596b93967Cc18539795437A17E689e775c2CCE93",
});

// Private key of the faucet account (the EOA at FAUCET_ADDRESS) used by the
// in-app faucet to SEND native PEX to users. SECRET — never commit a real
// value; it is injected at deploy from the GitHub Actions secret
// FAUCET_PRIVATE_KEY. Empty = the in-app faucet stays disabled.
const FAUCET_PRIVATE_KEY = defineString("FAUCET_PRIVATE_KEY", { default: "" });

// --- X / Twitter OAuth 2.0 --------------------------------------------------
const X_CLIENT_ID = defineString("X_CLIENT_ID", { default: "" });
// Plain param (not Secret Manager) so a first deploy never blocks on it; set a
// real value later when enabling X tasks. Empty = X tasks simply don't work.
const X_CLIENT_SECRET = defineString("X_CLIENT_SECRET", { default: "" });
// Public numeric id of the Pexli account users must follow (@PexliLabs).
const X_PEXLI_USER_ID = defineString("X_PEXLI_USER_ID", { default: "" });
// OAuth redirect — must EXACTLY match the Callback URL set in the X app. This is
// the xCallback Cloud Function URL (it processes the code then bounces the user
// back to APP_URL).
const X_REDIRECT_URI = defineString("X_REDIRECT_URI", {
  default: "https://us-central1-pexli-drop.cloudfunctions.net/xCallback",
});
// Where the site lives — used to send the user back after X connect.
const APP_URL = defineString("APP_URL", { default: "https://drop.pex.li" });

// --- App ---------------------------------------------------------------------
// Comma-separated list of origins allowed to call the HTTP (OAuth) endpoints.
const ALLOWED_ORIGINS = defineString("ALLOWED_ORIGINS", {
  default: "https://drop.pex.li,http://localhost:5173",
});

// Comma-separated emails that are auto-granted the admin claim on sign-in, so
// no manual bootstrap step is needed. The project owner is included by default.
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", {
  default: "alamzapakistan@gmail.com",
});

module.exports = {
  PEXLI_RPC_URL,
  PEXLI_EXPLORER_API,
  PEXLI_CHAIN_ID,
  FAUCET_ADDRESS,
  TX_TARGET_ADDRESS,
  DEX_ROUTER_ADDRESS,
  FAUCET_PRIVATE_KEY,
  X_CLIENT_ID,
  X_CLIENT_SECRET,
  X_PEXLI_USER_ID,
  X_REDIRECT_URI,
  APP_URL,
  ALLOWED_ORIGINS,
  ADMIN_EMAILS,
};
