// Ambassador program — ONE callable (`ambassador`) with an `action` switch, so
// the whole program costs a single Cloud Run service against the CPU quota.
//
// Flow:
//   apply        user applies (X handle, region, language, audience, plan)
//   get          user's application + live community stats + tier progress
//   submitPost   approved ambassador submits an X post about Pexli; it goes
//                to Admin → Moderation as a pending ledger row (human-reviewed)
//   adminList    admin: list applications by status
//   adminReview  admin: approve / reject an application
//
// Community size = "verified members": people who joined with the
// ambassador's referral link AND saved a wallet (i.e. real, activated users),
// so follower counts and empty sign-ups don't count. Crossing a tier threshold
// pays a one-time points bonus (idempotent ledger id) and, for Lead/Champion,
// flags the ambassador as eligible for the post-funding cash reward.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, Timestamp } = require("./init");
const { CALL_OPTS, requireAuth, requireAdmin, loadUser, isCurrentlyBlocked } = require("./callable");
const { getConfig } = require("./config");
const { awardPoints } = require("./points");
const { normalizeUrl, sha256 } = require("./util");

const APPS = db.collection("ambassadors");
const TIER_ORDER = ["rising", "lead", "champion"];
const CASH_TIERS = new Set(["lead", "champion"]);
const STATS_TTL_MS = 10 * 60 * 1000; // recount verified members at most every 10 min

const toMs = (t) => (t && t.toMillis ? t.toMillis() : null);
const clip = (v, n) => String(v || "").trim().replace(/\s+/g, " ").slice(0, n);

// Monday-based ISO-ish week key, e.g. "2026-W40" — the weekly post cap resets on it.
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function publicApp(uid, d) {
  if (!d) return null;
  return {
    uid,
    status: d.status,
    xHandle: d.xHandle,
    region: d.region,
    language: d.language,
    audience: d.audience,
    plan: d.plan,
    community: d.community || "",
    note: d.note || "",
    tier: d.tier || "ambassador",
    cashEligible: !!d.cashEligible,
    verifiedMembers: d.verifiedMembers || 0,
    invited: d.invited || 0,
    postsThisWeek: d.week === weekKey() ? d.weekPosts || 0 : 0,
    appliedAt: toMs(d.appliedAt),
    reviewedAt: toMs(d.reviewedAt),
  };
}

// Count people referred by `uid`, and how many of them saved a wallet.
// Single-field equality query (auto-indexed, no composite index needed);
// select() keeps each read tiny. Bots and blocked accounts never count toward
// a tier — otherwise a banned farm could still pay out a tier bonus.
async function countCommunity(uid) {
  const snap = await db
    .collection("users")
    .where("referredBy", "==", uid)
    .select("walletAddress", "isBot", "blocked", "blockedUntil")
    .limit(20000)
    .get();
  let invited = 0;
  let verified = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (u.isBot || isCurrentlyBlocked(u)) continue;
    invited++;
    if (u.walletAddress) verified++;
  }
  return { invited, verified };
}

function tierFor(verified, thresholds) {
  let tier = "ambassador";
  for (const t of TIER_ORDER) if (verified >= (Number(thresholds[t]) || Infinity)) tier = t;
  return tier;
}

// Refresh stats on an approved application and pay any newly reached tier bonus.
async function refreshStats(uid, app, cfg) {
  const fresh = toMs(app.statsAt);
  if (fresh && Date.now() - fresh < STATS_TTL_MS) return app;
  let counts;
  try {
    counts = await countCommunity(uid);
  } catch (e) {
    console.warn("ambassador stats count failed:", e.message);
    return app; // show the last known stats rather than failing the page
  }
  const { invited, verified } = counts;
  const tier = tierFor(verified, cfg.tiers);
  const upd = {
    invited,
    verifiedMembers: verified,
    tier,
    cashEligible: CASH_TIERS.has(tier),
    statsAt: Timestamp.now(),
  };
  await APPS.doc(uid).set(upd, { merge: true });

  // One-time bonus for every tier reached so far. The deterministic ledger id
  // (taskType + refId) makes each bonus exactly-once even under concurrent
  // refreshes; `bonusPaid` just skips the no-op transactions on later views.
  const reached = TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier) + 1);
  const paid = { ...(app.bonusPaid || {}) };
  let paidChanged = false;
  for (const t of reached) {
    if (paid[t]) continue;
    const pts = Number(cfg.tierBonus[t]) || 0;
    if (pts <= 0) continue;
    try {
      await awardPoints({ uid, taskType: "ambassador_tier", points: pts, refId: `${t}:${uid}` });
      paid[t] = true;
      paidChanged = true;
    } catch (e) {
      if (e.code === "already-exists" || /already/i.test(e.message || "")) {
        paid[t] = true;
        paidChanged = true;
      } else {
        console.warn("tier bonus failed:", e.message);
      }
    }
  }
  if (paidChanged) {
    await APPS.doc(uid).set({ bonusPaid: paid }, { merge: true });
    upd.bonusPaid = paid;
  }
  return { ...app, ...upd };
}

async function doGet(uid, cfg) {
  const snap = await APPS.doc(uid).get();
  let app = snap.exists ? snap.data() : null;
  if (app && app.status === "approved") app = await refreshStats(uid, app, cfg);
  return { program: cfg, application: publicApp(uid, app) };
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

async function doApply(uid, data, cfg) {
  const { data: user } = await loadUser(uid);
  if (!user.walletAddress) {
    throw new HttpsError("failed-precondition", "Save your wallet on the dashboard before applying.");
  }
  const xHandle = clip(data.xHandle, 30).replace(/^@/, "");
  if (!HANDLE_RE.test(xHandle)) throw new HttpsError("invalid-argument", "Enter a valid X handle.");
  const region = clip(data.region, 60);
  const language = clip(data.language, 60);
  const audience = clip(data.audience, 200);
  const plan = clip(data.plan, 1200);
  const community = clip(data.community, 200);
  if (region.length < 2 || language.length < 2) {
    throw new HttpsError("invalid-argument", "Tell us your region and language.");
  }
  if (plan.length < 40) {
    throw new HttpsError("invalid-argument", "Describe your plan in a few sentences (40+ characters).");
  }

  const ref = APPS.doc(uid);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && ["pending", "approved"].includes(cur.data().status)) {
      throw new HttpsError("already-exists", `Your application is already ${cur.data().status}.`);
    }
    tx.set(ref, {
      uid,
      status: "pending",
      xHandle,
      region,
      language,
      audience,
      plan,
      community,
      displayName: user.displayName || "",
      email: user.email || "",
      wallet: user.walletAddress,
      referralCode: user.referralCode || "",
      appliedAt: Timestamp.now(),
      reviewedAt: null,
      note: "",
    });
  });
  return doGet(uid, cfg);
}

// X status URL → canonical https://x.com/<handle>/status/<id>
function canonicalXPost(raw) {
  let u;
  try {
    u = new URL(normalizeUrl(raw));
  } catch (e) {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^mobile\./, "");
  if (!["x.com", "twitter.com"].includes(host)) return null;
  const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/);
  if (!m) return null;
  return { url: `https://x.com/${m[1].toLowerCase()}/status/${m[2]}`, handle: m[1], id: m[2] };
}

// Reserve one slot of this week's cap atomically, so parallel submits can't
// both read "6 of 7 used" and slip past the limit. Returns the new count.
async function reserveWeeklySlot(ref, wk, cap) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== "approved") {
      throw new HttpsError("permission-denied", "Only approved ambassadors can submit posts.");
    }
    const app = snap.data();
    const used = app.week === wk ? app.weekPosts || 0 : 0;
    if (used >= cap) {
      throw new HttpsError("resource-exhausted", `Weekly limit reached (${cap} posts). Resets Monday.`);
    }
    tx.set(ref, { week: wk, weekPosts: used + 1 }, { merge: true });
    return used + 1;
  });
}

// Give a reserved slot back when the submission didn't go through.
async function releaseWeeklySlot(ref, wk) {
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const app = snap.exists ? snap.data() : {};
      if (app.week === wk && (app.weekPosts || 0) > 0) {
        tx.set(ref, { weekPosts: app.weekPosts - 1 }, { merge: true });
      }
    });
  } catch (e) {
    console.warn("releaseWeeklySlot failed:", e.message);
  }
}

async function doSubmitPost(uid, data, cfg) {
  await loadUser(uid); // blocked accounts can't submit (throws with details)
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "approved") {
    throw new HttpsError("permission-denied", "Only approved ambassadors can submit posts.");
  }
  const app = snap.data();
  const post = canonicalXPost(data.url);
  if (!post) throw new HttpsError("invalid-argument", "Paste a link to a single X post (x.com/…/status/…).");
  if (post.handle.toLowerCase() !== String(app.xHandle || "").toLowerCase()) {
    throw new HttpsError("invalid-argument", `The post must be from your ambassador account @${app.xHandle}.`);
  }

  const wk = weekKey();
  const cap = Number(cfg.weeklyPostCap) || 0;
  const count = await reserveWeeklySlot(ref, wk, cap);

  // Global duplicate guard (same collection the other link tasks use). If
  // anything after the reservation fails, hand the slot (and the link, if we
  // claimed it) back so a failed attempt never eats the user's weekly cap.
  const linkRef = db.collection("submittedLinks").doc(sha256(post.url));
  let linkClaimed = false;
  try {
    try {
      await linkRef.create({ uid, url: post.url, taskType: "ambassador_post", createdAt: Timestamp.now() });
      linkClaimed = true;
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message || "")) {
        throw new HttpsError("already-exists", "That post has already been submitted.");
      }
      throw e;
    }
    await awardPoints({
      uid,
      taskType: "ambassador_post",
      points: cfg.postPoints,
      refId: post.url,
      status: "pending",
      extra: { tweetUrl: post.url, handle: post.handle },
    });
  } catch (e) {
    if (linkClaimed) await linkRef.delete().catch(() => {});
    await releaseWeeklySlot(ref, wk);
    throw e;
  }
  return { ok: true, message: "Submitted. Points are credited after a human review.", postsThisWeek: count };
}

async function doAdminList(data) {
  const status = ["pending", "approved", "rejected"].includes(data.status) ? data.status : "pending";
  const snap = await APPS.where("status", "==", status).limit(300).get();
  const rows = snap.docs.map((d) => ({
    ...publicApp(d.id, d.data()),
    displayName: d.get("displayName") || "",
    email: d.get("email") || "",
    wallet: d.get("wallet") || "",
  }));
  rows.sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));
  return { rows };
}

async function doAdminReview(adminUid, data) {
  const uid = String(data.uid || "");
  const decision = data.decision === "approved" ? "approved" : data.decision === "rejected" ? "rejected" : null;
  if (!uid || !decision) throw new HttpsError("invalid-argument", "Missing uid or decision.");
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
  await ref.set(
    {
      status: decision,
      ...(decision === "rejected" ? { cashEligible: false } : {}),
      note: clip(data.note, 300),
      reviewedAt: Timestamp.now(),
      reviewedBy: adminUid,
      statsAt: null, // force a fresh count on next view
    },
    { merge: true },
  );
  return { ok: true };
}

const ambassador = onCall(CALL_OPTS, async (request) => {
  const action = String(request.data?.action || "get");
  const data = request.data || {};
  const cfg = (await getConfig()).ambassador;

  if (action === "adminList") {
    requireAdmin(request);
    return doAdminList(data);
  }
  if (action === "adminReview") {
    return doAdminReview(requireAdmin(request), data);
  }

  const uid = requireAuth(request);
  if (action === "get") return doGet(uid, cfg);
  if (!cfg.enabled) throw new HttpsError("failed-precondition", "The ambassador program is paused.");
  if (action === "apply") return doApply(uid, data, cfg);
  if (action === "submitPost") return doSubmitPost(uid, data, cfg);
  throw new HttpsError("invalid-argument", "Unknown action.");
});

module.exports = { ambassador, canonicalXPost, weekKey, tierFor };
