// User profile lifecycle: create on sign-up, expose "me", save wallet with
// server-enforced uniqueness (one wallet per user, anti multi-account).
const functionsV1 = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, FieldValue, Timestamp } = require("./init");
const { CALL_OPTS, requireAuth, loadUser } = require("./callable");
const { normalizeAddress, lc } = require("./chain");

// Canonical profile document. Kept tiny: text + numbers + timestamps only.
function newProfile(user) {
  const providers = (user.providerData || []).map((p) => providerKey(p.providerId));
  return {
    displayName: user.displayName || "",
    email: user.email || "",
    authProviders: providers.length ? providers : ["google"],
    xUserId: null,
    xHandle: null,
    walletAddress: null,
    points: 0,
    createdAt: Timestamp.now(),
    lastFaucetAt: null,
    lastSwapAt: null,
    lastTxAt: null,
    lastTweetTaskAt: null,
    lastCheckedBlock: null,
    txNonceCursor: null,
  };
}

function providerKey(providerId) {
  if (!providerId) return "google";
  if (providerId.includes("google")) return "google";
  if (providerId.includes("apple")) return "apple";
  if (providerId.includes("twitter") || providerId.includes("x.com")) return "twitter";
  return providerId;
}

// v1 auth trigger — fires once when Firebase Auth creates the account. This is
// the canonical create path (works with standard Firebase Auth, no GCIP upgrade).
const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(newProfile(user));
  }
});

// Idempotent client-callable fallback (covers emulator + any edge where the
// trigger didn't run). Never overwrites an existing profile.
const ensureProfile = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(
      newProfile({
        uid,
        displayName: request.auth.token.name || "",
        email: request.auth.token.email || "",
        providerData: [{ providerId: request.auth.token.firebase?.sign_in_provider || "google" }],
      }),
    );
  }
  const fresh = await ref.get();
  return publicProfile(fresh.data());
});

// Return the caller's own profile (safe subset).
const getMe = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { data } = await loadUser(uid);
  return publicProfile(data);
});

// Save / update the caller's wallet address. Enforces global uniqueness so one
// address can back only one account (§4). Uses a walletIndex doc as a lock.
const setWallet = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const checksummed = normalizeAddress(request.data?.walletAddress);
  const lower = lc(checksummed);
  const userRef = db.collection("users").doc(uid);
  const indexRef = db.collection("walletIndex").doc(lower);

  await db.runTransaction(async (tx) => {
    const [idxSnap, userSnap] = await Promise.all([tx.get(indexRef), tx.get(userRef)]);
    if (idxSnap.exists && idxSnap.data().uid !== uid) {
      throw new HttpsError(
        "already-exists",
        "That wallet address is already linked to another account.",
      );
    }
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "Complete sign-in first.");
    }
    // Release a previously-claimed address by this user, if different.
    const prev = userSnap.data().walletAddress;
    if (prev && lc(prev) !== lower) {
      tx.delete(db.collection("walletIndex").doc(lc(prev)));
    }
    tx.set(indexRef, { uid, at: FieldValue.serverTimestamp() });
    tx.set(userRef, { walletAddress: checksummed }, { merge: true });
  });

  return { walletAddress: checksummed };
});

// Whitelist of fields ever sent to the client.
function publicProfile(d = {}) {
  return {
    displayName: d.displayName || "",
    email: d.email || "",
    authProviders: d.authProviders || [],
    xUserId: d.xUserId || null,
    xHandle: d.xHandle || null,
    walletAddress: d.walletAddress || null,
    points: d.points || 0,
    createdAt: d.createdAt || null,
    lastFaucetAt: d.lastFaucetAt || null,
    lastSwapAt: d.lastSwapAt || null,
    lastTxAt: d.lastTxAt || null,
    lastTweetTaskAt: d.lastTweetTaskAt || null,
  };
}

module.exports = { onUserCreate, ensureProfile, getMe, setWallet, publicProfile };
