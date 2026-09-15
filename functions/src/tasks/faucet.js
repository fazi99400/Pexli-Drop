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
const { CALL_OPTS, requireAuth, requireTaskEnabled, requireNotBlocked } = require("../callable");
const { awardPoints } = require("../points");
const chain = require("../chain");
const params = require("../params");
const { hoursSince } = require("../util");

const FAUCET_PRIVATE_KEY = params.FAUCET_PRIVATE_KEY;

// Accepts EITHER a hex private key OR a BIP-39 recovery phrase (mnemonic) in the
// FAUCET_PRIVATE_KEY secret — whichever the owner stored.
function faucetSigner() {
  const raw = (FAUCET_PRIVATE_KEY.value() || "").trim();
  if (!raw) {
    throw new HttpsError(
      "failed-precondition",
      "The faucet isn't funded yet. Please try again later.",
    );
  }
  const provider = chain.getProvider();
  try {
    // A mnemonic is multiple whitespace-separated words; a private key is one
    // hex string.
    const looksMnemonic = /\s/.test(raw) && !raw.startsWith("0x");
    if (looksMnemonic) {
      const phrase = raw.replace(/\s+/g, " ").toLowerCase();
      return ethers.Wallet.fromPhrase(phrase).connect(provider);
    }
    const key = raw.startsWith("0x") ? raw : "0x" + raw;
    return new ethers.Wallet(key, provider);
  } catch (e) {
    throw new HttpsError("failed-precondition", "Faucet key/phrase is misconfigured.");
  }
}

// cpu:1/concurrency:80 (overrides the global cpu:0.5/concurrency:1): this
// function holds the request open while it sends PEX and waits, so it must not
// serialize behind the global concurrency:1. maxInstances:6 (overrides the
// global maxInstances:4, since this is the highest-traffic on-chain action) —
// 6 × 80 = 480 concurrent claims, sized for a few thousand daily users. See
// the capacity note in index.js before raising further.
const claimFaucet = onCall({ ...CALL_OPTS, cpu: 1, concurrency: 80, maxInstances: 6 }, async (request) => {
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
    requireNotBlocked(u); // blocked accounts can't drain the faucet either
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

  // 2) Broadcast the PEX transfer. IMPORTANT: only a failure to BROADCAST is a
  // real failure (release the slot + error). Once the tx is broadcast the PEX
  // is on its way, so a slow/failed *confirmation* must NOT show an error or
  // release the slot — that produced the "received PEX but got an error" bug.
  let txHash;
  try {
    const signer = faucetSigner();
    const to = chain.normalizeAddress(walletAddress);
    const value = ethers.parseEther(amountStr);

    const balance = await chain.getProvider().getBalance(signer.address);
    if (balance < value) {
      throw new HttpsError("resource-exhausted", "The faucet is temporarily out of PEX. Try again later.");
    }
    const txResp = await signer.sendTransaction({ to, value });
    txHash = txResp.hash;

    // Best-effort confirmation with a short timeout — never fatal.
    await Promise.race([
      txResp.wait(1).catch(() => null),
      new Promise((r) => setTimeout(r, 12000)),
    ]);
  } catch (e) {
    // Only reached if the tx never broadcast.
    await userRef.set({ lastFaucetAt: prevFaucetAt }, { merge: true }).catch(() => {});
    if (e instanceof HttpsError) throw e;
    console.error("claimFaucet broadcast error", e);
    throw new HttpsError("unavailable", "Could not send PEX right now. Please try again.");
  }

  // 3) Award points idempotently by tx hash (lastFaucetAt already set in step 1).
  const result = await awardPoints({
    uid,
    taskType: "faucet",
    points: config.points.faucet,
    refId: txHash,
  });
  return { ok: true, ...result, txHash, amount: amountStr };
});

module.exports = { claimFaucet };
