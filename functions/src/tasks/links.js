// Content link tasks: Medium, YouTube, TikTok, Instagram, written review.
// User pastes a URL; we normalize it, reject duplicates (globally, by hash),
// confirm the platform + reachability, then award (or queue for admin approval
// on high-value types).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const { normalizeUrl, hostMatches, isReachable, sha256 } = require("../util");

const LINK_TASKS = new Set(["medium", "youtube", "tiktok", "instagram", "review"]);

const submitLink = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const taskType = String(request.data?.taskType || "");
  if (!LINK_TASKS.has(taskType)) {
    throw new HttpsError("invalid-argument", "Unknown link task.");
  }
  const config = await requireTaskEnabled(taskType);
  await loadUser(uid); // ensure profile exists

  const normalized = normalizeUrl(request.data?.url);
  if (!hostMatches(normalized, taskType)) {
    throw new HttpsError(
      "invalid-argument",
      `That link is not a valid ${taskType} URL.`,
    );
  }

  // Reachability — best effort. Reviews accept any reachable page; platform
  // links must respond. Some platforms block bots, so we only hard-fail when
  // the fetch clearly errors, not on odd status codes for review.
  const reachable = await isReachable(normalized);
  if (!reachable && taskType !== "review") {
    throw new HttpsError(
      "not-found",
      "That URL did not respond. Make sure it is public and correct.",
    );
  }

  // Global duplicate guard: reserve the hash atomically. create() fails if the
  // doc already exists → the same link can never be claimed twice, by anyone.
  const hash = sha256(normalized);
  const linkRef = db.collection("submittedLinks").doc(hash);
  try {
    await linkRef.create({
      uid,
      url: normalized,
      taskType,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message || "")) {
      throw new HttpsError("already-exists", "That link has already been submitted.");
    }
    throw e;
  }

  const status = config.requiresApproval[taskType] ? "pending" : "final";
  const result = await awardPoints({
    uid,
    taskType,
    points: config.points[taskType],
    refId: normalized,
    status,
  });

  return {
    ok: true,
    status,
    ...result,
    message:
      status === "pending"
        ? "Submitted! Points will be credited after review."
        : "Verified! Points added.",
  };
});

module.exports = { submitLink };
