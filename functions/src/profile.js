// User profile lifecycle: create on sign-up, expose "me", save wallet with
// server-enforced uniqueness (one wallet per user), and the referral binding.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, FieldValue, Timestamp } = require("./init");
const { CALL_OPTS, requireAuth, loadUser } = require("./callable");
const { normalizeAddress, lc } = require("./chain");
const params = require("./params");

// Auto-grant the admin claim to owner emails (config ADMIN_EMAILS), so no
// manual bootstrap is ever required. No-op if already admin or not listed.
function adminEmailSet() {
  return new Set(
    params.ADMIN_EMAILS.value()
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
async function maybeGrantAdmin(uid, email, alreadyAdmin) {
  if (alreadyAdmin) return;
  const e = String(email || "").toLowerCase();
  if (e && adminEmailSet().has(e)) {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
  }
}

// Deterministic 8-char referral code from the uid → unique, stable, no collision.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function referralCodeFor(uid) {
  const bytes = crypto.createHash("sha256").update(uid).digest().subarray(0, 5); // 40 bits
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = B32[Number((bits >> BigInt(5 * i)) & 31n)] + out;
  }
  return out;
}

// Canonical profile document. Kept tiny: text + numbers + timestamps only.
function newProfile(user) {
  const providers = (user.providerData || []).map((p) => providerKey(p.providerId));
  return {
    displayName: user.displayName || "",
    email: user.email || "",
    authProviders: providers.length ? providers : ["google"],
    xUserId: null,
    xHandle: null,
    igHandle: null,
    walletAddress: null,
    points: 0,
    createdAt: Timestamp.now(),
    lastFaucetAt: null,
    lastSwapAt: null,
    lastTxAt: null,
    lastTweetTaskAt: null,
    lastCheckedBlock: null,
    txNonceCursor: null,
    // Referral fields
    referralCode: referralCodeFor(user.uid),
    referredBy: null,
    referralCount: 0,
    referralPointsEarned: 0,
  };
}

function providerKey(providerId) {
  if (!providerId) return "google";
  if (providerId.includes("google")) return "google";
  if (providerId.includes("apple")) return "apple";
  if (providerId.includes("twitter") || providerId.includes("x.com")) return "twitter";
  return providerId;
}

// Derive the set of linked providers from a decoded ID token's identities.
// Used to keep authProviders fresh after the user links a second provider
// (e.g. an X-signup account later linking Google during activation).
function providersFromToken(token = {}) {
  const out = new Set();
  const ids = token.firebase?.identities || {};
  for (const k of Object.keys(ids)) {
    if (k.includes("google")) out.add("google");
    else if (k.includes("twitter") || k.includes("x.com")) out.add("twitter");
  }
  const sip = token.firebase?.sign_in_provider || "";
  if (sip.includes("google")) out.add("google");
  if (sip.includes("twitter") || sip.includes("x.com")) out.add("twitter");
  return [...out];
}

// Create the canonical profile doc if it doesn't exist yet, and make sure the
// referral code index is present. Idempotent. Shared by ensureProfile (client)
// and the X login/sign-up callback (server), so an X-first account still gets a
// full profile with a referral code.
async function ensureProfileDoc(uid, { displayName = "", email = "", provider = "google" } = {}) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(newProfile({ uid, displayName, email, providerData: [{ providerId: provider }] }));
  }
  try {
    await ensureReferralCode(uid);
  } catch (e) {
    console.warn("ensureReferralCode failed:", e.message);
  }
  return ref;
}

// Reverse index code → uid, so setReferrer can resolve a pasted code cheaply.
async function ensureReferralCode(uid) {
  const code = referralCodeFor(uid);
  await db.collection("referralCodes").doc(code).set({ uid }, { merge: true });
  return code;
}

// Profile creation happens in ensureProfile, which the client calls on every
// sign-in (see AuthContext). Creates the profile + referral code and grants the
// owner admin — all idempotent, so no separate auth-trigger function is needed.
const ensureProfile = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const ref = await ensureProfileDoc(uid, {
    displayName: request.auth.token.name || "",
    email: request.auth.token.email || "",
    provider: request.auth.token.firebase?.sign_in_provider || "google",
  });

  // Refresh the linked-provider list + email from the current token, so linking
  // a second provider (e.g. Google onto an X-first account) is reflected right
  // away — this is what the activation "both logins" check reads. Merge-only.
  try {
    const provs = providersFromToken(request.auth.token);
    const email = request.auth.token.email || "";
    const upd = {};
    if (provs.length) upd.authProviders = FieldValue.arrayUnion(...provs);
    if (email) upd.email = email;
    if (Object.keys(upd).length) await ref.set(upd, { merge: true });
  } catch (e) {
    console.warn("provider refresh failed:", e.message);
  }
  // Side effects must never crash profile creation — if the runtime SA lacks a
  // permission (e.g. to set custom claims) the profile still returns fine.
  try {
    await maybeGrantAdmin(uid, request.auth.token.email, request.auth.token.admin === true);
  } catch (e) {
    console.warn("maybeGrantAdmin failed:", e.message);
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

// Let the user set the display name that appears on the leaderboard. Kept to a
// short, safe set of characters (letters/numbers/space and . _ -).
const NAME_RE = /^[\p{L}\p{N} _.\-]{2,24}$/u;
const setDisplayName = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const name = String(request.data?.name || "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) {
    throw new HttpsError("invalid-argument", "Name must be 2–24 letters, numbers, spaces or . _ -");
  }
  await db.collection("users").doc(uid).set({ displayName: name }, { merge: true });
  return { displayName: name };
});

// "My referrals" — everyone who joined via the caller's referral code, with the
// points the caller earned from each. Powers the dedicated /referrals page.
const getMyReferrals = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const toMs = (t) => (t && t.toMillis ? t.toMillis() : null);

  // People who set me as their referrer.
  const referredSnap = await db.collection("users").where("referredBy", "==", uid).limit(1000).get();

  // My referral earnings, grouped by the invited user that generated them. Query
  // by my uid only (single-field, no composite index) and filter in memory.
  const earnByUser = {};
  let totalEarned = 0;
  try {
    const ledSnap = await db.collection("pointsLedger").where("uid", "==", uid).limit(5000).get();
    for (const d of ledSnap.docs) {
      const r = d.data();
      if (r.taskType !== "referral") continue;
      const src = r.sourceUid || "unknown";
      earnByUser[src] = (earnByUser[src] || 0) + (r.points || 0);
      totalEarned += r.points || 0;
    }
  } catch (e) {
    console.warn("getMyReferrals ledger read failed:", e.message);
  }

  const rows = referredSnap.docs
    .map((d) => {
      const u = d.data();
      return {
        uid: d.id,
        name: u.displayName || u.xHandle || "Anon",
        wallet: u.walletAddress || "",
        theirPoints: u.points || 0,
        earnedFromThem: earnByUser[d.id] || 0,
        joinedAt: toMs(u.createdAt),
      };
    })
    .sort((a, b) => b.earnedFromThem - a.earnedFromThem || (b.joinedAt || 0) - (a.joinedAt || 0));

  return { count: rows.length, totalEarned, rows };
});

// Bind the caller to a referrer via referral code. Set-once, no self-referral.
const setReferrer = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const code = String(request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing referral code.");

  const codeSnap = await db.collection("referralCodes").doc(code).get();
  if (!codeSnap.exists) throw new HttpsError("not-found", "That referral code doesn't exist.");
  const referrerUid = codeSnap.data().uid;
  if (referrerUid === uid) {
    throw new HttpsError("failed-precondition", "You can't refer yourself.");
  }

  const userRef = db.collection("users").doc(uid);
  const referrerRef = db.collection("users").doc(referrerUid);
  const result = await db.runTransaction(async (tx) => {
    const [userSnap, referrerSnap] = await Promise.all([tx.get(userRef), tx.get(referrerRef)]);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Complete sign-in first.");
    if (!referrerSnap.exists) throw new HttpsError("not-found", "Referrer not found.");
    if (userSnap.data().referredBy) {
      throw new HttpsError("already-exists", "You already have a referrer set.");
    }
    tx.set(userRef, { referredBy: referrerUid }, { merge: true });
    tx.set(referrerRef, { referralCount: FieldValue.increment(1) }, { merge: true });
    return { ok: true };
  });
  return result;
});

// Save / update wallet address. Enforces global uniqueness (one wallet/user).
// If the caller's profile doc doesn't exist yet (e.g. ensureProfile hadn't run),
// create it here so a first-time save never fails. Unexpected errors are
// rethrown with their real message so the UI shows the actual cause.
const setWallet = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  try {
    const checksummed = normalizeAddress(request.data?.walletAddress);
    const lower = lc(checksummed);
    const userRef = db.collection("users").doc(uid);
    const indexRef = db.collection("walletIndex").doc(lower);

    // Make sure a profile exists (self-heal instead of erroring).
    const pre = await userRef.get();
    if (!pre.exists) {
      await userRef.set(
        newProfile({
          uid,
          displayName: request.auth.token.name || "",
          email: request.auth.token.email || "",
          providerData: [{ providerId: request.auth.token.firebase?.sign_in_provider || "google" }],
        }),
      );
    }

    await db.runTransaction(async (tx) => {
      const [idxSnap, userSnap] = await Promise.all([tx.get(indexRef), tx.get(userRef)]);
      if (idxSnap.exists && idxSnap.data().uid !== uid) {
        throw new HttpsError("already-exists", "That wallet address is already linked to another account.");
      }
      const prev = userSnap.exists ? userSnap.data().walletAddress : null;
      if (prev && lc(prev) !== lower) {
        tx.delete(db.collection("walletIndex").doc(lc(prev)));
      }
      tx.set(indexRef, { uid, at: FieldValue.serverTimestamp() });
      tx.set(userRef, { walletAddress: checksummed }, { merge: true });
    });

    return { walletAddress: checksummed };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("setWallet failed:", e);
    throw new HttpsError("internal", `Wallet save failed: ${e.message}`);
  }
});

// Whitelist of fields ever sent to the client.
function publicProfile(d = {}) {
  return {
    displayName: d.displayName || "",
    email: d.email || "",
    authProviders: d.authProviders || [],
    xUserId: d.xUserId || null,
    xHandle: d.xHandle || null,
    igHandle: d.igHandle || null,
    walletAddress: d.walletAddress || null,
    points: d.points || 0,
    followXDone: d.followXDone || false,
    followIgDone: d.followIgDone || false,
    createdAt: d.createdAt || null,
    lastFaucetAt: d.lastFaucetAt || null,
    lastSwapAt: d.lastSwapAt || null,
    lastTxAt: d.lastTxAt || null,
    lastTweetTaskAt: d.lastTweetTaskAt || null,
    referralCode: d.referralCode || null,
    referredBy: d.referredBy || null,
    referralCount: d.referralCount || 0,
    referralPointsEarned: d.referralPointsEarned || 0,
  };
}

module.exports = {
  ensureProfile,
  getMe,
  setReferrer,
  setWallet,
  setDisplayName,
  getMyReferrals,
  publicProfile,
  ensureProfileDoc,
  providersFromToken,
};
