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
};

const CONFIG_REF = db.collection("config").doc("global");

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
  };
}

module.exports = { getConfig, DEFAULT_CONFIG, CONFIG_REF };
