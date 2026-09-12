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
require("./src/init");

const profile = require("./src/profile");
const onchain = require("./src/tasks/onchain");
const links = require("./src/tasks/links");
const x = require("./src/tasks/x");
const admin = require("./src/admin");
const scheduled = require("./src/scheduled");

// Profile / auth
exports.onUserCreate = profile.onUserCreate;
exports.ensureProfile = profile.ensureProfile;
exports.getMe = profile.getMe;
exports.setWallet = profile.setWallet;

// On-chain tasks
exports.verifyFaucet = onchain.verifyFaucet;
exports.verifySwap = onchain.verifySwap;
exports.verifyTx = onchain.verifyTx;

// Link tasks
exports.submitLink = links.submitLink;

// X / Twitter
exports.xAuthStart = x.xAuthStart;
exports.xCallback = x.xCallback;
exports.verifyFollowX = x.verifyFollowX;
exports.assignTweet = x.assignTweet;
exports.verifyTweet = x.verifyTweet;

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

// Scheduled
exports.expireTweetAssignments = scheduled.expireTweetAssignments;
