// On-chain task verification: faucet claim (24h), Lifelox swap (12h),
// periodic transaction (1h). Each uses a stored cursor so activity is never
// double-counted and repeat "Verify" clicks inside the lock window are cheap.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const chain = require("../chain");
const params = require("../params");
const { hoursSince, lc: _lc } = require("../util");

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
const verifyTx = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("tx");
  const { data: user } = await loadUser(uid);
  const wallet = requireWallet(user);
  requireCooldown(user.lastTxAt, config.locks.txHrs, "Transaction reward");

  const nonce = await chain.getNonce(wallet);
  const cursor = user.txNonceCursor;
  if (cursor !== null && cursor !== undefined && nonce <= cursor) {
    throw new HttpsError(
      "not-found",
      "No new transaction since your last reward. Send a tx, then verify.",
    );
  }
  if (nonce === 0) {
    throw new HttpsError("not-found", "This wallet has made no transactions yet.");
  }

  const result = await awardPoints({
    uid,
    taskType: "tx",
    points: config.points.tx,
    refId: `${_lc(wallet)}:tx:${nonce}`,
    userUpdates: {
      lastTxAt: Timestamp.now(),
      txNonceCursor: nonce,
    },
  });
  return { ok: true, ...result, nonce };
});

module.exports = { verifyFaucet, verifySwap, verifyTx };
