// Client-side mirror of the backend config defaults (functions/src/config.js).
// Used as a fallback so the dashboard renders fully even before the
// config/global doc exists or Firestore rules are deployed. Once the real doc
// is readable, the live snapshot replaces this.
export const DEFAULT_CONFIG = {
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
  locks: { swapHrs: 12, faucetHrs: 24, txHrs: 1, tweetMins: 30 },
  requiresApproval: { medium: true, youtube: true, tiktok: false, instagram: false, review: false },
  referral: { enabled: true, percent: 10 },
  faucet: { amountPex: "0.05" },
  autoApproveFollows: true,
  leaderboard: {
    enabled: true,
    rewards: { rank1: 200, rank2: 150, rank3: 100, top10: 75, top50: 50, top100: 30 },
  },
};
