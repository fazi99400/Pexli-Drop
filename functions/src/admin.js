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

// --- Analytics dashboard ----------------------------------------------------
// One call returns everything the admin dashboard charts need. All time-series
// come from the pointsLedger event log (every earn writes {uid,taskType,points,
// createdAt}); user-shape metrics come from a single users scan; all-time
// per-task totals use cheap count() aggregations (single-field taskType filter,
// so no composite index is ever required).
const STAT_TASKS = [
  "swap",
  "tx",
  "faucet",
  "tweet",
  "follow_x",
  "follow_ig",
  "medium",
  "youtube",
  "tiktok",
  "instagram",
  "review",
  "referral",
];

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7); // YYYY-MM (UTC)

const adminStats = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const days = Math.min(180, Math.max(7, Math.trunc(Number(request.data?.days) || 30)));

  const now = Date.now();
  const rangeCutoff = now - days * 86400000;
  // Always scan back at least to the start of the current calendar month so the
  // "this month" headline numbers are exact even on a short (7-day) range.
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const scanCutoff = Math.min(rangeCutoff, monthStart);
  const curMonth = monthKey(now);

  // --- 1. Users scan (one pass → many metrics) ------------------------------
  const usersSnap = await db.collection("users").limit(50000).get();
  const users = {
    total: usersSnap.size,
    activated: 0, // has a wallet
    google: 0,
    twitter: 0,
    withXHandle: 0,
    withIgHandle: 0,
    totalPoints: 0,
    referralPoints: 0,
  };
  const signupsByDay = {};
  for (const doc of usersSnap.docs) {
    const u = doc.data();
    users.totalPoints += u.points || 0;
    users.referralPoints += u.referralPointsEarned || 0;
    if (u.walletAddress) users.activated += 1;
    const provs = u.authProviders || [];
    if (provs.includes("google")) users.google += 1;
    if (provs.includes("twitter") || u.xHandle) users.twitter += 1;
    if (u.xHandle) users.withXHandle += 1;
    if (u.igHandle) users.withIgHandle += 1;
    const created = tsToMs(u.createdAt);
    if (created && created >= scanCutoff) {
      const k = dayKey(created);
      signupsByDay[k] = (signupsByDay[k] || 0) + 1;
    }
  }

  // --- 2. Ledger window scan (time-series) ----------------------------------
  let ledgerDocs = [];
  try {
    const snap = await db
      .collection("pointsLedger")
      .where("createdAt", ">=", Timestamp.fromMillis(scanCutoff))
      .orderBy("createdAt", "desc")
      .limit(30000)
      .get();
    ledgerDocs = snap.docs;
  } catch (e) {
    // If the range index isn't ready, fall back to a plain recent scan.
    const snap = await db.collection("pointsLedger").limit(30000).get();
    ledgerDocs = snap.docs;
  }

  // Per-day buckets keyed by date, plus per-month social/content buckets and a
  // per-task breakdown within the scanned window.
  const dayBuckets = {}; // date -> { active:Set, points, swap, tx, faucet, tweet, follow, content }
  const monthBuckets = {}; // month -> { follow_x, follow_ig, medium, youtube, tiktok, instagram, review, swap, tx }
  const taskWindow = {}; // taskType -> { count, points }
  const thisMonth = {};
  for (const t of STAT_TASKS) thisMonth[t] = 0;

  const bumpMonth = (mk, field) => {
    const m = (monthBuckets[mk] = monthBuckets[mk] || {});
    m[field] = (m[field] || 0) + 1;
  };

  for (const doc of ledgerDocs) {
    const r = doc.data();
    const ms = tsToMs(r.createdAt);
    if (!ms) continue;
    const type = r.taskType || "other";
    const pts = r.points || 0;

    const tw = (taskWindow[type] = taskWindow[type] || { count: 0, points: 0 });
    tw.count += 1;
    tw.points += pts;

    const mk = monthKey(ms);
    if (STAT_TASKS.includes(type)) bumpMonth(mk, type);
    if (mk === curMonth && type in thisMonth) thisMonth[type] += 1;

    // Daily buckets only within the requested display range.
    if (ms >= rangeCutoff) {
      const k = dayKey(ms);
      const b = (dayBuckets[k] = dayBuckets[k] || {
        active: new Set(),
        points: 0,
        swap: 0,
        tx: 0,
        faucet: 0,
        tweet: 0,
        follow: 0,
        content: 0,
      });
      if (r.uid) b.active.add(r.uid);
      b.points += pts;
      if (type === "swap") b.swap += 1;
      else if (type === "tx") b.tx += 1;
      else if (type === "faucet") b.faucet += 1;
      else if (type === "tweet") b.tweet += 1;
      else if (type === "follow_x" || type === "follow_ig") b.follow += 1;
      else if (["medium", "youtube", "tiktok", "instagram", "review"].includes(type)) b.content += 1;
    }
  }

  // Contiguous daily array (fill zero days) for the display range.
  const daily = [];
  for (let t = now - (days - 1) * 86400000; t <= now; t += 86400000) {
    const k = dayKey(t);
    const b = dayBuckets[k];
    daily.push({
      date: k,
      activeUsers: b ? b.active.size : 0,
      points: b ? b.points : 0,
      swaps: b ? b.swap : 0,
      txs: b ? b.tx : 0,
      faucets: b ? b.faucet : 0,
      tweets: b ? b.tweet : 0,
      follows: b ? b.follow : 0,
      content: b ? b.content : 0,
      signups: signupsByDay[k] || 0,
    });
  }

  // Monthly array (last 6 months, oldest→newest) for the social/content view.
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const mk = monthKey(dt.getTime());
    const m = monthBuckets[mk] || {};
    monthly.push({
      month: mk,
      follow_x: m.follow_x || 0,
      follow_ig: m.follow_ig || 0,
      medium: m.medium || 0,
      youtube: m.youtube || 0,
      tiktok: m.tiktok || 0,
      instagram: m.instagram || 0,
      review: m.review || 0,
      swap: m.swap || 0,
      tx: m.tx || 0,
    });
  }

  // --- 3. All-time totals via count() aggregation (exact, index-free) -------
  const allTime = {};
  await Promise.all(
    STAT_TASKS.map(async (t) => {
      try {
        const agg = await db.collection("pointsLedger").where("taskType", "==", t).count().get();
        allTime[t] = agg.data().count;
      } catch (e) {
        allTime[t] = (taskWindow[t] && taskWindow[t].count) || 0; // fallback: window count
      }
    }),
  );
  let ledgerTotal = 0;
  try {
    ledgerTotal = (await db.collection("pointsLedger").count().get()).data().count;
  } catch (e) {
    ledgerTotal = ledgerDocs.length;
  }

  // Task breakdown table (windowed).
  const taskBreakdown = Object.entries(taskWindow)
    .map(([taskType, v]) => ({ taskType, count: v.count, points: v.points }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: now,
    days,
    users,
    allTime, // per-task lifetime counts + we also expose derived headline below
    thisMonth, // current calendar month per-task counts
    ledgerTotal,
    daily,
    monthly,
    taskBreakdown,
  };
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
  adminStats,
};
