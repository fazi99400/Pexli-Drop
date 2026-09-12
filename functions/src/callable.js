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

async function loadUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Complete sign-in first.");
  }
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

module.exports = { CALL_OPTS, requireAuth, requireAdmin, loadUser, requireTaskEnabled };
