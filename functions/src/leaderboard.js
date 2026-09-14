// Leaderboard: a public top-100 ranking, and a daily rank-tier bonus.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db } = require("./init");
const { CALL_OPTS, requireAuth } = require("./callable");
const { getConfig } = require("./config");
const { awardPoints } = require("./points");

// Points a given rank earns in the daily distribution.
function rewardForRank(rank, r) {
  if (rank === 1) return r.rank1;
  if (rank === 2) return r.rank2;
  if (rank === 3) return r.rank3;
  if (rank <= 10) return r.top10;
  if (rank <= 50) return r.top50;
  if (rank <= 100) return r.top100;
  return 0;
}

// Top 100 users by points (safe fields only), for the leaderboard UI.
const getLeaderboard = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  const snap = await db.collection("users").orderBy("points", "desc").limit(100).get();
  return snap.docs.map((d, i) => {
    const u = d.data();
    return {
      rank: i + 1,
      uid: d.id, // lets the client highlight the viewer's own row
      // Prefer the name the user set for themselves, then their X handle.
      name: u.displayName || u.xHandle || "Anon",
      points: u.points || 0,
    };
  });
});

// Daily job: rank everyone, award the rank-tier bonus. Idempotent per day
// (ledger refId includes the date), so a re-run never double-pays.
const dailyLeaderboardRewards = onSchedule(
  { schedule: "every 24 hours", region: "us-central1" },
  async () => {
    const config = await getConfig();
    if (!config.leaderboard || !config.leaderboard.enabled) return;
    const rewards = config.leaderboard.rewards;
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

    const snap = await db.collection("users").orderBy("points", "desc").limit(100).get();
    let rank = 0;
    let awarded = 0;
    for (const doc of snap.docs) {
      rank += 1;
      const bonus = rewardForRank(rank, rewards);
      if (bonus <= 0) continue;
      try {
        await awardPoints({
          uid: doc.id,
          taskType: "leaderboard",
          points: bonus,
          refId: `${doc.id}:${dateStr}`,
        });
        awarded += 1;
      } catch (e) {
        // "already-exists" = already paid today; anything else we log and skip.
        if (e.code !== "already-exists") {
          console.error("leaderboard award failed", doc.id, e.message);
        }
      }
    }
    console.log(`Leaderboard ${dateStr}: ranked ${snap.size}, awarded ${awarded}.`);
  },
);

module.exports = { getLeaderboard, dailyLeaderboardRewards };
