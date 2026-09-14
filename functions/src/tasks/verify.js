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
  for (let i = 0; i < 12; i++) {
    const r = await provider.getTransactionReceipt(hash).catch(() => null);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 2500));
  }
  return null;
}

// Poll for the tx body too (some RPCs index it a moment after the receipt).
async function waitForTx(provider, hash) {
  for (let i = 0; i < 6; i++) {
    const t = await provider.getTransaction(hash).catch(() => null);
    if (t) return t;
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
  // Wait for the receipt first — it proves the tx was mined, and carries the
  // canonical from/to/status. The tx body (for value) is polled separately.
  const receipt = await waitForReceipt(provider, hash);
  if (!receipt) throw new HttpsError("not-found", "Transaction not confirmed yet. Try again in a moment.");
  if (receipt.status !== 1) throw new HttpsError("failed-precondition", "That transaction failed on-chain.");

  const tx = await waitForTx(provider, hash); // may be null if the RPC lags
  const from = chain.lc(receipt.from || tx?.from);
  const to = chain.lc(receipt.to || tx?.to);

  // Must be sent FROM the user's own wallet.
  if (from !== chain.lc(user.walletAddress)) {
    throw new HttpsError("failed-precondition", "That transaction wasn't sent from your wallet.");
  }

  // Destination / value checks per task.
  if (taskType === "tx") {
    const target = chain.lc(params.TX_TARGET_ADDRESS.value());
    if (to !== target) throw new HttpsError("failed-precondition", "That transaction wasn't sent to the Pexli address.");
    // Value check only when the tx body is readable; the receipt already proves
    // it succeeded, so a lagging RPC shouldn't block the reward.
    if (tx && BigInt(tx.value || 0n) <= 0n) {
      throw new HttpsError("failed-precondition", "Send a positive amount of PEX.");
    }
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
