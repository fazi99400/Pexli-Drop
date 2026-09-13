// Admin-only Cloud Functions. Every callable here checks the `admin` custom
// claim. Covers: config editing, tweet-pool upload, submission moderation,
// user listing, CSV export, and a token-guarded first-admin bootstrap.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { admin, db, FieldValue } = require("./init");
const { CALL_OPTS, requireAdmin } = require("./callable");
const { CONFIG_REF, DEFAULT_CONFIG, getConfig } = require("./config");
const { applyReferralInTx } = require("./points");

// Plain param (not Secret Manager) so a first deploy never blocks on it. When
// empty, the bootstrap endpoint is disabled (see the guard below).
const ADMIN_BOOTSTRAP_TOKEN = defineString("ADMIN_BOOTSTRAP_TOKEN", { default: "" });

// --- Config editing ---------------------------------------------------------
// Merge-patch config/global. Only known top-level sections are accepted, and
// values are coerced to the right primitive so the client can't inject junk.
const updateConfig = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const patch = request.data?.patch || {};
  const clean = {};

  if (patch.tasks) {
    clean.tasks = {};
    for (const k of Object.keys(DEFAULT_CONFIG.tasks)) {
      if (k in patch.tasks) clean.tasks[k] = Boolean(patch.tasks[k]);
    }
  }
  if (patch.points) {
    clean.points = {};
    for (const k of Object.keys(DEFAULT_CONFIG.points)) {
      if (k in patch.points) clean.points[k] = Math.max(0, Number(patch.points[k]) || 0);
    }
  }
  if (patch.locks) {
    clean.locks = {};
    for (const k of Object.keys(DEFAULT_CONFIG.locks)) {
      if (k in patch.locks) clean.locks[k] = Math.max(0, Number(patch.locks[k]) || 0);
    }
  }
  if (patch.requiresApproval) {
    clean.requiresApproval = {};
    for (const k of Object.keys(DEFAULT_CONFIG.requiresApproval)) {
      if (k in patch.requiresApproval) clean.requiresApproval[k] = Boolean(patch.requiresApproval[k]);
    }
  }
  if (patch.referral) {
    clean.referral = {};
    if ("enabled" in patch.referral) clean.referral.enabled = Boolean(patch.referral.enabled);
    if ("percent" in patch.referral) {
      clean.referral.percent = Math.min(100, Math.max(0, Number(patch.referral.percent) || 0));
    }
  }
  if ("autoApproveFollows" in patch) {
    clean.autoApproveFollows = Boolean(patch.autoApproveFollows);
  }
  if (patch.leaderboard) {
    clean.leaderboard = {};
    if ("enabled" in patch.leaderboard) {
      clean.leaderboard.enabled = Boolean(patch.leaderboard.enabled);
    }
    if (patch.leaderboard.rewards) {
      clean.leaderboard.rewards = {};
      for (const k of Object.keys(DEFAULT_CONFIG.leaderboard.rewards)) {
        if (k in patch.leaderboard.rewards) {
          clean.leaderboard.rewards[k] = Math.max(0, Number(patch.leaderboard.rewards[k]) || 0);
        }
      }
    }
  }
  await CONFIG_REF.set(clean, { merge: true });
  const fresh = await CONFIG_REF.get();
  return fresh.data();
});

// --- Tweet pool -------------------------------------------------------------
// Bulk-upload tweet texts (one per line). Batched in chunks of 400 to stay
// under Firestore's 500-writes-per-batch limit.
const uploadTweets = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const raw = String(request.data?.text || "");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 280);
  if (lines.length === 0) throw new HttpsError("invalid-argument", "No valid tweet lines found.");

  let written = 0;
  for (let i = 0; i < lines.length; i += 400) {
    const batch = db.batch();
    for (const text of lines.slice(i, i + 400)) {
      const ref = db.collection("tweetPool").doc();
      batch.set(ref, { text, active: true, timesAssigned: 0 });
      written++;
    }
    await batch.commit();
  }
  return { added: written };
});

const setTweetActive = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const { id, active } = request.data || {};
  if (!id) throw new HttpsError("invalid-argument", "Missing tweet id.");
  await db.collection("tweetPool").doc(id).set({ active: Boolean(active) }, { merge: true });
  return { ok: true };
});

// --- Submission moderation --------------------------------------------------
// List pending (awaiting-approval) ledger rows.
const listPending = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const base = db.collection("pointsLedger").where("status", "==", "pending");
  let snap;
  try {
    snap = await base.orderBy("createdAt", "desc").limit(100).get();
  } catch (e) {
    // Composite index may not be built yet — fall back to an unordered query.
    snap = await base.limit(100).get();
  }
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: tsToMs(d.data().createdAt) }));
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows;
});

// Approve a pending row: flip to final and move its points into the cached total.
const approveSubmission = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const id = request.data?.id;
  if (!id) throw new HttpsError("invalid-argument", "Missing ledger id.");
  const ledgerRef = db.collection("pointsLedger").doc(id);
  const config = await getConfig();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ledgerRef);
    if (!snap.exists) throw new HttpsError("not-found", "Submission not found.");
    const row = snap.data();
    if (row.status !== "pending") return; // idempotent
    const userRef = db.collection("users").doc(row.uid);
    const userSnap = await tx.get(userRef);
    const amount = row.points || 0;

    tx.set(ledgerRef, { status: "final" }, { merge: true });
    tx.set(userRef, { points: FieldValue.increment(amount) }, { merge: true });

    // Referral bonus finalizes together with the approved submission.
    if (userSnap.exists) {
      applyReferralInTx(tx, { ...userSnap.data(), __uid: row.uid }, amount, id, config.referral);
    }
  });
  return { ok: true };
});

// Reject a pending row: mark rejected, no points. The submittedLinks reservation
// stays so the same link can't be re-farmed.
const rejectSubmission = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const id = request.data?.id;
  if (!id) throw new HttpsError("invalid-argument", "Missing ledger id.");
  await db.collection("pointsLedger").doc(id).set({ status: "rejected" }, { merge: true });
  return { ok: true };
});

// --- Users ------------------------------------------------------------------
// Top users by points, or a simple search by handle/email/wallet.
const listUsers = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const search = String(request.data?.search || "").trim().toLowerCase();
  const limit = Math.min(Number(request.data?.limit) || 50, 200);

  let docs;
  if (search) {
    // Firestore has no substring search; match the common exact fields.
    const [byHandle, byEmail, byWallet] = await Promise.all([
      db.collection("users").where("xHandle", "==", search).limit(10).get(),
      db.collection("users").where("email", "==", search).limit(10).get(),
      db.collection("users").where("walletAddress", "==", request.data.search).limit(10).get(),
    ]);
    const seen = new Map();
    for (const s of [byHandle, byEmail, byWallet]) {
      s.docs.forEach((d) => seen.set(d.id, d));
    }
    docs = [...seen.values()];
  } else {
    const snap = await db.collection("users").orderBy("points", "desc").limit(limit).get();
    docs = snap.docs;
  }
  return docs.map((d) => publicRow(d.id, d.data()));
});

// CSV export for the eventual mainnet distribution. Returns the CSV as text.
const exportUsersCsv = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const snap = await db.collection("users").orderBy("points", "desc").limit(50000).get();
  const header = "uid,handle,email,wallet,points,providers,createdAt";
  const rows = snap.docs.map((d) => {
    const u = d.data();
    return [
      d.id,
      csv(u.xHandle),
      csv(u.email),
      csv(u.walletAddress),
      u.points || 0,
      csv((u.authProviders || []).join("|")),
      u.createdAt ? new Date(tsToMs(u.createdAt)).toISOString() : "",
    ].join(",");
  });
  return { csv: [header, ...rows].join("\n"), count: snap.size };
});

// Manually adjust a user's points (e.g. cut points from a fake follow after a
// later check). Positive or negative delta; the user's total never goes below 0.
// Every adjustment is logged to the ledger for auditability.
const adjustPoints = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const delta = Math.trunc(Number(request.data?.delta) || 0);
  const reason = String(request.data?.reason || "admin adjustment").slice(0, 200);
  if (!uid || delta === 0) throw new HttpsError("invalid-argument", "Need a uid and a non-zero delta.");

  const userRef = db.collection("users").doc(uid);
  const newTotal = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const cur = snap.data().points || 0;
    const applied = Math.max(delta, -cur); // clamp so total >= 0
    tx.set(userRef, { points: FieldValue.increment(applied) }, { merge: true });
    tx.set(db.collection("pointsLedger").doc(), {
      uid,
      taskType: "admin_adjust",
      points: applied,
      refId: `adjust:${Date.now()}`,
      status: "final",
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    return cur + applied;
  });
  return { ok: true, uid, points: newTotal };
});

// --- Admin bootstrap --------------------------------------------------------
// Grant the admin claim to another user (requires an existing admin).
const grantAdmin = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const email = String(request.data?.email || "").trim().toLowerCase();
  const makeAdmin = request.data?.admin !== false;
  if (!email) throw new HttpsError("invalid-argument", "Missing email.");
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: makeAdmin });
  return { ok: true, uid: user.uid, admin: makeAdmin };
});

// One-time HTTP bootstrap for the FIRST admin, guarded by a secret token.
// Usage: POST { token, email }. Set the secret first:
//   firebase functions:secrets:set ADMIN_BOOTSTRAP_TOKEN
const bootstrapAdmin = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("POST only");
    const token = req.body?.token || req.query?.token;
    const email = String(req.body?.email || req.query?.email || "").trim().toLowerCase();
    const configured = ADMIN_BOOTSTRAP_TOKEN.value();
    // Disabled until an admin bootstrap token is configured (never allow empty).
    if (!configured || !token || token !== configured) {
      return res.status(403).send("forbidden");
    }
    if (!email) return res.status(400).send("missing email");
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().setCustomUserClaims(user.uid, { admin: true });
      return res.status(200).json({ ok: true, uid: user.uid });
    } catch (e) {
      return res.status(404).json({ ok: false, error: e.message });
    }
  },
);

// --- helpers ----------------------------------------------------------------
function publicRow(uid, u) {
  return {
    uid,
    displayName: u.displayName || "",
    xHandle: u.xHandle || "",
    email: u.email || "",
    walletAddress: u.walletAddress || "",
    points: u.points || 0,
    authProviders: u.authProviders || [],
    createdAt: tsToMs(u.createdAt),
  };
}
function tsToMs(ts) {
  return ts && ts.toMillis ? ts.toMillis() : null;
}
function csv(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = {
  updateConfig,
  uploadTweets,
  setTweetActive,
  listPending,
  approveSubmission,
  rejectSubmission,
  listUsers,
  exportUsersCsv,
  grantAdmin,
  bootstrapAdmin,
  adjustPoints,
};
