// awardPoints — the ONE place points are ever written.
//
// Runs in a Firestore transaction so a ledger row, the cached user total, and
// per-task cooldown/cursor updates all commit together (or not at all). The
// ledger doc id is deterministic (hash of taskType + refId) which makes every
// award idempotent: the same tweet id / tx hash / link can never be counted
// twice, even under a double-clicked "Verify" button.
//
// Referral bonus: when the earning user was referred by someone, the referrer
// gets `referral.percent`% of the award. It's written in the SAME transaction
// off the same unique source id, so it too is exactly-once.
const { db, FieldValue, Timestamp } = require("./init");
const { sha256 } = require("./util");
const { getConfig } = require("./config");
const { HttpsError } = require("firebase-functions/v2/https");
const { requireNotBlocked } = require("./callable");

function ledgerId(taskType, refId) {
  return sha256(`${taskType}:${refId}`);
}

// Read what the referral payout needs to know about the referrer, INSIDE the
// transaction's read phase (Firestore needs every read before any write).
// ambassadorStatus/{uid} is a tiny, rarely-written doc ({active, sponsorUid})
// kept in sync by src/ambassador.js, so reading it adds no contention on the
// busy users/{referrer} doc. Returns null when there is no referrer.
async function readReferralCtx(tx, referredData, earnerUid) {
  const referrerUid = referredData?.referredBy;
  if (!referrerUid) return null;
  const st = await tx.get(db.collection("ambassadorStatus").doc(referrerUid));
  const s = st.exists ? st.data() : {};
  const isAmb = s.active === true;
  let sponsorUid = null;
  // Team share only flows through an ACTIVE ambassador to an ACTIVE sponsor,
  // and never back to the person who earned the points.
  if (isAmb && s.sponsorUid && s.sponsorUid !== earnerUid && s.sponsorUid !== referrerUid) {
    const sp = await tx.get(db.collection("ambassadorStatus").doc(s.sponsorUid));
    if (sp.exists && sp.data().active === true) sponsorUid = s.sponsorUid;
  }
  return { referrerUid, isAmb, sponsorUid };
}

/**
 * Apply the referral bonus (and the ambassador team share) for an award,
 * inside an open transaction, AFTER readReferralCtx ran in the read phase.
 * Uses writes only. Both rows use deterministic ids derived from the unique
 * source ledger id, so they are exactly-once together with the source award.
 *
 * Two levels, never deeper:
 *   member earns X → referrer gets percent% of X (15% if an active ambassador)
 *                  → that ambassador's sponsor gets teamSharePercent% of X
 * Neither row triggers anything further.
 * @returns {number} bonus points granted to the referrer (0 if none).
 */
function applyReferralInTx(tx, referredData, amount, sourceId, config, ctx) {
  const referralCfg = config?.referral;
  if (!referralCfg?.enabled || !ctx || !ctx.referrerUid || amount <= 0) return 0;
  const amb = config.ambassador || {};
  const pct = ctx.isAmb ? Number(amb.ambassadorReferralPercent) || 0 : Number(referralCfg.percent) || 0;
  const bonus = Math.floor((amount * pct) / 100);
  if (bonus > 0) {
    tx.set(db.collection("pointsLedger").doc(ledgerId("referral", sourceId)), {
      uid: ctx.referrerUid,
      taskType: "referral",
      points: bonus,
      refId: sourceId,
      status: "final",
      sourceUid: referredData.__uid || null,
      percent: pct,
      createdAt: Timestamp.now(),
    });
    tx.set(
      db.collection("users").doc(ctx.referrerUid),
      { points: FieldValue.increment(bonus), referralPointsEarned: FieldValue.increment(bonus) },
      { merge: true },
    );
  }
  if (ctx.sponsorUid) {
    const share = Math.floor((amount * (Number(amb.teamSharePercent) || 0)) / 100);
    if (share > 0) {
      tx.set(db.collection("pointsLedger").doc(ledgerId("team_share", sourceId)), {
        uid: ctx.sponsorUid,
        taskType: "team_share",
        points: share,
        refId: sourceId,
        status: "final",
        sourceUid: referredData.__uid || null,
        viaUid: ctx.referrerUid, // the recruited ambassador whose member earned it
        createdAt: Timestamp.now(),
      });
      tx.set(
        db.collection("users").doc(ctx.sponsorUid),
        { points: FieldValue.increment(share), teamPointsEarned: FieldValue.increment(share) },
        { merge: true },
      );
    }
  }
  return bonus;
}

// Award types that are NOT a completed task (bonuses, shares, adjustments):
// they don't bump the user's tasksDone counter shown on an ambassador's team.
const NON_TASK_TYPES = new Set([
  "referral",
  "team_share",
  "leaderboard",
  "ambassador_tier",
  "sponsor_milestone",
  "admin_adjust",
]);

/**
 * @param {object} p
 * @param {string} p.uid
 * @param {string} p.taskType
 * @param {number} p.points
 * @param {string} p.refId              unique reference (tweet id, tx hash, url…)
 * @param {object} [p.userUpdates]      extra fields to set on users/{uid}
 * @param {"final"|"pending"} [p.status] pending = awaits admin approval; no
 *                                       points added to the cached total yet.
 * @param {boolean} [p.noReferral]     skip the referral/team share (program
 *                                       bonuses must never cascade).
 * @param {object} [p.extra]             extra fields stored on the ledger row
 *                                       itself (e.g. the submitted tweet URL /
 *                                       handle) so a human reviewer in
 *                                       Admin → Moderation has something to
 *                                       actually check, not just a bare refId.
 * @returns {Promise<{points:number, awarded:number, status:string}>}
 */
async function awardPoints({
  uid,
  taskType,
  points,
  refId,
  userUpdates = {},
  status = "final",
  extra = {},
  noReferral = false,
}) {
  if (!uid || !taskType || !refId) {
    throw new HttpsError("internal", "awardPoints called without uid/taskType/refId.");
  }
  const amount = Number(points) || 0;
  const config = await getConfig();
  const userRef = db.collection("users").doc(uid);
  const mainId = ledgerId(taskType, refId);
  const ledgerRef = db.collection("pointsLedger").doc(mainId);

  return db.runTransaction(async (tx) => {
    const [ledgerSnap, userSnap] = await Promise.all([tx.get(ledgerRef), tx.get(userRef)]);

    if (ledgerSnap.exists) {
      throw new HttpsError("already-exists", "You have already been credited for this.");
    }
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "User profile not found.");
    }
    const userData = userSnap.data();
    requireNotBlocked(userData); // blocked accounts earn nothing, app-wide

    // Referral bonus only on final (credited) awards, never off a referral
    // row itself (no chains), and never for program bonuses. Reads first.
    const payReferral = status === "final" && taskType !== "referral" && !noReferral && amount > 0;
    const refCtx = payReferral ? await readReferralCtx(tx, userData, uid) : null;

    tx.set(ledgerRef, {
      uid,
      taskType,
      points: amount,
      refId,
      status, // "final" | "pending"
      ...extra,
      createdAt: Timestamp.now(),
    });

    const update = { ...userUpdates };
    if (status === "final") {
      update.points = FieldValue.increment(amount);
      if (!NON_TASK_TYPES.has(taskType)) update.tasksDone = FieldValue.increment(1);
    }
    tx.set(userRef, update, { merge: true });

    if (refCtx) applyReferralInTx(tx, { ...userData, __uid: uid }, amount, mainId, config, refCtx);

    const current = userData.points || 0;
    return {
      points: status === "final" ? current + amount : current,
      awarded: status === "final" ? amount : 0,
      status,
    };
  });
}

// Admin points adjustment (positive or negative, total clamped at >= 0) with
// an audit ledger row. Shared by the adjustPoints callable and the
// ambassador program's fraud forfeiture, so both go through one path.
async function adjustPointsCore(uid, delta, reason) {
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
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
}

module.exports = {
  awardPoints,
  ledgerId,
  readReferralCtx,
  applyReferralInTx,
  adjustPointsCore,
  NON_TASK_TYPES,
};
