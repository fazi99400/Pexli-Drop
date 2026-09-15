// Pexli Airdrop — Cloud Functions entry point.
//
// DEPLOY MARKER: 2026-09-13-r2  (bump this string to force firebase to redeploy
// all functions when it would otherwise report "No changes detected" — e.g.
// after a failed deploy left stale serving revisions while the stored source
// hash was already advanced).
//
// Every exported name becomes a deployed function. Grouped by phase:
//   profile   — user lifecycle + wallet (Phase 1/3)
//   onchain   — faucet / swap / tx verification (Phase 4)
//   links     — content-link submission (Phase 5)
//   x         — OAuth connect, follow, tweet pool (Phase 6)
//   admin     — config, moderation, export, bootstrap (Phase 2/7)
//   scheduled — cron cleanup
//
// All point writes flow through src/points.js in a transaction. The client
// never writes points — see firestore.rules.

// Keep the whole deployment within the project's Cloud Run CPU quota: ~40
// functions each become a Cloud Run service, so cap max instances/CPU so the
// total reserved CPU stays sane. Sized for ~1,200–3,000 daily users (2026-09
// capacity pass) — see the maxInstances note below before raising further.
const { setGlobalOptions } = require("firebase-functions/v2");
// A new GCP project ships with a SMALL Cloud Run CPU quota per region, and each
// function is its own Cloud Run service. The deploy-time quota check is roughly
// sum(maxInstances * cpu) across services — Cloud Functions v2's own default
// (maxInstances:100) blows past a small quota immediately, which is why every
// function here sets an explicit, deliberately small ceiling instead.
//
// Every function defaults to a FRACTIONAL cpu (0.5), which Cloud Run requires
// pairing with concurrency:1 — fine for the fast Firestore handlers (each
// finishes in well under a second; extra traffic is handled by spinning up
// MORE instances, not more concurrency per instance). maxInstances:4 means up
// to 4 of these can run at once per function — comfortably above the realistic
// peak concurrent load at a few thousand daily users, since real traffic is
// spread across a day, not one instant.
//
// The two SLOW functions that hold a request open for several seconds —
// claimFaucet (sends PEX + waits) and verifyTxHash (polls for a receipt) —
// override this with cpu:1/concurrency:80/maxInstances:6 (set per-function,
// see src/tasks/faucet.js and src/tasks/verify.js) so they never serialize:
// 6 instances × 80 concurrent requests = 480 concurrent faucet/swap calls.
//
// Total reserved-CPU footprint at these settings: ~40×4×0.5 + 2×6×1 ≈ 92 vCPU
// — a large step up from the ~20 used to just barely fit the original tiny
// default quota, but nowhere near the ~2,400 the unmodified Cloud Functions
// defaults would have reserved. If a future deploy fails on CPU quota, dial
// maxInstances back down here first; if you need to go well past this, request
// a Cloud Run CPU quota increase in Google Cloud Console (IAM & Admin →
// Quotas, filter "Total allowable CPU", region us-central1) — that's the one
// step that needs a human in the Cloud Console, not something deployable.
setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  cpu: 0.5,
  maxInstances: 4,
  concurrency: 1,
});

require("./src/init");

const profile = require("./src/profile");
const links = require("./src/tasks/links");
const x = require("./src/tasks/x");
const social = require("./src/social");
const admin = require("./src/admin");
const scheduled = require("./src/scheduled");
const leaderboard = require("./src/leaderboard");

// Profile / auth
exports.ensureProfile = profile.ensureProfile;
exports.getMe = profile.getMe;
exports.setWallet = profile.setWallet;
exports.setReferrer = profile.setReferrer;
exports.setDisplayName = profile.setDisplayName;
exports.getMyReferrals = profile.getMyReferrals;

// On-chain tasks are now handled in-app: the faucet dispenses (claimFaucet),
// and swaps / "send PEX" are verified from the tx hash over RPC (verifyTxHash).
// The old explorer-based verifyFaucet/verifySwap/verifyTx are retired — their
// Cloud Run services are deleted in the deploy workflow to free CPU quota.

// In-app faucet dispenser (sends PEX from the faucet key to the user's wallet).
const faucet = require("./src/tasks/faucet");
exports.claimFaucet = faucet.claimFaucet;

// RPC-only tx verification (explorer has no API): verify a client tx hash.
const verify = require("./src/tasks/verify");
exports.verifyTxHash = verify.verifyTxHash;

// Link tasks
exports.submitLink = links.submitLink;

// Social (no paid API): handle entry, follow review queue, free tweet verify.
exports.setSocialHandle = social.setSocialHandle;
exports.submitFollow = social.submitFollow;
exports.verifyTweetPublic = social.verifyTweetPublic;
exports.assignTweet = x.assignTweet; // API-free: picks a random pool tweet

// Optional X OAuth connect (free — only to verify a real account). Works once a
// free X app's X_CLIENT_ID / X_CLIENT_SECRET are configured.
exports.xAuthStart = x.xAuthStart;
exports.xLoginStart = x.xLoginStart; // sign in / sign up with X (custom token)
exports.xCallback = x.xCallback;

// Admin
exports.updateConfig = admin.updateConfig;
exports.uploadTweets = admin.uploadTweets;
exports.setTweetActive = admin.setTweetActive;
exports.listPending = admin.listPending;
exports.approveSubmission = admin.approveSubmission;
exports.rejectSubmission = admin.rejectSubmission;
exports.listUsers = admin.listUsers;
exports.exportUsersCsv = admin.exportUsersCsv;
exports.grantAdmin = admin.grantAdmin;
exports.bootstrapAdmin = admin.bootstrapAdmin;
exports.adjustPoints = admin.adjustPoints;
exports.adminStats = admin.adminStats;
exports.seedBotUsers = admin.seedBotUsers;
exports.removeBotUsers = admin.removeBotUsers;
exports.blockUser = admin.blockUser;
exports.unblockUser = admin.unblockUser;
exports.setForceActivated = admin.setForceActivated;

// Leaderboard
exports.getLeaderboard = leaderboard.getLeaderboard;
exports.dailyLeaderboardRewards = leaderboard.dailyLeaderboardRewards;
exports.runLeaderboardRewards = leaderboard.runLeaderboardRewards;

// Scheduled
exports.expireTweetAssignments = scheduled.expireTweetAssignments;
