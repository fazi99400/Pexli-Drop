// awardPoints — the ONE place points are ever written.
//
// Runs in a Firestore transaction so a ledger row, the cached user total, and
// per-task cooldown/cursor updates all commit together (or not at all). The
// ledger doc id is deterministic (hash of taskType + refId) which makes every
// award idempotent: the same tweet id / tx hash / link can never be counted
// twice, even under a double-clicked "Verify" button.
const { db, FieldValue, Timestamp } = require("./init");
const { sha256 } = require("./util");
const { HttpsError } = require("firebase-functions/v2/https");

function ledgerId(taskType, refId) {
  return sha256(`${taskType}:${refId}`);
}

/**
 * @param {object} p
 * @param {string} p.uid
 * @param {string} p.taskType
 * @param {number} p.points
 * @param {string} p.refId              unique reference (tweet id, tx hash, url…)
 * @param {object} [p.userUpdates]      extra fields to set on users/{uid}
 *                                      (e.g. { lastFaucetAt: FieldValue... })
 * @param {"final"|"pending"} [p.status] pending = awaits admin approval; no
 *                                       points added to the cached total yet.
 * @returns {Promise<{points:number, awarded:number, status:string}>}
 */
async function awardPoints({ uid, taskType, points, refId, userUpdates = {}, status = "final" }) {
  if (!uid || !taskType || !refId) {
    throw new HttpsError("internal", "awardPoints called without uid/taskType/refId.");
  }
  const amount = Number(points) || 0;
  const userRef = db.collection("users").doc(uid);
  const ledgerRef = db.collection("pointsLedger").doc(ledgerId(taskType, refId));

  return db.runTransaction(async (tx) => {
    const [ledgerSnap, userSnap] = await Promise.all([tx.get(ledgerRef), tx.get(userRef)]);

    if (ledgerSnap.exists) {
      throw new HttpsError(
        "already-exists",
        "You have already been credited for this.",
      );
    }
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "User profile not found.");
    }

    tx.set(ledgerRef, {
      uid,
      taskType,
      points: amount,
      refId,
      status, // "final" | "pending"
      createdAt: Timestamp.now(),
    });

    const update = { ...userUpdates };
    // Only pending-free (final) awards move the cached total. Pending awards
    // are added when an admin approves (see admin.approveSubmission).
    if (status === "final") {
      update.points = FieldValue.increment(amount);
    }
    tx.set(userRef, update, { merge: true });

    const current = userSnap.data().points || 0;
    return {
      points: status === "final" ? current + amount : current,
      awarded: status === "final" ? amount : 0,
      status,
    };
  });
}

module.exports = { awardPoints, ledgerId };
