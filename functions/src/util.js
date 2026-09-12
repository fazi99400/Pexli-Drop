// Small pure-ish helpers shared across task handlers.
const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Normalize a submitted URL so the same content can't be claimed twice under
// cosmetic variations: lowercase host, strip tracking/query, drop trailing
// slash, drop fragment. Returns a canonical string used for the dedupe hash.
function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch (e) {
    throw new HttpsError("invalid-argument", "That is not a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new HttpsError("invalid-argument", "URL must be http(s).");
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname.replace(/\/+$/, ""); // trim trailing slashes
  if (path === "") path = "/";
  // We intentionally discard the query string and fragment entirely — nearly
  // all sharing/tracking noise lives there and content is identified by path.
  return `https://${host}${path}`;
}

// Platform → the set of hostnames a link for that task type must live on.
const PLATFORM_HOSTS = {
  medium: ["medium.com"], // plus custom domains — see hostMatches note
  youtube: ["youtube.com", "youtu.be", "m.youtube.com"],
  tiktok: ["tiktok.com", "vm.tiktok.com"],
  instagram: ["instagram.com"],
  review: null, // any reachable URL is acceptable for a written review
};

function hostMatches(normalizedUrl, taskType) {
  const allowed = PLATFORM_HOSTS[taskType];
  if (allowed === null || allowed === undefined) return true; // no restriction
  const host = new URL(normalizedUrl).hostname;
  return allowed.some((h) => host === h || host.endsWith(`.${h}`));
}

// HEAD/GET the URL and confirm it responds (HTTP 2xx/3xx). Best-effort — some
// platforms block bots, so a non-2xx does not necessarily mean fake; callers
// decide how strict to be. Times out to keep function latency bounded.
async function isReachable(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "PexliAirdropBot/1.0 (+https://drop.pex.li)" },
    });
    return res.status >= 200 && res.status < 400;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// Hours/minutes since a Firestore Timestamp (or null). Returns Infinity if the
// timestamp is missing, so "never done before" always passes the cooldown.
function hoursSince(ts) {
  if (!ts) return Infinity;
  const then = ts.toMillis ? ts.toMillis() : new Date(ts).getTime();
  return (Date.now() - then) / (1000 * 60 * 60);
}
function minutesSince(ts) {
  return hoursSince(ts) * 60;
}

module.exports = {
  sha256,
  normalizeUrl,
  hostMatches,
  isReachable,
  hoursSince,
  minutesSince,
  PLATFORM_HOSTS,
};
