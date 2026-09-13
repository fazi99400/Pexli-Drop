// X (Twitter) integration — OAuth 2.0 PKCE connect, follow verification, and
// the rotating tweet pool. This is the paid/fragile part of the platform
// (reading tweets/follows needs a paid X API tier); everything here is gated by
// the config.tasks.{tweet,follow_x} toggles and can be shipped disabled.
const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { db, FieldValue, Timestamp } = require("../init");
const { CALL_OPTS, requireAuth, loadUser, requireTaskEnabled } = require("../callable");
const { awardPoints } = require("../points");
const { minutesSince } = require("../util");
const params = require("../params");

const X_SECRET = params.X_CLIENT_SECRET;
const OAUTH_SCOPES = ["tweet.read", "users.read", "follows.read", "offline.access"];

// --- PKCE helpers -----------------------------------------------------------
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function makePkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// --- Connect flow -----------------------------------------------------------
// Step 1 (callable, requires Firebase auth): mint an authorize URL and stash
// the PKCE verifier + uid under a random state key.
const xAuthStart = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  await requireTaskEnabled("follow_x"); // gate connect behind X being enabled
  const clientId = params.X_CLIENT_ID.value();
  if (!clientId) throw new HttpsError("failed-precondition", "X is not configured yet.");

  const state = b64url(crypto.randomBytes(24));
  const { verifier, challenge } = makePkce();
  await db.collection("xOauth").doc(state).set({
    uid,
    verifier,
    createdAt: Timestamp.now(),
  });

  const url =
    "https://twitter.com/i/oauth2/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: params.X_REDIRECT_URI.value(),
      scope: OAUTH_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
  return { url };
});

// Step 2 (HTTP, X redirects here): exchange code, load the X user, enforce
// one-X-account-per-user uniqueness, persist ids + tokens, redirect to the app.
const xCallback = onRequest({ region: "us-central1" }, async (req, res) => {
  const { code, state, error } = req.query;
  const appBase = params.APP_URL.value().replace(/\/+$/, "");
  const back = (q) => res.redirect(`${appBase}/?x=${q}`);
  if (error) return back("denied");
  if (!code || !state) return back("bad_request");

  const stateSnap = await db.collection("xOauth").doc(String(state)).get();
  if (!stateSnap.exists) return back("expired");
  const { uid, verifier } = stateSnap.data();
  await stateSnap.ref.delete();

  try {
    const token = await exchangeCode(String(code), verifier);
    const me = await xGet("users/me?user.fields=username", token.access_token);
    const xUserId = me?.data?.id;
    const xHandle = me?.data?.username || null;
    if (!xUserId) return back("no_user");

    // One X account → one platform account.
    const idxRef = db.collection("xIndex").doc(xUserId);
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      const idxSnap = await tx.get(idxRef);
      if (idxSnap.exists && idxSnap.data().uid !== uid) {
        throw new Error("x_taken");
      }
      tx.set(idxRef, { uid, at: FieldValue.serverTimestamp() });
      tx.set(userRef, { xUserId, xHandle, authProviders: FieldValue.arrayUnion("twitter") }, { merge: true });
    });

    await db.collection("xTokens").doc(uid).set({
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Date.now() + (token.expires_in || 7200) * 1000,
      updatedAt: Timestamp.now(),
    });
    return back("connected");
  } catch (e) {
    if (e.message === "x_taken") return back("x_taken");
    console.error("xCallback error", e);
    return back("failed&m=" + encodeURIComponent(String(e.message || "error").slice(0, 160)));
  }
});

async function exchangeCode(code, verifier) {
  const clientId = params.X_CLIENT_ID.value();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: params.X_REDIRECT_URI.value(),
    code_verifier: verifier,
    client_id: clientId,
  });
  return tokenRequest(body);
}

async function tokenRequest(body) {
  const clientId = params.X_CLIENT_ID.value();
  const secret = X_SECRET.value();
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  // Confidential clients authenticate with Basic auth; public clients don't.
  if (secret) {
    headers.Authorization = "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64");
  }
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${t}`);
  }
  return res.json();
}

// Return a valid access token for a user, refreshing if expired.
async function getUserToken(uid) {
  const ref = db.collection("xTokens").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Connect your X account first.");
  const t = snap.data();
  if (t.expiresAt && Date.now() < t.expiresAt - 60000) return t.accessToken;
  if (!t.refreshToken) return t.accessToken; // best effort; may 401
  const refreshed = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
      client_id: params.X_CLIENT_ID.value(),
    }),
  );
  await ref.set(
    {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || t.refreshToken,
      expiresAt: Date.now() + (refreshed.expires_in || 7200) * 1000,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
  return refreshed.access_token;
}

async function xGet(path, token) {
  const res = await fetch(`https://api.twitter.com/2/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    throw new HttpsError("resource-exhausted", "X rate limit hit — try again shortly.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new HttpsError("unavailable", `X API error ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// --- Follow verification ----------------------------------------------------
const verifyFollowX = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("follow_x");
  const { data: user } = await loadUser(uid);
  if (!user.xUserId) throw new HttpsError("failed-precondition", "Connect your X account first.");
  const target = params.X_PEXLI_USER_ID.value();
  if (!target) throw new HttpsError("failed-precondition", "Pexli X id not configured yet.");

  const token = await getUserToken(uid);
  // Page the user's following list looking for the Pexli account id.
  let found = false;
  let paginationToken = null;
  for (let i = 0; i < 10 && !found; i++) {
    const q = new URLSearchParams({ max_results: "1000" });
    if (paginationToken) q.set("pagination_token", paginationToken);
    const page = await xGet(`users/${user.xUserId}/following?${q.toString()}`, token);
    if (Array.isArray(page.data) && page.data.some((u) => u.id === target)) found = true;
    paginationToken = page.meta?.next_token;
    if (!paginationToken) break;
  }
  if (!found) {
    throw new HttpsError("not-found", "We couldn't confirm you follow @PexliLabs yet.");
  }

  const result = await awardPoints({
    uid,
    taskType: "follow_x",
    points: config.points.follow_x,
    refId: `${user.xUserId}:follows:${target}`,
  });
  return { ok: true, ...result };
});

// --- Tweet pool: assign + verify -------------------------------------------
// Assign a random active tweet to the user (respects the 30-min cooldown).
const assignTweet = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("tweet");
  const { data: user } = await loadUser(uid);
  if (!user.xUserId) throw new HttpsError("failed-precondition", "Connect your X account first.");

  const elapsed = minutesSince(user.lastTweetTaskAt);
  if (elapsed < config.locks.tweetMins) {
    const remain = Math.ceil(config.locks.tweetMins - elapsed);
    throw new HttpsError("failed-precondition", `Next tweet available in ${remain} min.`);
  }

  // Reuse an existing pending assignment if one is live.
  const assignRef = db.collection("tweetAssignments").doc(`${uid}_current`);
  const existing = await assignRef.get();
  if (existing.exists && existing.data().status === "pending") {
    const pool = await db.collection("tweetPool").doc(existing.data().tweetPoolId).get();
    if (pool.exists) return { text: pool.data().text, assignmentId: assignRef.id };
  }

  // Pick a random active tweet, favoring the least-assigned ones.
  const poolSnap = await db
    .collection("tweetPool")
    .where("active", "==", true)
    .orderBy("timesAssigned", "asc")
    .limit(25)
    .get();
  if (poolSnap.empty) throw new HttpsError("failed-precondition", "No tweets available right now.");
  const docs = poolSnap.docs;
  const chosen = docs[Math.floor(Math.random() * docs.length)];

  await assignRef.set({
    uid,
    tweetPoolId: chosen.id,
    assignedAt: Timestamp.now(),
    status: "pending",
  });
  await chosen.ref.update({ timesAssigned: FieldValue.increment(1) });
  return { text: chosen.data().text, assignmentId: assignRef.id };
});

// Verify the user posted their assigned tweet, then award + start cooldown.
const verifyTweet = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const config = await requireTaskEnabled("tweet");
  const { data: user } = await loadUser(uid);
  if (!user.xUserId) throw new HttpsError("failed-precondition", "Connect your X account first.");

  const assignRef = db.collection("tweetAssignments").doc(`${uid}_current`);
  const assignSnap = await assignRef.get();
  if (!assignSnap.exists || assignSnap.data().status !== "pending") {
    throw new HttpsError("failed-precondition", "Request a tweet first.");
  }
  const assignment = assignSnap.data();
  const poolSnap = await db.collection("tweetPool").doc(assignment.tweetPoolId).get();
  if (!poolSnap.exists) throw new HttpsError("failed-precondition", "Assigned tweet no longer exists.");
  const requiredText = normalizeTweetText(poolSnap.data().text);

  const token = await getUserToken(uid);
  const startTime = assignment.assignedAt.toDate().toISOString();
  const page = await xGet(
    `users/${user.xUserId}/tweets?max_results=20&start_time=${encodeURIComponent(startTime)}` +
      `&tweet.fields=created_at,text`,
    token,
  );
  const tweets = Array.isArray(page.data) ? page.data : [];
  const match = tweets.find((t) => normalizeTweetText(t.text).includes(requiredText));
  if (!match) {
    throw new HttpsError(
      "not-found",
      "We couldn't find your tweet. Post the exact text (with hashtags), then verify.",
    );
  }

  // Tweet id must be new (awardPoints refId is idempotent — reused id rejected).
  const result = await awardPoints({
    uid,
    taskType: "tweet",
    points: config.points.tweet,
    refId: match.id,
    userUpdates: { lastTweetTaskAt: Timestamp.now() },
  });
  await assignRef.set({ status: "verified" }, { merge: true });
  return { ok: true, ...result, tweetId: match.id };
});

// Loose match: collapse whitespace + lowercase so minor spacing differs are ok.
function normalizeTweetText(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

module.exports = { xAuthStart, xCallback, verifyFollowX, assignTweet, verifyTweet };
