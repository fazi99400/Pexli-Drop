// Helpers shared by every onCall handler.
const { HttpsError } = require("firebase-functions/v2/https");
const { db } = require("./init");
const { getConfig } = require("./config");

// Standard options for all our callables (region + secret binding done per fn).
const CALL_OPTS = { cors: true, region: "us-central1" };

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth.uid;
}

function requireAdmin(request) {
  const uid = requireAuth(request);
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  return uid;
}

// --- Account blocking ---------------------------------------------------
// A blocked user's data lives on users/{uid}: blocked (bool), blockedUntil
// (Timestamp|null — null means permanent while blocked=true), blockReason.
// A temporary block auto-expires the moment blockedUntil is in the past —
// no cron/cleanup needed, every check is computed live.
function isCurrentlyBlocked(userData = {}) {
  if (!userData.blocked) return false;
  const until = userData.blockedUntil;
  if (!until) return true; // permanent
  const untilMs = until.toMillis ? until.toMillis() : Number(until) || 0;
  return untilMs > Date.now();
}

// Throws with structured `details` (not just a message) so the client can
// reliably detect "blocked" and show a dedicated screen instead of a generic
// error toast. Call this anywhere you already have the user's Firestore data
// in hand — it never does its own read.
function requireNotBlocked(userData = {}) {
  if (!isCurrentlyBlocked(userData)) return;
  const until = userData.blockedUntil;
  const untilMs = until ? (until.toMillis ? until.toMillis() : Number(until) || null) : null;
  throw new HttpsError("permission-denied", "Your account has been blocked.", {
    blocked: true,
    blockedUntil: untilMs, // ms epoch, or null = permanent
    reason: userData.blockReason || "",
  });
}

async function loadUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Complete sign-in first.");
  }
  requireNotBlocked(snap.data());
  return { ref: snap.ref, data: snap.data() };
}

// Throw unless the task type is enabled in config/global.
async function requireTaskEnabled(taskType) {
  const config = await getConfig();
  if (!config.tasks[taskType]) {
    throw new HttpsError("failed-precondition", `The ${taskType} task is currently disabled.`);
  }
  return config;
}

module.exports = {
  CALL_OPTS,
  requireAuth,
  requireAdmin,
  loadUser,
  requireTaskEnabled,
  isCurrentlyBlocked,
  requireNotBlocked,
};
