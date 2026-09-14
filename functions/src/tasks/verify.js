// RPC-only transaction verification.
//
// The Pexli explorer has no API, so we verify on-chain actions straight from
// the RPC using the tx hash the in-app wallet already produced when it signed.
// Used by the "send PEX to Pexli" task and (later) in-app swaps.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const chain = require("../chain");
const params = require("../params");
const { hoursSince } = require("../util");

const TASK_META = {
  tx: { lockKey: "txHrs", lastKey: "lastTxAt", label: "Transaction" },
  swap: { lockKey: "swapHrs", lastKey: "lastSwapAt", label: "Swap" },
};

// Fetch a receipt, retrying briefly since the client may call right after
// broadcasting (before the tx is mined).
async function waitForReceipt(provider, hash) {
  for (let i = 0; i < 8; i++) {
    const r = await provider.getTransactionReceipt(hash).catch(() => null);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

const verifyTxHash = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const taskType = String(request.data?.taskType || "tx");
  const meta = TASK_META[taskType];
  if (!meta) throw new HttpsError("invalid-argument", "Unknown task.");
  const hash = String(request.data?.hash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new HttpsError("invalid-argument", "A valid transaction hash is required.");
  }

  const config = await requireTaskEnabled(taskType);
  const { data: user } = await loadUser(uid);
  if (!user.walletAddress) throw new HttpsError("failed-precondition", "Set up your Pexli wallet first.");

  // Cooldown
  const lockHrs = config.locks[meta.lockKey];
  const elapsed = hoursSince(user[meta.lastKey]);
  if (elapsed < lockHrs) {
    const remain = Math.ceil((lockHrs - elapsed) * 60);
    throw new HttpsError("failed-precondition", `${meta.label} is on cooldown. Try again in about ${remain} min.`);
  }

  const provider = chain.getProvider();
  const tx = await provider.getTransaction(hash).catch(() => null);
  if (!tx) throw new HttpsError("not-found", "That transaction isn't visible on-chain yet. Try again in a moment.");

  // Must be sent FROM the user's own wallet.
  if (chain.lc(tx.from) !== chain.lc(user.walletAddress)) {
    throw new HttpsError("failed-precondition", "That transaction wasn't sent from your wallet.");
  }

  const receipt = await waitForReceipt(provider, hash);
  if (!receipt) throw new HttpsError("not-found", "Transaction not confirmed yet. Try again in a moment.");
  if (receipt.status !== 1) throw new HttpsError("failed-precondition", "That transaction failed on-chain.");

  // Destination / value checks per task.
  const to = chain.lc(tx.to);
  if (taskType === "tx") {
    const target = chain.lc(params.TX_TARGET_ADDRESS.value());
    if (to !== target) throw new HttpsError("failed-precondition", "That transaction wasn't sent to the Pexli address.");
    if (BigInt(tx.value || 0n) <= 0n) throw new HttpsError("failed-precondition", "Send a positive amount of PEX.");
  } else if (taskType === "swap") {
    const router = chain.lc(params.DEX_ROUTER_ADDRESS.value());
    if (to !== router) throw new HttpsError("failed-precondition", "That transaction wasn't a swap on the PexSwap router.");
  }

  const result = await awardPoints({
    uid,
    taskType,
    points: config.points[taskType],
    refId: hash,
    userUpdates: { [meta.lastKey]: Timestamp.now() },
  });
  return { ok: true, ...result, txHash: hash };
});

module.exports = { verifyTxHash };
