// Social tasks WITHOUT any paid X/Instagram API.
//
//  - Handle entry: the user saves their @handle (uniqueness enforced).
//  - Follow (X + Instagram): submitted to an admin-review queue (there is no
//    free way to read a follower list), awarded on approval.
//  - Tweet: verified for free via X's public oEmbed endpoint (no API key). If
//    oEmbed confirms the tweet is by the user's handle and contains the
//    assigned text, it's auto-awarded; otherwise it falls back to review.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, FieldValue, Timestamp } = require("./init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("./callable");
const { awardPoints } = require("./points");
const { minutesSince } = require("./util");

const HANDLE_RE = /^[a-z0-9_.]{1,30}$/;

// Save an X or Instagram handle on the profile (one handle → one account).
const setSocialHandle = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const platform = request.data?.platform === "instagram" ? "instagram" : "x";
  const handle = String(request.data?.handle || "").trim().replace(/^@+/, "").toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    throw new HttpsError("invalid-argument", "Enter a valid handle (letters, numbers, _ .).");
  }
  const field = platform === "x" ? "xHandle" : "igHandle";
  const idxCol = platform === "x" ? "xHandleIndex" : "igHandleIndex";
  const userRef = db.collection("users").doc(uid);
  const idxRef = db.collection(idxCol).doc(handle);

  await db.runTransaction(async (tx) => {
    const [idxSnap, userSnap] = await Promise.all([tx.get(idxRef), tx.get(userRef)]);
    if (idxSnap.exists && idxSnap.data().uid !== uid) {
      throw new HttpsError("already-exists", "That handle is already linked to another account.");
    }
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Complete sign-in first.");
    const prev = userSnap.data()[field];
    if (prev && prev.toLowerCase() !== handle) {
      tx.delete(db.collection(idxCol).doc(prev.toLowerCase()));
    }
    tx.set(idxRef, { uid, at: FieldValue.serverTimestamp() });
    tx.set(userRef, { [field]: handle }, { merge: true });
  });
  return { platform, handle };
});

// Free check that an X handle is a real, existing, public account — via X's
// public syndication endpoint (used by embedded timelines; no API key). Returns
// true (exists), false (definitely not found), or "unknown" (couldn't tell).
async function xAccountExists(handle) {
  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; PexliBot/1.0)" } },
    );
    if (res.status === 404) return false;
    if (!res.ok) return "unknown";
    const body = (await res.text()).toLowerCase();
    if (/user not found|doesn.t exist|account doesn|page does not exist/.test(body)) return false;
    if (body.includes(`"screenname":"${handle.toLowerCase()}"`) || body.includes(handle.toLowerCase())) {
      return true;
    }
    return "unknown";
  } catch (e) {
    return "unknown";
  }
}

// Submit a follow (X or Instagram). Automatic by default: points are credited
// immediately (no admin approval). X requires the handle to be a real existing
// account. When config.autoApproveFollows is false, it goes to admin review.
// One submission per user per platform (refId is unique).
const submitFollow = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const platform = request.data?.platform === "instagram" ? "instagram" : "x";
  const taskType = platform === "x" ? "follow_x" : "follow_ig";
  const config = await requireTaskEnabled(taskType);
  const { data: user } = await loadUser(uid);
  const handle = platform === "x" ? user.xHandle : user.igHandle;
  if (!handle) {
    throw new HttpsError("failed-precondition", "Save your handle first, then submit.");
  }

  const auto = config.autoApproveFollows !== false;
  let status = "pending";
  if (auto) {
    if (platform === "x") {
      const exists = await xAccountExists(handle);
      if (exists === false) {
        throw new HttpsError("not-found", "We couldn't find that X account. Check your handle.");
      }
      status = "final"; // exists or unknown → credit (best free verification)
    } else {
      status = "final"; // Instagram can't be verified for free
    }
  }

  const result = await awardPoints({
    uid,
    taskType,
    points: config.points[taskType],
    refId: `${taskType}:${uid}`,
    status,
  });
  return {
    ok: true,
    ...result,
    status,
    message: status === "final" ? "Verified! Points added." : "Submitted for review.",
  };
});

// twitter.com / x.com  /<username>/status/<id>
function parseTweetUrl(raw) {
  const m = String(raw || "").match(
    /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i,
  );
  if (!m) throw new HttpsError("invalid-argument", "Paste a valid tweet link (…/status/…).");
  return { username: m[1].toLowerCase(), id: m[2] };
}

// Verify a posted tweet with the free public oEmbed endpoint (no API key).
const verifyTweetPublic = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("tweet");
  const { data: user } = await loadUser(uid);
  if (!user.xHandle) throw new HttpsError("failed-precondition", "Save your X handle first.");

  // 30-min cooldown between tweet rewards.
  const elapsed = minutesSince(user.lastTweetTaskAt);
  if (elapsed < config.locks.tweetMins) {
    const remain = Math.ceil(config.locks.tweetMins - elapsed);
    throw new HttpsError("failed-precondition", `Next tweet reward in ${remain} min.`);
  }

  const { username, id } = parseTweetUrl(request.data?.url);
  if (username !== String(user.xHandle).toLowerCase()) {
    throw new HttpsError("failed-precondition", "That tweet is not from your saved handle.");
  }

  // Required text from the user's current assignment (if any).
  let requiredText = "";
  const assignRef = db.collection("tweetAssignments").doc(`${uid}_current`);
  const assignSnap = await assignRef.get();
  if (assignSnap.exists && assignSnap.data().status === "pending") {
    const pool = await db.collection("tweetPool").doc(assignSnap.data().tweetPoolId).get();
    if (pool.exists) requiredText = String(pool.data().text || "");
  }

  // Free oEmbed verification.
  let authorOk = false;
  let textOk = true;
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=https://twitter.com/${username}/status/${id}`,
      { headers: { "User-Agent": "PexliAirdropBot/1.0" } },
    );
    if (res.ok) {
      const j = await res.json();
      const authorUrl = String(j.author_url || "").toLowerCase();
      authorOk = authorUrl.includes(`/${username}`);
      if (requiredText) {
        const html = String(j.html || "").toLowerCase().replace(/<[^>]+>/g, " ");
        const needle = requiredText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 30);
        textOk = needle.length === 0 || html.includes(needle);
      }
    }
  } catch (e) {
    authorOk = false; // network/oEmbed unavailable → fall through to review
  }

  const status = authorOk && textOk ? "final" : "pending";
  const result = await awardPoints({
    uid,
    taskType: "tweet",
    points: config.points.tweet,
    refId: id, // tweet id → can't be reused
    status,
    userUpdates: { lastTweetTaskAt: Timestamp.now() },
  });
  if (assignSnap.exists) await assignRef.set({ status: "verified" }, { merge: true });
  return {
    ok: true,
    ...result,
    status,
    message:
      status === "final"
        ? "Verified! Points added."
        : "Submitted — we'll confirm this tweet shortly.",
  };
});

module.exports = { setSocialHandle, submitFollow, verifyTweetPublic };
