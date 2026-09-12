// On-chain task verification: faucet claim (24h), Lifelox swap (12h),
// periodic transaction (1h). Each uses a stored cursor so activity is never
// double-counted and repeat "Verify" clicks inside the lock window are cheap.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const chain = require("../chain");
const params = require("../params");
const { hoursSince } = require("../util");

function requireWallet(user) {
  if (!user.walletAddress) {
    throw new HttpsError("failed-precondition", "Save your wallet address first.");
  }
  return user.walletAddress;
}

function requireCooldown(lastTs, lockHrs, label) {
  const elapsed = hoursSince(lastTs);
  if (elapsed < lockHrs) {
    const remain = Math.ceil((lockHrs - elapsed) * 60);
    throw new HttpsError(
      "failed-precondition",
      `${label} is on cooldown. Try again in about ${remain} min.`,
    );
  }
}

// --- Faucet claim -----------------------------------------------------------
const verifyFaucet = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("faucet");
  const { data: user } = await loadUser(uid);
  const wallet = requireWallet(user);
  requireCooldown(user.lastFaucetAt, config.locks.faucetHrs, "Faucet claim");

  const faucet = params.FAUCET_ADDRESS.value();
  if (!faucet) {
    throw new HttpsError("failed-precondition", "Faucet address not configured yet.");
  }
  const sinceBlock = user.lastCheckedBlock || 0;
  const match = await chain.findIncomingFrom(wallet, faucet, sinceBlock);
  if (!match) {
    throw new HttpsError(
      "not-found",
      "No new faucet claim found for your wallet. Claim at faucet.pex.li, then verify.",
    );
  }

  const result = await awardPoints({
    uid,
    taskType: "faucet",
    points: config.points.faucet,
    refId: match.hash,
    userUpdates: {
      lastFaucetAt: Timestamp.now(),
      lastCheckedBlock: Math.max(sinceBlock, match.blockNumber),
    },
  });
  return { ok: true, ...result, txHash: match.hash };
});

// --- Swap on Lifelox DEX ----------------------------------------------------
const verifySwap = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("swap");
  const { data: user } = await loadUser(uid);
  const wallet = requireWallet(user);
  requireCooldown(user.lastSwapAt, config.locks.swapHrs, "Swap");

  const router = params.DEX_ROUTER_ADDRESS.value();
  if (!router) {
    throw new HttpsError("failed-precondition", "DEX router address not configured yet.");
  }
  const sinceBlock = user.lastCheckedBlock || 0;
  const match = await chain.findOutgoingTo(wallet, router, sinceBlock);
  if (!match) {
    throw new HttpsError(
      "not-found",
      "No new swap found on Lifelox for your wallet. Swap at lifelox.xyz, then verify.",
    );
  }

  const result = await awardPoints({
    uid,
    taskType: "swap",
    points: config.points.swap,
    refId: match.hash,
    userUpdates: {
      lastSwapAt: Timestamp.now(),
      lastCheckedBlock: Math.max(sinceBlock, match.blockNumber),
    },
  });
  return { ok: true, ...result, txHash: match.hash };
});

// --- Periodic transaction (>= 1 per hour) -----------------------------------
// Nonce-based: cheap, RPC-only, no explorer needed. If the outbound tx count
// grew since we last stored it, the user made at least one new transaction.
// Task: the user sends PEX from their wallet TO the Pexli address (the faucet
// EOA by default). Verified via the explorer as an outbound tx to that address
// with a positive value, since the stored cursor. Repeats hourly.
const verifyTx = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("tx");
  const { data: user } = await loadUser(uid);
  const wallet = requireWallet(user);
  requireCooldown(user.lastTxAt, config.locks.txHrs, "Transaction reward");

  const target = params.TX_TARGET_ADDRESS.value();
  if (!target) {
    throw new HttpsError("failed-precondition", "Transaction target not configured yet.");
  }
  const sinceBlock = user.lastCheckedBlock || 0;
  const match = await chain.findOutgoingTo(wallet, target, sinceBlock, true);
  if (!match) {
    throw new HttpsError(
      "not-found",
      "No new PEX transfer to the Pexli address found. Send PEX to it, then verify.",
    );
  }

  const result = await awardPoints({
    uid,
    taskType: "tx",
    points: config.points.tx,
    refId: match.hash,
    userUpdates: {
      lastTxAt: Timestamp.now(),
      lastCheckedBlock: Math.max(sinceBlock, match.blockNumber),
    },
  });
  return { ok: true, ...result, txHash: match.hash };
});

module.exports = { verifyFaucet, verifySwap, verifyTx };
