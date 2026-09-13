// In-app faucet dispenser.
//
// Unlike verifyFaucet (which only *checks* an external claim), this actually
// SENDS native PEX from the faucet account to the user's wallet, server-side,
// with the faucet's private key held as a secret. One click for the user.
//
// Safety:
//  - The key never leaves the server; it is injected from a GitHub secret into
//    functions/.env at deploy (FAUCET_PRIVATE_KEY), never committed.
//  - A Firestore transaction reserves the per-user cooldown slot BEFORE sending,
//    so two concurrent clicks can't double-dispense. On send failure the slot is
//    released so the user can retry.
//  - Points are awarded idempotently by tx hash.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { ethers } = require("ethers");
const { db, Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const chain = require("../chain");
const params = require("../params");
const { hoursSince } = require("../util");

const FAUCET_PRIVATE_KEY = params.FAUCET_PRIVATE_KEY;

function faucetSigner() {
  const pk = (FAUCET_PRIVATE_KEY.value() || "").trim();
  if (!pk) {
    throw new HttpsError(
      "failed-precondition",
      "The faucet isn't funded yet. Please try again later.",
    );
  }
  const key = pk.startsWith("0x") ? pk : "0x" + pk;
  try {
    return new ethers.Wallet(key, chain.getProvider());
  } catch (e) {
    throw new HttpsError("failed-precondition", "Faucet key is misconfigured.");
  }
}

const claimFaucet = onCall({ ...CALL_OPTS }, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("faucet");
  const lockHrs = config.locks.faucetHrs;
  const amountStr = String((config.faucet && config.faucet.amountPex) || "0.05");
  const userRef = db.collection("users").doc(uid);

  // 1) Reserve the cooldown slot atomically (prevents concurrent double-claims).
  const { walletAddress, prevFaucetAt } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Complete sign-in first.");
    const u = snap.data();
    if (!u.walletAddress) {
      throw new HttpsError("failed-precondition", "Set up your Pexli wallet first.");
    }
    const elapsed = hoursSince(u.lastFaucetAt);
    if (elapsed < lockHrs) {
      const remain = Math.ceil((lockHrs - elapsed) * 60);
      throw new HttpsError("failed-precondition", `Faucet is on cooldown. Try again in about ${remain} min.`);
    }
    tx.set(userRef, { lastFaucetAt: Timestamp.now() }, { merge: true });
    return { walletAddress: u.walletAddress, prevFaucetAt: u.lastFaucetAt || null };
  });

  // 2) Send the PEX. On any failure, release the reserved slot so they can retry.
  let receipt;
  try {
    const signer = faucetSigner();
    const to = chain.normalizeAddress(walletAddress);
    const value = ethers.parseEther(amountStr);

    const balance = await chain.getProvider().getBalance(signer.address);
    if (balance < value) {
      throw new HttpsError("resource-exhausted", "The faucet is temporarily out of PEX. Try again later.");
    }
    const txResp = await signer.sendTransaction({ to, value });
    receipt = await txResp.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new HttpsError("internal", "Faucet transaction failed on-chain.");
    }
  } catch (e) {
    // release the slot
    await userRef.set({ lastFaucetAt: prevFaucetAt }, { merge: true }).catch(() => {});
    if (e instanceof HttpsError) throw e;
    console.error("claimFaucet send error", e);
    throw new HttpsError("unavailable", "Could not send PEX right now. Please try again.");
  }

  // 3) Award points idempotently by tx hash (lastFaucetAt already set in step 1).
  const result = await awardPoints({
    uid,
    taskType: "faucet",
    points: config.points.faucet,
    refId: receipt.hash,
  });
  return { ok: true, ...result, txHash: receipt.hash, amount: amountStr };
});

module.exports = { claimFaucet };
