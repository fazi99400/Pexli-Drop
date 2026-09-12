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

function ledgerId(taskType, refId) {
  return sha256(`${taskType}:${refId}`);
}

/**
 * Apply the referral bonus for `referredData` inside an open transaction.
 * Uses increments only (no reads), so it's safe to call after other writes.
 * @returns {number} bonus points granted to the referrer (0 if none).
 */
function applyReferralInTx(tx, referredData, amount, sourceId, referralCfg) {
  if (!referralCfg?.enabled) return 0;
  const referrerUid = referredData?.referredBy;
  if (!referrerUid || amount <= 0) return 0;
  const bonus = Math.floor((amount * (Number(referralCfg.percent) || 0)) / 100);
  if (bonus <= 0) return 0;

  const refLedgerRef = db.collection("pointsLedger").doc(ledgerId("referral", sourceId));
  tx.set(refLedgerRef, {
    uid: referrerUid,
    taskType: "referral",
    points: bonus,
    refId: sourceId,
    status: "final",
    sourceUid: referredData.__uid || null,
    createdAt: Timestamp.now(),
  });
  tx.set(
    db.collection("users").doc(referrerUid),
    {
      points: FieldValue.increment(bonus),
      referralPointsEarned: FieldValue.increment(bonus),
    },
    { merge: true },
  );
  return bonus;
}

/**
 * @param {object} p
 * @param {string} p.uid
 * @param {string} p.taskType
 * @param {number} p.points
 * @param {string} p.refId              unique reference (tweet id, tx hash, url…)
 * @param {object} [p.userUpdates]      extra fields to set on users/{uid}
 * @param {"final"|"pending"} [p.status] pending = awaits admin approval; no
 *                                       points added to the cached total yet.
 * @returns {Promise<{points:number, awarded:number, status:string}>}
 */
async function awardPoints({ uid, taskType, points, refId, userUpdates = {}, status = "final" }) {
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

    tx.set(ledgerRef, {
      uid,
      taskType,
      points: amount,
      refId,
      status, // "final" | "pending"
      createdAt: Timestamp.now(),
    });

    const update = { ...userUpdates };
    if (status === "final") {
      update.points = FieldValue.increment(amount);
    }
    tx.set(userRef, update, { merge: true });

    // Referral bonus only on final (credited) awards, and never off a referral
    // row itself (no infinite chains).
    if (status === "final" && taskType !== "referral") {
      applyReferralInTx(tx, { ...userData, __uid: uid }, amount, mainId, config.referral);
    }

    const current = userData.points || 0;
    return {
      points: status === "final" ? current + amount : current,
      awarded: status === "final" ? amount : 0,
      status,
    };
  });
}

module.exports = { awardPoints, ledgerId, applyReferralInTx };
