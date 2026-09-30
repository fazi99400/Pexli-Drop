// config/global — the single source of truth for task toggles, point values,
// and time locks. Read by both the frontend and the functions.
const { db } = require("./init");

// Defaults straight from the build spec (§3 / §6). Seeded on first read so the
// admin panel always has something to edit.
const DEFAULT_CONFIG = {
  tasks: {
    tweet: true,
    follow_x: true,
    follow_ig: true,
    swap: true,
    faucet: true,
    tx: true,
    medium: true,
    youtube: true,
    tiktok: true,
    instagram: true,
    review: true,
  },
  points: {
    medium: 100,
    youtube: 80,
    tiktok: 50,
    instagram: 50,
    review: 40,
    swap: 30,
    faucet: 20,
    tx: 15,
    tweet: 10,
    follow_x: 15,
    follow_ig: 15,
  },
  locks: {
    swapHrs: 12,
    faucetHrs: 24,
    txHrs: 1,
    tweetMins: 30,
  },
  // Which link tasks require an admin to approve before points finalize.
  requiresApproval: {
    medium: true,
    youtube: true,
    tiktok: false,
    instagram: false,
    review: false,
  },
  // Referral rewards: the referrer earns `percent`% of every point their
  // referred users earn (spec addition). Editable in admin.
  referral: {
    enabled: true,
    percent: 10,
  },
  // In-app faucet: how much native PEX each claim sends (as an ether-string).
  // The claim cooldown is locks.faucetHrs; points are points.faucet.
  faucet: {
    amountPex: "0.05",
  },
  // "Send PEX to Pexli" task: fixed amount sent to TX_TARGET_ADDRESS (the
  // faucet address) with one click. Cooldown locks.txHrs; points points.tx.
  tx: {
    amountPex: "0.0004",
  },
  // Daily leaderboard bonus: every 24h, users are ranked by points and awarded
  // by rank tier (owner-defined). Editable in admin.
  leaderboard: {
    enabled: true,
    rewards: { rank1: 200, rank2: 150, rank3: 100, top10: 75, top50: 50, top100: 30 },
  },
  // Ambassador program (src/ambassador.js). Tier thresholds are VERIFIED
  // community members (referred users who saved a wallet). Lead/Champion are
  // eligible for the post-funding cash reward — a flag, not a payout.
  ambassador: {
    enabled: true,
    postPoints: 25,
    weeklyPostCap: 7,
    tiers: { rising: 500, lead: 5000, champion: 10000 },
    tierBonus: { rising: 2000, lead: 20000, champion: 50000 },
    // Mission/post points are multiplied by the ambassador's tier.
    tierMultiplier: { ambassador: 1, rising: 1.1, lead: 1.25, champion: 1.5 },
    // Referral share an ACTIVE approved ambassador earns on their own members'
    // points (normal users earn referral.percent).
    ambassadorReferralPercent: 15,
    // Team share: a sponsor earns this % of the points earned by the members
    // of the ambassadors they recruited. Two levels, never deeper.
    teamSharePercent: 3,
    // One-time sponsor bonuses when a recruited ambassador reaches N verified
    // members (m1/m2/m3 = member thresholds, bonus = points to the sponsor).
    sponsorMilestones: { m1: 100, m2: 500, m3: 1000 },
    sponsorMilestoneBonus: { m1: 1000, m2: 3000, m3: 5000 },
    // Activity rule: approved submissions needed per calendar month.
    activityMin: 4,
    // Monthly ambassador board: score = members gained x this + mission points.
    boardMemberPoints: 10,
  },
};

const CONFIG_REF = db.collection("config").doc("global");

// One-level-deep merge: nested objects (tiers, tierBonus, ...) are merged key
// by key so a partially saved section still has every default.
function mergeNested(defaults, saved) {
  const out = { ...defaults, ...saved };
  for (const [k, v] of Object.entries(defaults)) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = { ...v, ...(saved[k] || {}) };
  }
  return out;
}

// Read config, seeding defaults if the doc is missing. Shallow-merges so a
// newly added task/point key always has a default even on old configs.
async function getConfig() {
  const snap = await CONFIG_REF.get();
  if (!snap.exists) {
    await CONFIG_REF.set(DEFAULT_CONFIG, { merge: true });
    return DEFAULT_CONFIG;
  }
  const data = snap.data() || {};
  return {
    tasks: { ...DEFAULT_CONFIG.tasks, ...(data.tasks || {}) },
    points: { ...DEFAULT_CONFIG.points, ...(data.points || {}) },
    locks: { ...DEFAULT_CONFIG.locks, ...(data.locks || {}) },
    requiresApproval: {
      ...DEFAULT_CONFIG.requiresApproval,
      ...(data.requiresApproval || {}),
    },
    referral: { ...DEFAULT_CONFIG.referral, ...(data.referral || {}) },
    faucet: { ...DEFAULT_CONFIG.faucet, ...(data.faucet || {}) },
    tx: { ...DEFAULT_CONFIG.tx, ...(data.tx || {}) },
    leaderboard: {
      ...DEFAULT_CONFIG.leaderboard,
      ...(data.leaderboard || {}),
      rewards: {
        ...DEFAULT_CONFIG.leaderboard.rewards,
        ...((data.leaderboard || {}).rewards || {}),
      },
    },
    ambassador: mergeNested(DEFAULT_CONFIG.ambassador, data.ambassador || {}),
  };
}

module.exports = { getConfig, DEFAULT_CONFIG, CONFIG_REF };
