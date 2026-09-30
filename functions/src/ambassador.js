// Ambassador program — ONE callable (`ambassador`) with an `action` switch, so
// the whole program costs a single Cloud Run service against the CPU quota.
// Daily upkeep piggybacks on the existing leaderboard schedule (see
// dailyMaintenance), so it adds no service either.
//
// Member-facing actions
//   board          public monthly ambassador board (no sign-in needed)
//   get            my application, stats, missions, onboarding, announcement
//   apply          apply / re-apply (contacts go to ambassadorContacts, admin-only)
//   submitPost     daily X post (weekly cap) → Admin → Moderation (pending)
//   submitMission  mission link → Admin → Moderation (pending)
//   myTeam         my members (safe fields only) + ambassadors I recruited
//   setVanity      custom invite code (drop.pex.li/?ref=CODE)
//   setGroup       my Telegram / WhatsApp group link, shown to my members
//   onboardingTick mark a checklist item done
//   myAmbassador   for any user: the ambassador who invited me + their group
//   regionView     Regional Leads: ambassadors/applications in my country
//   recommend      Regional Leads: recommend a pending application
// Admin actions are prefixed `admin` (see the switch at the bottom).
//
// Ambassadors never get powers over other people's points, blocks or private
// data: every member-facing action returns only public/safe fields.
//
// Data
//   ambassadors/{uid}          application + program state (function-only)
//   ambassadorContacts/{uid}   email / WhatsApp / Telegram (function-only, admin view)
//   ambassadorStatus/{uid}     {active, sponsorUid} read by points.js for the
//                              15% referral share + 3% team share
//   ambassadorMissions/{id}    missions board
//   ambassadorSettings/private private group link + announcement
//   users/{uid}.ambTier        leaderboard badge
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, FieldValue, Timestamp } = require("./init");
const { CALL_OPTS, requireAuth, requireAdmin, loadUser, isCurrentlyBlocked } = require("./callable");
const { getConfig } = require("./config");
const { awardPoints, adjustPointsCore } = require("./points");
const { normalizeUrl, sha256 } = require("./util");

const APPS = db.collection("ambassadors");
const CONTACTS = db.collection("ambassadorContacts");
const STATUS = db.collection("ambassadorStatus");
const MISSIONS = db.collection("ambassadorMissions");
const PRIVATE = db.collection("ambassadorSettings").doc("private");

const TIER_ORDER = ["rising", "lead", "champion"];
const ALL_TIERS = ["ambassador", ...TIER_ORDER];
const CASH_TIERS = new Set(["lead", "champion"]);
const LEAD_TIERS = new Set(["lead", "champion"]);
const MILESTONES = ["m1", "m2", "m3"];
const STRIKES_TO_REMOVE = 3;
const STATS_TTL_MS = 10 * 60 * 1000; // recount verified members at most every 10 min
const BOARD_TTL_MS = 5 * 60 * 1000;
// Rows that count as "ambassador points" (forfeited on fraud).
const FORFEIT_TYPES = new Set([
  "ambassador_post",
  "ambassador_mission",
  "ambassador_tier",
  "sponsor_milestone",
  "team_share",
]);
const MISSION_TYPES = {
  x_post: "X post",
  x_thread: "X thread",
  short_video: "Short video",
  community_event: "Community event",
  translation: "Translation",
  bug_report: "Bug report",
  meme: "Meme",
};
const PLATFORMS = ["x", "tiktok", "youtube", "instagram", "groups"];
const CONSENT_TEXT = "Pexli may contact me on email, WhatsApp and Telegram about the ambassador program";
const RESERVED_CODES = new Set(["ADMIN", "PEXLI", "PEX", "SUPPORT", "OFFICIAL", "TEAM", "MOD", "STAFF", "HELP"]);

const toMs = (t) => (t && t.toMillis ? t.toMillis() : null);
const clip = (v, n) => String(v || "").trim().replace(/\s+/g, " ").slice(0, n);
const clipText = (v, n) => String(v || "").trim().slice(0, n);
const normCountry = (v) => clip(v, 60).toLowerCase();

// Monday-based ISO week key, e.g. "2026-W40" — the weekly post cap resets on it.
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
// Calendar month key (UTC), e.g. "2026-09".
function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthStartMs(d = new Date()) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function prevMonthDate(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function tierFor(verified, thresholds) {
  let tier = "ambassador";
  for (const t of TIER_ORDER) if (verified >= (Number(thresholds[t]) || Infinity)) tier = t;
  return tier;
}
// The tier used for perks/badges: admin override wins over the computed one.
function effectiveTier(app) {
  return ALL_TIERS.includes(app.tierOverride) ? app.tierOverride : app.tier || "ambassador";
}
function isActiveAmb(app) {
  return !!app && app.status === "approved" && !app.inactive;
}
function multiplierFor(app, cfg) {
  if (!isActiveAmb(app)) return 1; // inactive: base points until reactivated
  const m = Number((cfg.tierMultiplier || {})[effectiveTier(app)]);
  return m > 0 ? m : 1;
}

// ---------------------------------------------------------------------------
// Serialisers — what each audience may see.

// The ambassador's own view (never other people's data).
function selfApp(uid, d) {
  if (!d) return null;
  const cur = monthKey();
  return {
    uid,
    status: d.status,
    xHandle: d.xHandle,
    region: d.region,
    language: d.language,
    audience: d.audience || "",
    plan: d.plan || "",
    community: d.community || "",
    platforms: d.platforms || {},
    samples: d.samples || [],
    weeklyHours: d.weeklyHours || 0,
    note: d.note || "",
    tier: effectiveTier(d),
    computedTier: d.tier || "ambassador",
    cashEligible: !!d.cashEligible,
    verifiedMembers: d.verifiedMembers || 0,
    invited: d.invited || 0,
    monthMembers: d.statsMonth === cur ? d.monthMembers || 0 : 0,
    monthApproved: d.mMonth === cur ? d.mApproved || 0 : 0,
    monthMissionPts: d.mMonth === cur ? d.mMissionPts || 0 : 0,
    postsThisWeek: d.week === weekKey() ? d.weekPosts || 0 : 0,
    missionCounts: d.missionCounts || {},
    inactive: !!d.inactive,
    strikes: (d.strikes || []).map((s) => ({ reason: s.reason, at: toMs(s.at) })),
    regionalLead: !!d.regionalLead,
    vanityCode: d.vanityCode || "",
    groupUrl: d.groupUrl || "",
    onboarding: d.onboarding || {},
    sponsorUid: d.sponsorUid || null,
    removedReason: d.status === "removed" ? d.removedReason || "" : "",
    appliedAt: toMs(d.appliedAt),
    reviewedAt: toMs(d.reviewedAt),
  };
}

// What a Regional Lead may see about an ambassador/applicant in their country:
// public profile + application answers. No contacts, email or wallet.
function leadView(uid, d, myUid) {
  return {
    uid,
    status: d.status,
    xHandle: d.xHandle,
    displayName: d.displayName || "",
    region: d.region,
    language: d.language,
    audience: d.audience || "",
    plan: d.plan || "",
    community: d.community || "",
    platforms: d.platforms || {},
    samples: d.samples || [],
    weeklyHours: d.weeklyHours || 0,
    tier: effectiveTier(d),
    verifiedMembers: d.verifiedMembers || 0,
    appliedAt: toMs(d.appliedAt),
    recommendedByMe: !!(d.recommendations || {})[myUid],
    recommendations: Object.keys(d.recommendations || {}).length,
  };
}

// Full admin row (application + contacts + program state).
function adminRow(uid, d, contact, handles) {
  return {
    ...selfApp(uid, d),
    displayName: d.displayName || "",
    wallet: d.wallet || "",
    country: d.country || normCountry(d.region),
    email: contact?.email || d.email || "",
    whatsapp: contact?.whatsapp || "",
    telegram: contact?.telegram || "",
    consentAt: toMs(contact?.consentAt),
    age18: !!d.age18,
    cocAgreed: !!d.cocAgreed,
    tierOverride: d.tierOverride || null,
    sponsorHandle: d.sponsorUid ? handles[d.sponsorUid] || "" : "",
    recommendations: Object.entries(d.recommendations || {}).map(([by, r]) => ({
      by,
      handle: r.handle || "",
      note: r.note || "",
      at: toMs(r.at),
    })),
    fraud: !!d.fraud,
    forfeited: d.forfeited || 0,
    lastMonth: d.lastMonth || null,
  };
}

// ---------------------------------------------------------------------------
// Status sync — ambassadorStatus drives the referral/team share in points.js,
// users/{uid}.ambTier drives the leaderboard badge. Written only on change.
async function syncStatus(uid, app) {
  const active = isActiveAmb(app);
  const sponsorUid = app && app.status === "approved" ? app.sponsorUid || null : null;
  const ambTier = app && app.status === "approved" ? effectiveTier(app) : null;
  const ref = STATUS.doc(uid);
  const cur = await ref.get();
  const c = cur.exists ? cur.data() : {};
  if (!cur.exists || c.active !== active || (c.sponsorUid || null) !== sponsorUid || (c.ambTier || null) !== ambTier) {
    await ref.set({ active, sponsorUid, ambTier, updatedAt: Timestamp.now() });
    await db.collection("users").doc(uid).set({ ambTier }, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Activity rule. At each new calendar month: an approved ambassador who was
// in the program for the whole previous month and got fewer than
// `activityMin` approved submissions in it becomes inactive. The next
// approved submission reactivates them (recordApproval).
function monthRollUpdate(app, cfg, now = new Date()) {
  const cur = monthKey(now);
  if (app.mMonth === cur) return null;
  const prev = monthKey(prevMonthDate(now));
  const count = app.mMonth === prev ? app.mApproved || 0 : 0;
  const upd = {
    mMonth: cur,
    mApproved: 0,
    mMissionPts: 0,
    lastMonth: app.mMonth ? { month: app.mMonth, approved: app.mApproved || 0 } : null,
  };
  const approvedMs = toMs(app.approvedAt) || toMs(app.reviewedAt) || now.getTime();
  const fullPrevMonth = approvedMs < monthStartMs(prevMonthDate(now));
  if (app.status === "approved" && fullPrevMonth && count < (Number(cfg.activityMin) || 0)) {
    upd.inactive = true;
    upd.inactiveSince = Timestamp.now();
  }
  return upd;
}

async function rollMonth(uid, cfg) {
  const ref = APPS.doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const a = snap.data();
    const upd = monthRollUpdate(a, cfg);
    if (!upd) return { app: a, changed: false };
    tx.set(ref, upd, { merge: true });
    return { app: { ...a, ...upd }, changed: true };
  });
  if (!out) return null;
  if (out.changed) await syncStatus(uid, out.app);
  return out.app;
}

// Called by admin.approveSubmission after an ambassador_post/_mission row was
// approved: counts toward this month's activity + board, and reactivates.
async function recordApproval(uid, points) {
  const cfg = (await getConfig()).ambassador;
  const ref = APPS.doc(uid);
  const app = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    let a = snap.data();
    const roll = monthRollUpdate(a, cfg);
    if (roll) a = { ...a, ...roll };
    const upd = {
      ...(roll || {}),
      mMonth: a.mMonth,
      mApproved: (a.mApproved || 0) + 1,
      mMissionPts: (a.mMissionPts || 0) + (Number(points) || 0),
      inactive: false,
    };
    tx.set(ref, upd, { merge: true });
    return { ...a, ...upd };
  });
  if (app) await syncStatus(uid, app);
  boardCache = null;
}

// ---------------------------------------------------------------------------
// Community stats, tier bonuses, sponsor milestones.

// People referred by `uid`: invited, verified (saved a wallet) and verified
// members who joined this calendar month. Bots and blocked accounts never
// count. Single-field equality query (auto-indexed, no composite index).
async function countCommunity(uid) {
  const snap = await db
    .collection("users")
    .where("referredBy", "==", uid)
    .select("walletAddress", "isBot", "blocked", "blockedUntil", "createdAt")
    .limit(20000)
    .get();
  const since = monthStartMs();
  let invited = 0;
  let verified = 0;
  let month = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (u.isBot || isCurrentlyBlocked(u)) continue;
    invited++;
    if (!u.walletAddress) continue;
    verified++;
    if ((toMs(u.createdAt) || 0) >= since) month++;
  }
  return { invited, verified, month };
}

// Pay each not-yet-paid one-time bonus in `keys`. The deterministic ledger id
// (taskType + refId) makes every bonus exactly-once even under concurrent
// refreshes; the `paid` map just skips the no-op transactions next time.
async function payOnce(paid, keys, award) {
  const out = { ...(paid || {}) };
  let changed = false;
  for (const k of keys) {
    if (out[k]) continue;
    try {
      const ok = await award(k);
      if (ok === false) continue;
      out[k] = true;
      changed = true;
    } catch (e) {
      if (e.code === "already-exists" || /already/i.test(e.message || "")) {
        out[k] = true;
        changed = true;
      } else {
        console.warn("ambassador bonus failed:", k, e.message);
      }
    }
  }
  return changed ? out : null;
}

async function refreshStats(uid, app, cfg, { force = false } = {}) {
  const fresh = toMs(app.statsAt);
  if (!force && fresh && Date.now() - fresh < STATS_TTL_MS) return app;
  let counts;
  try {
    counts = await countCommunity(uid);
  } catch (e) {
    console.warn("ambassador stats count failed:", e.message);
    return app; // show the last known stats rather than failing the page
  }
  const tier = tierFor(counts.verified, cfg.tiers);
  const next = { ...app, tier };
  const upd = {
    invited: counts.invited,
    verifiedMembers: counts.verified,
    monthMembers: counts.month,
    statsMonth: monthKey(),
    tier,
    cashEligible: CASH_TIERS.has(effectiveTier(next)),
    statsAt: Timestamp.now(),
  };

  // Tier bonuses: from REAL verified members only (an admin tier override
  // changes perks, never pays a bonus). No referral cascade on bonuses.
  const reached = TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier) + 1);
  const bonusPaid = await payOnce(app.bonusPaid, reached, async (t) => {
    const pts = Number(cfg.tierBonus[t]) || 0;
    if (pts <= 0) return false;
    await awardPoints({ uid, taskType: "ambassador_tier", points: pts, refId: `${t}:${uid}`, noReferral: true });
    return true;
  });
  if (bonusPaid) upd.bonusPaid = bonusPaid;

  // Sponsor milestones: the ambassador who recruited this one earns a one-time
  // bonus when this ambassador reaches each verified-member milestone. Paid
  // only from real verified users; nothing is ever paid just for recruiting.
  if (app.sponsorUid) {
    const hit = MILESTONES.filter((m) => counts.verified >= (Number(cfg.sponsorMilestones[m]) || Infinity));
    if (hit.length) {
      const sp = await APPS.doc(app.sponsorUid).get();
      if (sp.exists && sp.data().status === "approved") {
        const sponsorPaid = await payOnce(app.sponsorPaid, hit, async (m) => {
          const pts = Number(cfg.sponsorMilestoneBonus[m]) || 0;
          if (pts <= 0) return false;
          await awardPoints({
            uid: app.sponsorUid,
            taskType: "sponsor_milestone",
            points: pts,
            refId: `${m}:${uid}`,
            extra: { viaUid: uid, members: Number(cfg.sponsorMilestones[m]) || 0 },
            noReferral: true,
          });
          return true;
        });
        if (sponsorPaid) upd.sponsorPaid = sponsorPaid;
      }
    }
  }

  await APPS.doc(uid).set(upd, { merge: true });
  const out = { ...app, ...upd };
  await syncStatus(uid, out);
  return out;
}

// Runs from the existing daily leaderboard schedule (no extra service): month
// roll-over (activity rule) + fresh stats, tier bonuses and sponsor milestones
// for every approved ambassador, even ones who don't open the page.
async function dailyMaintenance() {
  const cfg = (await getConfig()).ambassador;
  const snap = await APPS.where("status", "==", "approved").limit(2000).get();
  let done = 0;
  for (const d of snap.docs) {
    try {
      const app = await rollMonth(d.id, cfg);
      if (app) await refreshStats(d.id, app, cfg, { force: true });
      done++;
    } catch (e) {
      console.warn("ambassador maintenance failed:", d.id, e.message);
    }
  }
  boardCache = null;
  return { ambassadors: snap.size, refreshed: done };
}

// ---------------------------------------------------------------------------
// Member actions.

async function readPrivate() {
  const s = await PRIVATE.get();
  const d = s.exists ? s.data() : {};
  return {
    groupLink: d.groupLink || "",
    announcement: d.announcement?.text ? { text: d.announcement.text, at: toMs(d.announcement.at) } : null,
  };
}

function missionOut(id, m) {
  return {
    id,
    title: m.title,
    description: m.description || "",
    type: m.type,
    typeLabel: MISSION_TYPES[m.type] || m.type,
    points: m.points || 0,
    startAt: toMs(m.startAt),
    endAt: toMs(m.endAt),
    maxPerAmbassador: m.maxPerAmbassador || 0,
    active: !!m.active,
  };
}

async function activeMissions(app) {
  const snap = await MISSIONS.where("active", "==", true).limit(100).get();
  const now = Date.now();
  const counts = app?.missionCounts || {};
  return snap.docs
    .map((d) => missionOut(d.id, d.data()))
    .filter((m) => (!m.startAt || m.startAt <= now) && (!m.endAt || m.endAt >= now))
    .map((m) => ({ ...m, mine: counts[m.id] || 0 }))
    .sort((a, b) => (a.endAt || Infinity) - (b.endAt || Infinity));
}

async function doGet(uid, cfg) {
  const [snap, contactSnap, userSnap] = await Promise.all([
    APPS.doc(uid).get(),
    CONTACTS.doc(uid).get(),
    db.collection("users").doc(uid).get(),
  ]);
  let app = snap.exists ? snap.data() : null;
  const user = userSnap.exists ? userSnap.data() : {};
  const c = contactSnap.exists ? contactSnap.data() : {};
  const out = {
    program: cfg,
    application: null,
    // Your own contact details (to prefill a re-application). Never anyone else's.
    contacts: { email: c.email || user.email || "", whatsapp: c.whatsapp || "", telegram: c.telegram || "" },
  };
  if (app && app.status === "approved") {
    if (app.mMonth !== monthKey()) app = (await rollMonth(uid, cfg)) || app;
    app = await refreshStats(uid, app, cfg);
    const [priv, missions, sponsor] = await Promise.all([
      readPrivate(),
      activeMissions(app),
      app.sponsorUid ? APPS.doc(app.sponsorUid).get() : null,
    ]);
    out.private = priv;
    out.missions = missions;
    out.multiplier = multiplierFor(app, cfg);
    out.sponsorHandle = sponsor && sponsor.exists ? sponsor.data().xHandle || "" : "";
    out.checklist = {
      guide: !!app.onboarding?.guide,
      group: !!app.onboarding?.group,
      intro: !!app.onboarding?.intro,
      faucet: !!user.lastFaucetAt,
      swap: !!user.lastSwapAt,
    };
  }
  out.application = selfApp(uid, app);
  return out;
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/;
const TELEGRAM_RE = /^@[A-Za-z0-9_]{5,32}$/;

function cleanUrl(raw) {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString().slice(0, 500);
  } catch (e) {
    return null;
  }
}

// Resolve a referral / vanity code to an APPROVED ambassador uid (or null).
async function sponsorFromCode(code, selfUid) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(c)) return null;
  const s = await db.collection("referralCodes").doc(c).get();
  const uid = s.exists ? s.data().uid : null;
  if (!uid || uid === selfUid) return null;
  const a = await APPS.doc(uid).get();
  return a.exists && a.data().status === "approved" ? uid : null;
}

async function doApply(uid, data, cfg) {
  const { data: user } = await loadUser(uid);
  if (!user.walletAddress) {
    throw new HttpsError("failed-precondition", "Save your wallet on the dashboard before applying.");
  }
  const bad = (m) => new HttpsError("invalid-argument", m);

  const xHandle = clip(data.xHandle, 30).replace(/^@/, "");
  if (!HANDLE_RE.test(xHandle)) throw bad("Enter a valid X handle.");
  const region = clip(data.region, 60);
  const language = clip(data.language, 60);
  const audience = clip(data.audience, 200);
  const plan = clipText(data.plan, 1200);
  const community = clip(data.community, 200);
  if (region.length < 2 || language.length < 2) throw bad("Tell us your country and language.");
  if (plan.length < 40) throw bad("Describe your plan in a few sentences (40+ characters).");

  // Contact details — stored separately, admin-only, never public.
  const email = clip(data.email, 120).toLowerCase();
  const whatsapp = String(data.whatsapp || "").replace(/[\s\-()]/g, "");
  let telegram = clip(data.telegram, 40);
  if (telegram && !telegram.startsWith("@")) telegram = `@${telegram}`;
  if (!EMAIL_RE.test(email)) throw bad("Enter a valid email address.");
  if (!WHATSAPP_RE.test(whatsapp)) throw bad("Enter your WhatsApp number in international format, e.g. +923001234567.");
  if (!TELEGRAM_RE.test(telegram)) throw bad("Enter your Telegram username, e.g. @yourname (5-32 letters, numbers or _).");
  if (data.consent !== true) throw bad("Please agree that Pexli may contact you about the program.");
  if (data.age18 !== true) throw bad("You must be 18 or older to be an ambassador.");
  if (data.cocAgreed !== true) throw bad("Please agree to the Code of Conduct.");

  const platforms = {};
  for (const k of PLATFORMS) {
    const p = (data.platforms || {})[k];
    if (p === undefined || p === null || p === false || p === "") continue;
    platforms[k] = Math.max(0, Math.min(1e9, Math.trunc(Number(p) || 0)));
  }
  if (!Object.keys(platforms).length) throw bad("Pick at least one platform you use.");
  const samples = (Array.isArray(data.samples) ? data.samples : [])
    .map(cleanUrl)
    .filter(Boolean)
    .slice(0, 3);
  if (!samples.length) throw bad("Add at least one link to content you made (1-3 links).");
  const weeklyHours = Math.trunc(Number(data.weeklyHours) || 0);
  if (weeklyHours < 1 || weeklyHours > 80) throw bad("Tell us how many hours a week you can give (1-80).");

  // Sponsor: from an "invite an ambassador" code, else the person who referred
  // this user if they are an approved ambassador. Admin can change it later.
  let sponsorUid = await sponsorFromCode(data.sponsorCode, uid);
  if (!sponsorUid && user.referredBy && user.referredBy !== uid) {
    const r = await APPS.doc(user.referredBy).get();
    if (r.exists && r.data().status === "approved") sponsorUid = user.referredBy;
  }

  const ref = APPS.doc(uid);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const c = cur.exists ? cur.data() : {};
    if (["pending", "approved"].includes(c.status)) {
      throw new HttpsError("already-exists", `Your application is already ${c.status}.`);
    }
    if (c.status === "removed") {
      throw new HttpsError("permission-denied", "You were removed from the program and can't re-apply.");
    }
    tx.set(ref, {
      uid,
      status: "pending",
      xHandle,
      region,
      country: normCountry(region),
      language,
      audience,
      plan,
      community,
      platforms,
      samples,
      weeklyHours,
      age18: true,
      cocAgreed: true,
      sponsorUid: sponsorUid || null,
      displayName: user.displayName || "",
      wallet: user.walletAddress,
      referralCode: user.referralCode || "",
      appliedAt: Timestamp.now(),
      reviewedAt: null,
      note: "",
      // Kept across re-applications: history that must not reset.
      strikes: c.strikes || [],
      bonusPaid: c.bonusPaid || {},
      sponsorPaid: c.sponsorPaid || {},
      missionCounts: c.missionCounts || {},
      week: c.week || null,
      weekPosts: c.weekPosts || 0,
    });
    tx.set(CONTACTS.doc(uid), {
      uid,
      email,
      whatsapp,
      telegram,
      consent: true,
      consentText: CONSENT_TEXT,
      consentAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
  return doGet(uid, cfg);
}

// X status URL → canonical https://x.com/<handle>/status/<id>
function canonicalXPost(raw) {
  let u;
  try {
    u = new URL(normalizeUrl(raw));
  } catch (e) {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^mobile\./, "");
  if (!["x.com", "twitter.com"].includes(host)) return null;
  const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/);
  if (!m) return null;
  return { url: `https://x.com/${m[1].toLowerCase()}/status/${m[2]}`, handle: m[1], id: m[2] };
}

// Load the caller's application and require an approved ambassador.
async function requireApproved(uid) {
  const snap = await APPS.doc(uid).get();
  if (!snap.exists || snap.data().status !== "approved") {
    throw new HttpsError("permission-denied", "Only approved ambassadors can do this.");
  }
  return snap.data();
}

// Reserve a slot atomically (weekly post cap or per-mission cap), so parallel
// submits can't both slip past the limit. `check(app)` returns the update to
// write or throws. Returns the updated app.
async function reserveSlot(ref, check) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== "approved") {
      throw new HttpsError("permission-denied", "Only approved ambassadors can submit.");
    }
    const upd = check(snap.data());
    tx.set(ref, upd, { merge: true });
    return { ...snap.data(), ...upd };
  });
}

// Claim the link globally, then write the pending ledger row. On any failure
// the slot (and the link, if we claimed it) is handed back via `release`.
async function claimAndSubmit({ uid, url, taskType, points, refId, extra, release }) {
  const linkRef = db.collection("submittedLinks").doc(sha256(url));
  let linkClaimed = false;
  try {
    try {
      await linkRef.create({ uid, url, taskType, createdAt: Timestamp.now() });
      linkClaimed = true;
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message || "")) {
        throw new HttpsError("already-exists", "That link has already been submitted.");
      }
      throw e;
    }
    await awardPoints({ uid, taskType, points, refId, status: "pending", extra });
  } catch (e) {
    if (linkClaimed) await linkRef.delete().catch(() => {});
    try {
      await release();
    } catch (e2) {
      console.warn("slot release failed:", e2.message);
    }
    throw e;
  }
}

async function doSubmitPost(uid, data, cfg) {
  await loadUser(uid); // blocked accounts can't submit (throws with details)
  const app = await requireApproved(uid);
  const post = canonicalXPost(data.url);
  if (!post) throw new HttpsError("invalid-argument", "Paste a link to a single X post (x.com/…/status/…).");
  if (post.handle.toLowerCase() !== String(app.xHandle || "").toLowerCase()) {
    throw new HttpsError("invalid-argument", `The post must be from your ambassador account @${app.xHandle}.`);
  }

  const wk = weekKey();
  const cap = Number(cfg.weeklyPostCap) || 0;
  const ref = APPS.doc(uid);
  const after = await reserveSlot(ref, (a) => {
    const used = a.week === wk ? a.weekPosts || 0 : 0;
    if (used >= cap) {
      throw new HttpsError("resource-exhausted", `Weekly limit reached (${cap} posts). Resets Monday.`);
    }
    // The first post is the intro post on the onboarding checklist.
    return { week: wk, weekPosts: used + 1, onboarding: { ...(a.onboarding || {}), intro: true } };
  });
  const mult = multiplierFor(after, cfg);
  await claimAndSubmit({
    uid,
    url: post.url,
    taskType: "ambassador_post",
    points: Math.round((Number(cfg.postPoints) || 0) * mult),
    refId: post.url,
    extra: { tweetUrl: post.url, handle: post.handle, multiplier: mult },
    release: () =>
      db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const a = s.exists ? s.data() : {};
        if (a.week === wk && (a.weekPosts || 0) > 0) tx.set(ref, { weekPosts: a.weekPosts - 1 }, { merge: true });
      }),
  });
  return {
    ok: true,
    message: "Submitted. Points are credited after a human review.",
    postsThisWeek: after.weekPosts,
  };
}

async function doSubmitMission(uid, data, cfg) {
  await loadUser(uid);
  const app0 = await requireApproved(uid);
  const id = String(data.missionId || "");
  if (!id) throw new HttpsError("invalid-argument", "Missing mission.");
  const mSnap = await MISSIONS.doc(id).get();
  if (!mSnap.exists) throw new HttpsError("not-found", "Mission not found.");
  const m = mSnap.data();
  const now = Date.now();
  if (!m.active || (toMs(m.startAt) && toMs(m.startAt) > now) || (toMs(m.endAt) && toMs(m.endAt) < now)) {
    throw new HttpsError("failed-precondition", "This mission is not open right now.");
  }

  let url;
  let handle = app0.xHandle;
  if (m.type === "x_post" || m.type === "x_thread") {
    const post = canonicalXPost(data.url);
    if (!post) throw new HttpsError("invalid-argument", "Paste a link to your X post (x.com/…/status/…).");
    if (post.handle.toLowerCase() !== String(app0.xHandle || "").toLowerCase()) {
      throw new HttpsError("invalid-argument", `The post must be from your ambassador account @${app0.xHandle}.`);
    }
    url = post.url;
    handle = post.handle;
  } else {
    try {
      url = normalizeUrl(data.url);
    } catch (e) {
      throw new HttpsError("invalid-argument", "Paste a valid link (https://…).");
    }
  }

  const max = Number(m.maxPerAmbassador) || 0; // 0 = no per-ambassador limit
  const ref = APPS.doc(uid);
  const after = await reserveSlot(ref, (a) => {
    const used = (a.missionCounts || {})[id] || 0;
    if (max > 0 && used >= max) {
      throw new HttpsError("resource-exhausted", `You've reached this mission's limit (${max}).`);
    }
    return { missionCounts: { ...(a.missionCounts || {}), [id]: used + 1 } };
  });
  const mult = multiplierFor(after, cfg);
  await claimAndSubmit({
    uid,
    url,
    taskType: "ambassador_mission",
    points: Math.round((Number(m.points) || 0) * mult),
    refId: `${id}:${url}`,
    extra: { tweetUrl: url, handle, missionId: id, missionTitle: m.title, multiplier: mult },
    release: () =>
      db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const counts = (s.exists && s.data().missionCounts) || {};
        if ((counts[id] || 0) > 0) tx.set(ref, { missionCounts: { ...counts, [id]: counts[id] - 1 } }, { merge: true });
      }),
  });
  return { ok: true, message: "Submitted. Points are credited after a human review." };
}

// My Team: members who joined with my link (safe fields only — never emails,
// phone numbers or wallets) + the ambassadors I recruited.
async function doMyTeam(uid) {
  await requireApproved(uid);
  const [memSnap, recSnap, ledSnap] = await Promise.all([
    db.collection("users").where("referredBy", "==", uid).limit(2000).get(),
    APPS.where("sponsorUid", "==", uid).limit(500).get(),
    db.collection("pointsLedger").where("uid", "==", uid).limit(5000).get(),
  ]);

  const members = memSnap.docs
    .filter((d) => !d.data().isBot)
    .map((d) => {
      const u = d.data();
      return {
        name: u.displayName || (u.xHandle ? `@${u.xHandle}` : "Member"),
        joinedAt: toMs(u.createdAt),
        activated: !!u.walletAddress,
        tasksDone: u.tasksDone || 0,
        points: u.points || 0,
      };
    })
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

  // What I earned from each recruited ambassador (team share + milestones).
  const earned = {};
  let teamTotal = 0;
  for (const d of ledSnap.docs) {
    const r = d.data();
    if (r.taskType !== "team_share" && r.taskType !== "sponsor_milestone") continue;
    if (r.status && r.status !== "final") continue;
    earned[r.viaUid || "?"] = (earned[r.viaUid || "?"] || 0) + (r.points || 0);
    teamTotal += r.points || 0;
  }
  const ambassadors = recSnap.docs
    .map((d) => {
      const a = d.data();
      return {
        xHandle: a.xHandle,
        name: a.displayName || "",
        status: a.status,
        tier: effectiveTier(a),
        verifiedMembers: a.verifiedMembers || 0,
        earned: earned[d.id] || 0,
      };
    })
    .sort((a, b) => b.verifiedMembers - a.verifiedMembers);

  return {
    members: members.slice(0, 500),
    memberCount: members.length,
    activatedCount: members.filter((m) => m.activated).length,
    ambassadors,
    teamEarned: teamTotal,
  };
}

async function doSetVanity(uid, data) {
  await requireApproved(uid);
  const code = String(data.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Code must be 3-12 letters or numbers.");
  }
  if (RESERVED_CODES.has(code)) throw new HttpsError("invalid-argument", "That code is reserved.");
  const ref = APPS.doc(uid);
  const codeRef = db.collection("referralCodes").doc(code);
  await db.runTransaction(async (tx) => {
    const [a, c] = await Promise.all([tx.get(ref), tx.get(codeRef)]);
    if (c.exists && c.data().uid !== uid) throw new HttpsError("already-exists", "That code is taken.");
    const old = a.data().vanityCode;
    if (old && old !== code) {
      const oldRef = db.collection("referralCodes").doc(old);
      const o = await tx.get(oldRef);
      if (o.exists && o.data().uid === uid && o.data().vanity) tx.delete(oldRef);
    }
    tx.set(codeRef, { uid, vanity: true });
    tx.set(ref, { vanityCode: code }, { merge: true });
  });
  return { ok: true, vanityCode: code };
}

const GROUP_HOSTS = ["t.me", "telegram.me", "chat.whatsapp.com", "whatsapp.com", "wa.me"];
// "" clears; null = invalid.
function cleanGroupUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const u = cleanUrl(s);
  if (!u || !u.startsWith("https://")) return null;
  const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  return GROUP_HOSTS.includes(host) ? u : null;
}

async function doSetGroup(uid, data) {
  await requireApproved(uid);
  const url = cleanGroupUrl(data.url);
  if (url === null) throw new HttpsError("invalid-argument", "Use an https:// Telegram (t.me) or WhatsApp group link.");
  await APPS.doc(uid).set({ groupUrl: url }, { merge: true });
  return { ok: true, groupUrl: url };
}

async function doOnboardingTick(uid, data) {
  await requireApproved(uid);
  const item = String(data.item || "");
  if (!["guide", "group"].includes(item)) throw new HttpsError("invalid-argument", "Unknown checklist item.");
  await APPS.doc(uid).set({ onboarding: { [item]: true } }, { merge: true });
  return { ok: true };
}

// For any signed-in user: the ambassador who invited them (public info only).
async function doMyAmbassador(uid) {
  const u = await db.collection("users").doc(uid).get();
  const ref = u.exists ? u.data().referredBy : null;
  if (!ref) return { ambassador: null };
  const a = await APPS.doc(ref).get();
  if (!a.exists || a.data().status !== "approved") return { ambassador: null };
  const d = a.data();
  return { ambassador: { xHandle: d.xHandle, tier: effectiveTier(d), groupUrl: d.groupUrl || "" } };
}

async function requireRegionalLead(uid) {
  const app = await requireApproved(uid);
  if (!app.regionalLead || !LEAD_TIERS.has(effectiveTier(app))) {
    throw new HttpsError("permission-denied", "Only Regional Leads can do this.");
  }
  return app;
}

async function doRegionView(uid) {
  const me = await requireRegionalLead(uid);
  const country = me.country || normCountry(me.region);
  const snap = await APPS.where("country", "==", country).limit(300).get();
  const rows = snap.docs
    .filter((d) => d.id !== uid && ["pending", "approved"].includes(d.data().status))
    .map((d) => leadView(d.id, d.data(), uid))
    .sort((a, b) =>
      a.status === b.status ? (b.appliedAt || 0) - (a.appliedAt || 0) : a.status === "pending" ? -1 : 1,
    );
  return { country: me.region, rows };
}

// Regional Leads RECOMMEND — only an admin approves.
async function doRecommend(uid, data) {
  const me = await requireRegionalLead(uid);
  const target = String(data.uid || "");
  if (!target || target === uid) throw new HttpsError("invalid-argument", "Pick an application.");
  const ref = APPS.doc(target);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "pending") {
    throw new HttpsError("failed-precondition", "Not a pending application.");
  }
  const country = me.country || normCountry(me.region);
  if ((snap.data().country || normCountry(snap.data().region)) !== country) {
    throw new HttpsError("permission-denied", "You can only recommend applications from your country.");
  }
  await ref.update({
    [`recommendations.${uid}`]:
      data.withdraw === true
        ? FieldValue.delete()
        : { handle: me.xHandle, note: clip(data.note, 300), at: Timestamp.now() },
  });
  return { ok: true };
}

// Public monthly board: verified members gained this month + approved
// mission/post points this month. Top 3 highlighted in the UI.
let boardCache = null;
async function doBoard(cfg) {
  if (boardCache && Date.now() - boardCache.at < BOARD_TTL_MS) return boardCache.data;
  const cur = monthKey();
  const weight = Number(cfg.boardMemberPoints) || 0;
  const snap = await APPS.where("status", "==", "approved").limit(2000).get();
  const rows = snap.docs
    .map((d) => {
      const a = d.data();
      const members = a.statsMonth === cur ? a.monthMembers || 0 : 0;
      const missionPts = a.mMonth === cur ? a.mMissionPts || 0 : 0;
      return {
        name: a.displayName || `@${a.xHandle}`,
        xHandle: a.xHandle,
        tier: effectiveTier(a),
        members,
        missionPts,
        score: members * weight + missionPts,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((r, i) => ({ rank: i + 1, ...r }));
  const data = { month: cur, memberPoints: weight, rows };
  boardCache = { at: Date.now(), data };
  return data;
}

// ---------------------------------------------------------------------------
// Admin actions.

async function handlesFor(uids) {
  const ids = [...new Set(uids.filter(Boolean))];
  if (!ids.length) return {};
  const snaps = await db.getAll(...ids.map((id) => APPS.doc(id)));
  const out = {};
  for (const s of snaps) if (s.exists) out[s.id] = s.data().xHandle || "";
  return out;
}

async function adminRows(status) {
  const q = status === "all" ? APPS.limit(2000) : APPS.where("status", "==", status).limit(1000);
  const snap = await q.get();
  const docs = snap.docs;
  const contacts = docs.length ? await db.getAll(...docs.map((d) => CONTACTS.doc(d.id))) : [];
  const cmap = {};
  for (const c of contacts) if (c.exists) cmap[c.id] = c.data();
  const handles = await handlesFor(docs.map((d) => d.data().sponsorUid));
  return docs.map((d) => adminRow(d.id, d.data(), cmap[d.id], handles));
}

async function doAdminList(data) {
  const status = ["pending", "approved", "rejected", "removed", "all"].includes(data.status) ? data.status : "pending";
  let rows = await adminRows(status);
  const countries = [...new Set(rows.map((r) => r.region).filter(Boolean))].sort();
  const country = normCountry(data.country);
  if (country) rows = rows.filter((r) => r.country.includes(country));
  if (ALL_TIERS.includes(data.tier)) rows = rows.filter((r) => r.tier === data.tier);
  rows.sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));
  return { rows, countries };
}

function csvCell(v) {
  const s = Array.isArray(v) ? v.join(" ") : v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function doAdminExport() {
  const rows = await adminRows("all");
  const cols = [
    "uid", "status", "tier", "xHandle", "displayName", "email", "whatsapp", "telegram", "region", "language",
    "platforms", "samples", "weeklyHours", "verifiedMembers", "invited", "monthApproved", "inactive",
    "strikes", "regionalLead", "vanityCode", "groupUrl", "sponsorHandle", "wallet", "appliedAt", "reviewedAt",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          if (c === "strikes") return csvCell(r.strikes.length);
          if (c === "appliedAt" || c === "reviewedAt") return csvCell(r[c] ? new Date(r[c]).toISOString() : "");
          return csvCell(r[c]);
        })
        .join(","),
    );
  }
  return { csv: lines.join("\n"), count: rows.length };
}

async function doAdminReview(adminUid, data) {
  const uid = String(data.uid || "");
  const decision = data.decision === "approved" ? "approved" : data.decision === "rejected" ? "rejected" : null;
  if (!uid || !decision) throw new HttpsError("invalid-argument", "Missing uid or decision.");
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
  if (snap.data().status === "removed") throw new HttpsError("failed-precondition", "This ambassador was removed.");
  const upd = {
    status: decision,
    note: clip(data.note, 300),
    reviewedAt: Timestamp.now(),
    reviewedBy: adminUid,
    statsAt: null, // force a fresh count on next view
  };
  if (decision === "approved") {
    Object.assign(upd, {
      approvedAt: Timestamp.now(),
      mMonth: monthKey(),
      mApproved: 0,
      mMissionPts: 0,
      inactive: false,
    });
  } else {
    upd.cashEligible = false;
    upd.regionalLead = false;
  }
  await ref.set(upd, { merge: true });
  await syncStatus(uid, { ...snap.data(), ...upd });
  boardCache = null;
  return { ok: true };
}

// Removal side effects: stop perks, free the vanity code, reject pending
// ambassador submissions, and (fraud only) forfeit ambassador points through
// the same adjust path the admin Users tab uses.
async function finishRemoval(uid, { fraud, reason }) {
  const ref = APPS.doc(uid);
  const app = (await ref.get()).data() || {};
  await syncStatus(uid, app);
  if (app.vanityCode) {
    const c = db.collection("referralCodes").doc(app.vanityCode);
    const cs = await c.get();
    if (cs.exists && cs.data().uid === uid && cs.data().vanity) await c.delete();
    await ref.set({ vanityCode: "" }, { merge: true });
  }
  const led = await db.collection("pointsLedger").where("uid", "==", uid).limit(10000).get();
  let batch = db.batch();
  let inBatch = 0;
  let pending = 0;
  let forfeit = 0;
  for (const d of led.docs) {
    const r = d.data();
    if (!FORFEIT_TYPES.has(r.taskType)) continue;
    if (r.status === "pending") {
      batch.set(d.ref, { status: "rejected" }, { merge: true });
      pending++;
      if (++inBatch >= 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    } else if (r.status === "final") {
      forfeit += r.points || 0;
    }
  }
  if (inBatch) await batch.commit();
  let forfeited = 0;
  if (fraud && forfeit > 0 && !app.forfeited) {
    await adjustPointsCore(uid, -forfeit, `Ambassador fraud: ambassador points forfeited (${clip(reason, 120)})`);
    forfeited = forfeit;
    await ref.set({ forfeited }, { merge: true });
  }
  boardCache = null;
  return { rejectedPending: pending, forfeited };
}

async function doAdminRemove(adminUid, data) {
  const uid = String(data.uid || "");
  const fraud = data.fraud === true;
  const reason = clip(data.reason, 300) || (fraud ? "Fraud" : "Removed by admin");
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
  await ref.set(
    {
      status: "removed",
      fraud,
      removedReason: reason,
      removedAt: Timestamp.now(),
      removedBy: adminUid,
      cashEligible: false,
      regionalLead: false,
    },
    { merge: true },
  );
  const res = await finishRemoval(uid, { fraud, reason });
  return { ok: true, ...res };
}

async function doAdminStrike(adminUid, data) {
  const uid = String(data.uid || "");
  const reason = clip(data.reason, 300);
  if (!uid || !reason) throw new HttpsError("invalid-argument", "A strike needs a reason.");
  const ref = APPS.doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
    const strikes = [...(snap.data().strikes || []), { reason, at: Timestamp.now(), by: adminUid }];
    const upd = { strikes };
    const remove = strikes.length >= STRIKES_TO_REMOVE && snap.data().status !== "removed";
    if (remove) {
      Object.assign(upd, {
        status: "removed",
        removedReason: `${STRIKES_TO_REMOVE} strikes`,
        removedAt: Timestamp.now(),
        removedBy: adminUid,
        cashEligible: false,
        regionalLead: false,
      });
    }
    tx.set(ref, upd, { merge: true });
    return { strikes: strikes.length, removed: remove };
  });
  if (out.removed) await finishRemoval(uid, { fraud: false, reason: "3 strikes" });
  return { ok: true, ...out };
}

async function doAdminRemoveStrike(data) {
  const uid = String(data.uid || "");
  const index = Math.trunc(Number(data.index));
  const ref = APPS.doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
    const strikes = [...(snap.data().strikes || [])];
    if (!(index >= 0 && index < strikes.length)) throw new HttpsError("invalid-argument", "No such strike.");
    strikes.splice(index, 1);
    tx.set(ref, { strikes }, { merge: true });
  });
  return { ok: true };
}

async function doAdminSetTier(data) {
  const uid = String(data.uid || "");
  const tier = ALL_TIERS.includes(data.tier) ? data.tier : null;
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
  const next = { ...snap.data(), tierOverride: tier };
  const upd = { tierOverride: tier, cashEligible: CASH_TIERS.has(effectiveTier(next)) };
  if (!LEAD_TIERS.has(effectiveTier(next))) upd.regionalLead = false;
  await ref.set(upd, { merge: true });
  await syncStatus(uid, { ...next, ...upd });
  boardCache = null;
  return { ok: true };
}

async function doAdminSetRegionalLead(data) {
  const uid = String(data.uid || "");
  const on = data.on === true;
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
  const a = snap.data();
  if (on && (a.status !== "approved" || !LEAD_TIERS.has(effectiveTier(a)))) {
    throw new HttpsError("failed-precondition", "Only approved Lead or Champion ambassadors can be Regional Leads.");
  }
  await ref.set({ regionalLead: on, country: a.country || normCountry(a.region) }, { merge: true });
  return { ok: true };
}

async function doAdminRevokeVanity(data) {
  const uid = String(data.uid || "");
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
  const code = snap.data().vanityCode;
  if (code) {
    const c = db.collection("referralCodes").doc(code);
    const cs = await c.get();
    if (cs.exists && cs.data().uid === uid && cs.data().vanity) await c.delete();
  }
  await ref.set({ vanityCode: "" }, { merge: true });
  return { ok: true };
}

async function doAdminSetSponsor(data) {
  const uid = String(data.uid || "");
  const raw = String(data.sponsor || "").trim();
  const ref = APPS.doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ambassador not found.");
  let sponsorUid = null;
  if (raw) {
    // Accept a uid, a referral/vanity code, or an @handle of an approved ambassador.
    if (/^[A-Za-z0-9_-]{6,128}$/.test(raw)) {
      const direct = await APPS.doc(raw).get();
      if (direct.exists && direct.data().status === "approved") sponsorUid = raw;
    }
    if (!sponsorUid) sponsorUid = await sponsorFromCode(raw, uid);
    if (!sponsorUid) {
      const byHandle = await APPS.where("xHandle", "==", raw.replace(/^@/, "")).limit(5).get();
      const hit = byHandle.docs.find((d) => d.data().status === "approved");
      if (hit) sponsorUid = hit.id;
    }
    if (!sponsorUid) throw new HttpsError("not-found", "No approved ambassador matches that code / handle / uid.");
    if (sponsorUid === uid) throw new HttpsError("invalid-argument", "An ambassador can't sponsor themselves.");
  }
  await ref.set({ sponsorUid }, { merge: true });
  await syncStatus(uid, { ...snap.data(), sponsorUid });
  return { ok: true, sponsorUid };
}

const toTs = (ms) => (ms ? Timestamp.fromMillis(Number(ms)) : null);

async function doAdminMissions() {
  const snap = await MISSIONS.orderBy("createdAt", "desc").limit(200).get();
  return { missions: snap.docs.map((d) => missionOut(d.id, d.data())), types: MISSION_TYPES };
}

async function doAdminMissionSave(data) {
  const title = clip(data.title, 120);
  if (title.length < 3) throw new HttpsError("invalid-argument", "Give the mission a title.");
  if (!MISSION_TYPES[data.type]) throw new HttpsError("invalid-argument", "Pick a mission type.");
  const startAt = Number(data.startAt) || null;
  const endAt = Number(data.endAt) || null;
  if (startAt && endAt && endAt <= startAt) throw new HttpsError("invalid-argument", "End date must be after the start.");
  const doc = {
    title,
    description: clipText(data.description, 2000),
    type: data.type,
    points: Math.max(0, Math.trunc(Number(data.points) || 0)),
    startAt: toTs(startAt),
    endAt: toTs(endAt),
    maxPerAmbassador: Math.max(0, Math.trunc(Number(data.maxPerAmbassador) || 0)),
    active: data.active !== false,
    updatedAt: Timestamp.now(),
  };
  if (data.id) {
    await MISSIONS.doc(String(data.id)).set(doc, { merge: true });
    return { ok: true, id: String(data.id) };
  }
  const ref = await MISSIONS.add({ ...doc, createdAt: Timestamp.now() });
  return { ok: true, id: ref.id };
}

async function doAdminMissionDelete(data) {
  if (!data.id) throw new HttpsError("invalid-argument", "Missing mission id.");
  await MISSIONS.doc(String(data.id)).delete();
  return { ok: true };
}

async function doAdminSaveSettings(data) {
  const upd = {};
  if ("groupLink" in data) {
    const g = cleanGroupUrl(data.groupLink);
    if (g === null) throw new HttpsError("invalid-argument", "Use an https:// Telegram (t.me) or WhatsApp group link.");
    upd.groupLink = g;
  }
  if ("announcement" in data) {
    const text = clipText(data.announcement, 1000);
    upd.announcement = text ? { text, at: Timestamp.now() } : null;
  }
  await PRIVATE.set(upd, { merge: true });
  return { ok: true, ...(await readPrivate()) };
}

// ---------------------------------------------------------------------------

const ADMIN_ACTIONS = {
  adminList: (a, d) => doAdminList(d),
  adminExport: () => doAdminExport(),
  adminReview: (a, d) => doAdminReview(a, d),
  adminRemove: (a, d) => doAdminRemove(a, d),
  adminStrike: (a, d) => doAdminStrike(a, d),
  adminRemoveStrike: (a, d) => doAdminRemoveStrike(d),
  adminSetTier: (a, d) => doAdminSetTier(d),
  adminSetRegionalLead: (a, d) => doAdminSetRegionalLead(d),
  adminRevokeVanity: (a, d) => doAdminRevokeVanity(d),
  adminSetSponsor: (a, d) => doAdminSetSponsor(d),
  adminMissions: () => doAdminMissions(),
  adminMissionSave: (a, d) => doAdminMissionSave(d),
  adminMissionDelete: (a, d) => doAdminMissionDelete(d),
  adminSettings: () => readPrivate(),
  adminSaveSettings: (a, d) => doAdminSaveSettings(d),
  adminRefreshAll: () => dailyMaintenance(),
};

const MEMBER_ACTIONS = {
  get: (u, d, cfg) => doGet(u, cfg),
  myAmbassador: (u) => doMyAmbassador(u),
  myTeam: (u) => doMyTeam(u),
  regionView: (u) => doRegionView(u),
  recommend: (u, d) => doRecommend(u, d),
  setVanity: (u, d) => doSetVanity(u, d),
  setGroup: (u, d) => doSetGroup(u, d),
  onboardingTick: (u, d) => doOnboardingTick(u, d),
};

// Paused program: reading still works, new applications/submissions don't.
const OPEN_ONLY_ACTIONS = {
  apply: (u, d, cfg) => doApply(u, d, cfg),
  submitPost: (u, d, cfg) => doSubmitPost(u, d, cfg),
  submitMission: (u, d, cfg) => doSubmitMission(u, d, cfg),
};

const ambassador = onCall({ ...CALL_OPTS, timeoutSeconds: 300 }, async (request) => {
  const action = String(request.data?.action || "get");
  const data = request.data || {};
  const cfg = (await getConfig()).ambassador;

  if (action === "board") return doBoard(cfg); // public, no sign-in

  if (Object.prototype.hasOwnProperty.call(ADMIN_ACTIONS, action)) {
    return ADMIN_ACTIONS[action](requireAdmin(request), data);
  }

  const uid = requireAuth(request);
  if (Object.prototype.hasOwnProperty.call(MEMBER_ACTIONS, action)) {
    return MEMBER_ACTIONS[action](uid, data, cfg);
  }
  if (Object.prototype.hasOwnProperty.call(OPEN_ONLY_ACTIONS, action)) {
    if (!cfg.enabled) throw new HttpsError("failed-precondition", "The ambassador program is paused.");
    return OPEN_ONLY_ACTIONS[action](uid, data, cfg);
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
});

module.exports = {
  ambassador,
  recordApproval,
  dailyMaintenance,
  canonicalXPost,
  weekKey,
  monthKey,
  monthRollUpdate,
  tierFor,
  effectiveTier,
  multiplierFor,
  cleanGroupUrl,
};
