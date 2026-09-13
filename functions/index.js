// Pexli Airdrop — Cloud Functions entry point.
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

// Keep the whole deployment within a new project's default Cloud Run CPU quota:
// ~28 functions each become a Cloud Run service, so cap max instances and memory
// so the total reserved CPU stays small. Raise these (and/or request a quota
// bump) once the airdrop grows. Must run BEFORE the function modules are loaded.
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ region: "us-central1", memory: "256MiB", maxInstances: 2, concurrency: 80 });

require("./src/init");

const profile = require("./src/profile");
const onchain = require("./src/tasks/onchain");
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

// On-chain tasks
exports.verifyFaucet = onchain.verifyFaucet;
exports.verifySwap = onchain.verifySwap;
exports.verifyTx = onchain.verifyTx;

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

// Leaderboard
exports.getLeaderboard = leaderboard.getLeaderboard;
exports.dailyLeaderboardRewards = leaderboard.dailyLeaderboardRewards;

// Scheduled
exports.expireTweetAssignments = scheduled.expireTweetAssignments;
