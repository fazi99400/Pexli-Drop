// Scheduled (cron) jobs. Firebase Cloud Scheduler drives these.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, Timestamp } = require("./init");

// Expire stale "pending" tweet assignments (older than 2h) so the pool of
// least-assigned tweets stays fresh and users aren't stuck on one they never
// posted. Runs hourly. Tiny reads/writes only.
const expireTweetAssignments = onSchedule(
  { schedule: "every 60 minutes", region: "us-central1" },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
    const stale = await db
      .collection("tweetAssignments")
      .where("status", "==", "pending")
      .where("assignedAt", "<", cutoff)
      .limit(400)
      .get();
    if (stale.empty) return;
    const batch = db.batch();
    stale.docs.forEach((d) => batch.set(d.ref, { status: "expired" }, { merge: true }));
    await batch.commit();
    console.log(`Expired ${stale.size} stale tweet assignments.`);
  },
);

module.exports = { expireTweetAssignments };
