import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";
import { LINKS } from "../lib/chain";
import Icon from "../components/Icon";

// Ambassador program: public explainer + monthly board, and (signed in) the
// apply form or the ambassador's own home (overview, missions, team,
// resources, region). All state lives server-side in the `ambassador`
// callable; this page only renders it.
function ambCfg(config) {
  const d = DEFAULT_CONFIG.ambassador;
  const a = config?.ambassador || {};
  const out = { ...d, ...a };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object") out[k] = { ...v, ...(a[k] || {}) };
  }
  return out;
}

const TIER_LABEL = { ambassador: "Ambassador", rising: "Rising", lead: "Lead", champion: "Champion" };
const n = (v) => Number(v || 0).toLocaleString();
const day = (ms) => (ms ? new Date(ms).toLocaleDateString() : "");
const SPONSOR_KEY = "pexli_amb_sponsor";

function safeGet(k) {
  try {
    return localStorage.getItem(k) || "";
  } catch (e) {
    return "";
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* storage blocked */
  }
}

// "Invite an ambassador" links carry ?sponsor=CODE — remember it for apply.
function captureSponsor() {
  try {
    const code = new URLSearchParams(window.location.search).get("sponsor");
    if (code) safeSet(SPONSOR_KEY, code.trim().toUpperCase());
  } catch (e) {
    /* ignore */
  }
}

async function copyText(text, setCopied) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  } catch (e) {
    /* clipboard blocked */
  }
}

export default function Ambassador() {
  const { user, isActive, profile, config } = useAuth();
  const A = ambCfg(config);
  const [data, setData] = useState(undefined); // undefined = loading
  const [err, setErr] = useState("");

  useEffect(() => {
    captureSponsor();
  }, []);

  async function load() {
    if (!user) return setData(null);
    setErr("");
    try {
      const res = await api.ambassador({ action: "get" });
      setData(res.data);
    } catch (e) {
      setErr(errMessage(e));
      setData(null);
    }
  }
  useEffect(() => {
    load();
  }, [user]);

  const app = data?.application || null;

  return (
    <div className="amb-page">
      <div className="hero" style={{ paddingTop: 40, paddingBottom: 20 }}>
        <div className="hero-badge">
          <span className="dot" /> Pexli Ambassador Program
        </div>
        <h1>
          Build the <span className="accent">Pexli</span> community with us
        </h1>
        <p>
          Explain Pexli on X, bring real users, and grow a community in your language. Every
          approved post and every verified member you bring moves you up the tiers.
        </p>
      </div>

      {/* Status / apply / ambassador home */}
      <div>
        {!user ? (
          <div className="panel">
            <h3 className="card-title">
              <Icon name="star" /> Apply
            </h3>
            <p className="subtle">Sign in and save your wallet first, then come back to this page to apply.</p>
            <Link className="btn btn-primary btn-sm" to="/">
              Sign in
            </Link>
          </div>
        ) : !isActive ? (
          <div className="panel">
            <p className="subtle" style={{ margin: 0 }}>
              Finish activation (sign in and save a wallet) before applying.{" "}
              <Link to="/activate">Activate</Link>
            </p>
          </div>
        ) : data === undefined ? (
          <div className="center" style={{ minHeight: 120 }}>
            <div className="spin" />
          </div>
        ) : app && app.status === "approved" ? (
          <AmbassadorHome data={data} A={A} profile={profile} onChange={load} />
        ) : app && app.status === "pending" ? (
          <div className="panel">
            <h3 className="card-title">
              <Icon name="check" /> Application received
            </h3>
            <p className="subtle" style={{ margin: 0 }}>
              Thanks, @{app.xHandle}. A human on the Pexli team reviews every application. You'll see
              the result on this page. Meanwhile, keep sharing your referral link: members you bring
              now count once you're approved.
            </p>
          </div>
        ) : app && app.status === "removed" ? (
          <div className="panel">
            <h3 className="card-title" style={{ color: "var(--red)" }}>
              Removed from the program
            </h3>
            <p className="subtle" style={{ margin: 0 }}>
              {app.removedReason ? `Reason: ${app.removedReason}. ` : ""}You can keep using Pexli Drop
              as a normal member.
            </p>
          </div>
        ) : (
          <ApplyForm prev={app} contacts={data?.contacts} enabled={A.enabled} onDone={setData} />
        )}
        {err && <p className="msg err">{err}</p>}
      </div>

      {/* Tiers */}
      <div className="section-head mt">
        <h2 className="section-title">Tiers</h2>
      </div>
      <div className="grid amb-tiers">
        <TierCard
          name="Ambassador"
          need="Approved application"
          reward={`${A.postPoints} pts per approved post (up to ${A.weeklyPostCap}/week) + ${A.ambassadorReferralPercent}% referral share`}
          mult={A.tierMultiplier.ambassador}
        />
        <TierCard
          name="Rising"
          need={`${n(A.tiers.rising)} verified members`}
          reward={`+${n(A.tierBonus.rising)} bonus points`}
          mult={A.tierMultiplier.rising}
        />
        <TierCard
          name="Lead"
          need={`${n(A.tiers.lead)} verified members`}
          reward={`+${n(A.tierBonus.lead)} bonus points and eligible for a cash reward`}
          mult={A.tierMultiplier.lead}
          cash
        />
        <TierCard
          name="Champion"
          need={`${n(A.tiers.champion)} verified members`}
          reward={`+${n(A.tierBonus.champion)} bonus points and eligible for a cash reward`}
          mult={A.tierMultiplier.champion}
          cash
        />
      </div>
      <p className="subtle amb-note">
        A <b>verified member</b> is someone who joins Pexli Drop with your referral link and saves a
        wallet. Followers, likes and empty sign-ups don't count. The multiplier applies to mission
        and post points. Ambassadors get an ambassador badge on the leaderboard.
      </p>

      <MonthlyBoard />

      {/* Tasks */}
      <div className="section-head mt">
        <h2 className="section-title">What ambassadors do</h2>
      </div>
      <div className="grid">
        <Task
          icon="x"
          title="Daily: quote or reply to Pexli on X"
          text={`Add your own take to the latest post from ${LINKS.x.replace("https://", "")}. Your own words, never copy-paste. Submit the link here for review.`}
        />
        <Task
          icon="edit"
          title="Missions: threads, videos, events and more"
          text="Pick a mission from the missions board: an X thread, a short video, a local event, a translation, a bug report or a meme. Each one is reviewed by a human."
        />
        <Task
          icon="users"
          title="Ongoing: grow your community"
          text="Share your referral link. Help new people sign in, save a wallet and finish their first tasks. That's what counts as a verified member."
        />
        <Task
          icon="spark"
          title="Optional: run a local group"
          text="Start a Telegram or WhatsApp group in your language and answer questions. Your members see your group link on their dashboard."
        />
      </div>

      <TeamRules A={A} normalPct={config?.referral?.percent ?? DEFAULT_CONFIG.referral.percent} />

      {/* Rewards + rules */}
      <div className="grid mt">
        <div className="panel">
          <h3 className="card-title">
            <Icon name="gift" /> Rewards
          </h3>
          <ul className="amb-list">
            <li>Points for every approved post, plus your normal referral share of what your members earn.</li>
            <li>One-time bonus points when you reach Rising, Lead and Champion.</li>
            <li>
              At mainnet, points convert to PEX from the community contributor pool (1% of total PEX
              supply), vesting over 3 to 5 months. Final terms are published before mainnet.
            </li>
            <li>
              Lead and Champion ambassadors are eligible for a <b>cash reward</b>, paid only after
              Pexli closes its funding round. Amounts are announced then. Pexli pays no cash today.
            </li>
          </ul>
        </div>
        <CodeOfConduct A={A} />
      </div>

      <Resources />
    </div>
  );
}

function TierCard({ name, need, reward, cash, mult }) {
  return (
    <div className="card amb-tier">
      <div className="row spread">
        <h3 className="card-title" style={{ margin: 0 }}>
          <Icon name="trophy" /> {name}
        </h3>
        {cash && <span className="badge on">Cash eligible</span>}
      </div>
      <p className="subtle" style={{ margin: "8px 0 4px" }}>{need}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{reward}</p>
      {mult ? <p className="subtle" style={{ margin: "6px 0 0", fontSize: 13 }}>Mission points x{mult}</p> : null}
    </div>
  );
}

function Task({ icon, title, text }) {
  return (
    <div className="card">
      <h3 className="card-title">
        <Icon name={icon} /> {title}
      </h3>
      <p className="task-desc" style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

// "Build a team of ambassadors" — points only, two levels, capped.
function TeamRules({ A, normalPct }) {
  const M = A.sponsorMilestones;
  const B = A.sponsorMilestoneBonus;
  return (
    <div className="panel mt">
      <h3 className="card-title">
        <Icon name="users" /> Build a team of ambassadors
      </h3>
      <p className="task-desc" style={{ marginTop: 0 }}>
        Approved ambassadors can invite other people to become ambassadors too. Everything here is
        points only, and it is always free: there is no fee or purchase to join, ever.
      </p>
      <ul className="amb-list">
        <li>
          Your own members: you earn <b>{A.ambassadorReferralPercent}%</b> of the points they earn
          (normal users earn {normalPct}%).
        </li>
        <li>
          Ambassadors you invite: you earn <b>{A.teamSharePercent}%</b> of the points earned by their
          own members. It stops there: nothing further down ever pays you.
        </li>
        <li>
          Team milestones: when an ambassador you invited reaches {n(M.m1)} / {n(M.m2)} /{" "}
          {n(M.m3)} verified members, you get +{n(B.m1)} / +{n(B.m2)} / +{n(B.m3)} points, once each.
        </li>
        <li>
          Nothing is paid just for inviting someone. Every team reward comes from real, verified
          users doing real tasks.
        </li>
        <li>Inactive ambassadors earn the normal referral share until their next approved submission.</li>
      </ul>
    </div>
  );
}

function CodeOfConduct({ A }) {
  return (
    <div className="panel" id="code-of-conduct">
      <h3 className="card-title">
        <Icon name="shield" /> Code of Conduct
      </h3>
      <ul className="amb-list">
        <li>
          Say you're a Pexli ambassador: add <b>#PexliAmbassador</b> to your posts.
        </li>
        <li>No bots, fake accounts, follow-trains or engagement farming. One account per person.</li>
        <li>No price or profit promises. Pexli is on testnet; test PEX has no value.</li>
        <li>Don't spam other projects' replies or DMs.</li>
        <li>Be respectful. Never ask members for their recovery phrase, password or private key.</li>
        <li>
          Stay active: at least {A.activityMin} approved submissions a month, or your status becomes
          inactive until your next approved submission.
        </li>
        <li>
          Admins can give strikes with a reason; 3 strikes means removal. Fraud means immediate
          removal and losing ambassador points.
        </li>
      </ul>
    </div>
  );
}

const FACTS = [
  ["Testnet", "Pexli is on testnet. Test PEX has no value and can't be bought or sold."],
  ["Unaudited", "The chain and apps have not been security-audited yet. Say so if people ask."],
  ["Dual-VM", "Solidity (EVM) and Rust smart contracts run on the same chain."],
  ["Post-quantum transactions", "Transactions can be signed with ML-DSA-87, a NIST-standardized post-quantum signature scheme."],
  ["Lifelox Wallet", "Create a post-quantum (quantum-safe) account in the Lifelox Wallet."],
  ["Lifelox DEX", "Swap tokens on the Lifelox DEX, including pools that pair a Rust token with a Solidity token."],
];

const SAMPLE_POSTS = [
  "I just made a quantum-safe account in the Lifelox Wallet on the @PexliLabs testnet. Transactions are signed with ML-DSA-87. Trying it is free: drop.pex.li #PexliAmbassador",
  "On @PexliLabs, Solidity and Rust contracts live on one chain. I swapped a Rust token for a Solidity token in one pool on the Lifelox DEX. Testnet only, test PEX has no value. #PexliAmbassador",
  "Thread: what post-quantum signatures are, and how @PexliLabs uses ML-DSA-87 on its testnet. 1/5 #PexliAmbassador",
];

function Resources() {
  const [copied, setCopied] = useState(-1);
  return (
    <>
      <div className="section-head mt">
        <h2 className="section-title">Resources</h2>
      </div>
      <div className="grid">
        <div className="panel">
          <h3 className="card-title">
            <Icon name="check" /> Approved facts
          </h3>
          <ul className="amb-list">
            {FACTS.map(([t, d]) => (
              <li key={t}>
                <b>{t}:</b> {d}
              </li>
            ))}
          </ul>
          <div className="links-grid mt">
            <a className="btn btn-sm btn-ghost" href={LINKS.wallet} target="_blank" rel="noreferrer">
              Lifelox Wallet
            </a>
            <a className="btn btn-sm btn-ghost" href={LINKS.dex} target="_blank" rel="noreferrer">
              Lifelox DEX
            </a>
            <a className="btn btn-sm btn-ghost" href={LINKS.faucet} target="_blank" rel="noreferrer">
              Faucet
            </a>
          </div>
        </div>
        <div className="panel">
          <h3 className="card-title">
            <Icon name="shield" /> Do and don't
          </h3>
          <p className="subtle" style={{ margin: "0 0 4px" }}><b>Do</b></p>
          <ul className="amb-list">
            <li>Disclose: add #PexliAmbassador to every post.</li>
            <li>Show what you tried yourself, in your own words.</li>
            <li>Say clearly that it's a testnet and test PEX has no value.</li>
          </ul>
          <p className="subtle" style={{ margin: "12px 0 4px" }}><b>Don't</b></p>
          <ul className="amb-list">
            <li>No price talk, listings or "moon" posts.</li>
            <li>No profit or return promises, no "free money".</li>
            <li>No paid promotion, bots or fake engagement.</li>
          </ul>
        </div>
        <div className="panel">
          <h3 className="card-title">
            <Icon name="download" /> Logos
          </h3>
          <div className="amb-logos">
            <a href="/LogoWhite.svg" download className="amb-logo dark">
              <img src="/LogoWhite.svg" alt="Pexli logo, white" />
              <span>White (SVG)</span>
            </a>
            <a href="/LogoBlack.svg" download className="amb-logo light">
              <img src="/LogoBlack.svg" alt="Pexli logo, black" />
              <span>Black (SVG)</span>
            </a>
            <a href="/icon-512.png" download className="amb-logo">
              <img src="/icon-512.png" alt="Pexli Drop icon" />
              <span>App icon (PNG)</span>
            </a>
          </div>
        </div>
      </div>
      <div className="panel mt">
        <h3 className="card-title">
          <Icon name="edit" /> Sample posts
        </h3>
        <p className="task-desc" style={{ marginTop: 0 }}>
          Use these as a starting point, then rewrite them in your own words and language.
        </p>
        <div className="amb-samples">
          {SAMPLE_POSTS.map((t, i) => (
            <div className="amb-sample" key={i}>
              <p>{t}</p>
              <button className="btn btn-sm" onClick={() => copyText(t, (v) => setCopied(v ? i : -1))}>
                <Icon name={copied === i ? "check" : "copy"} size={15} /> {copied === i ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Public monthly board: members gained this month + approved mission points.
function MonthlyBoard() {
  const [b, setB] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api
      .ambassador({ action: "board" })
      .then((r) => setB(r.data))
      .catch(() => setErr("The leaderboard is unavailable right now. Try again later."));
  }, []);
  const monthName = b?.month
    ? new Date(`${b.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  return (
    <>
      <div className="section-head mt">
        <h2 className="section-title">
          <Icon name="trophy" size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />
          Ambassador leaderboard
        </h2>
        <span className="count">{monthName}</span>
      </div>
      <p className="subtle amb-note" style={{ marginTop: 0, marginBottom: 12 }}>
        Score = verified members gained this month x {b?.memberPoints ?? "10"} + approved mission and
        post points this month. Resets on the 1st.
      </p>
      {err && <p className="subtle">{err}</p>}
      {!b && !err ? (
        <div className="center" style={{ minHeight: 80 }}>
          <div className="spin" />
        </div>
      ) : b && b.rows.length === 0 ? (
        <p className="subtle">No ambassador has scored yet this month.</p>
      ) : b ? (
        <>
          <div className="amb-podium">
            {b.rows.slice(0, 3).map((r) => (
              <div key={r.rank} className={`card amb-podium-item r${r.rank}`}>
                <span className={`rankbadge r${r.rank}`}>{r.rank}</span>
                <b>{r.name}</b>
                <span className="subtle">@{r.xHandle} · {TIER_LABEL[r.tier]}</span>
                <span className="amb-score">{n(r.score)}</span>
                <span className="subtle" style={{ fontSize: 12 }}>
                  {n(r.members)} members · {n(r.missionPts)} pts
                </span>
              </div>
            ))}
          </div>
          {b.rows.length > 3 && (
            <div className="table-wrap mt">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Ambassador</th>
                    <th style={{ textAlign: "right" }}>Members</th>
                    <th style={{ textAlign: "right" }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.slice(3).map((r) => (
                    <tr key={r.rank}>
                      <td><span className="rankbadge">{r.rank}</span></td>
                      <td>
                        {r.name} <span className="subtle">@{r.xHandle}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>{n(r.members)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{n(r.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

const PLATFORM_LABEL = {
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  groups: "Telegram / WhatsApp groups",
};

function ApplyForm({ prev, contacts, enabled, onDone }) {
  const prevPlatforms = prev?.platforms || {};
  const [f, setF] = useState({
    xHandle: prev?.xHandle || "",
    region: prev?.region || "",
    language: prev?.language || "",
    audience: prev?.audience || "",
    community: prev?.community || "",
    plan: prev?.plan || "",
    email: contacts?.email || "",
    whatsapp: contacts?.whatsapp || "",
    telegram: contacts?.telegram || "",
    weeklyHours: prev?.weeklyHours || "",
  });
  const [platforms, setPlatforms] = useState(() => {
    const o = {};
    for (const k of Object.keys(PLATFORM_LABEL)) {
      o[k] = { on: k in prevPlatforms || (k === "x" && !prev), followers: prevPlatforms[k] ?? "" };
    }
    return o;
  });
  const [samples, setSamples] = useState(() => {
    const s = [...(prev?.samples || [])];
    while (s.length < 3) s.push("");
    return s.slice(0, 3);
  });
  const [checks, setChecks] = useState({ age18: false, consent: false, cocAgreed: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sponsorCode = safeGet(SPONSOR_KEY);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const plat = {};
    for (const [k, v] of Object.entries(platforms)) if (v.on) plat[k] = Number(v.followers) || 0;
    try {
      const res = await api.ambassador({
        action: "apply",
        ...f,
        weeklyHours: Number(f.weeklyHours) || 0,
        platforms: plat,
        samples: samples.map((s) => s.trim()).filter(Boolean),
        sponsorCode,
        ...checks,
      });
      onDone(res.data);
    } catch (e2) {
      setMsg(errMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="panel">
        <p className="subtle" style={{ margin: 0 }}>Applications are paused right now. Check back soon.</p>
      </div>
    );
  }
  return (
    <form className="panel amb-form" onSubmit={submit}>
      <h3 className="card-title">
        <Icon name="star" /> Apply to be an ambassador
      </h3>
      {prev?.status === "rejected" && (
        <p className="msg err">
          Your last application was not approved{prev.note ? `: ${prev.note}` : "."} You can update it
          and apply again.
        </p>
      )}
      {sponsorCode && (
        <p className="subtle" style={{ marginTop: 0 }}>
          You were invited by an ambassador (code <b>{sponsorCode}</b>).
        </p>
      )}

      <h4 className="amb-h4">About you</h4>
      <div className="amb-two">
        <div className="field">
          <label>X handle</label>
          <input value={f.xHandle} onChange={set("xHandle")} placeholder="@yourhandle" required />
        </div>
        <div className="field">
          <label>Hours per week you can give</label>
          <input type="number" min={1} max={80} value={f.weeklyHours} onChange={set("weeklyHours")} placeholder="e.g. 5" required />
        </div>
      </div>
      <div className="amb-two">
        <div className="field">
          <label>Country</label>
          <input value={f.region} onChange={set("region")} placeholder="e.g. Pakistan" list="amb-countries" required />
          <datalist id="amb-countries">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Language(s) you post in</label>
          <input value={f.language} onChange={set("language")} placeholder="e.g. Urdu, English" required />
        </div>
      </div>

      <h4 className="amb-h4">Contact details (private)</h4>
      <p className="subtle amb-note" style={{ marginTop: 0, marginBottom: 10 }}>
        Only the Pexli team sees these. They are never shown publicly or to other ambassadors. See the{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <div className="field">
        <label>Email</label>
        <input type="email" value={f.email} onChange={set("email")} placeholder="you@example.com" required />
      </div>
      <div className="amb-two">
        <div className="field">
          <label>WhatsApp number</label>
          <input
            type="tel"
            value={f.whatsapp}
            onChange={set("whatsapp")}
            placeholder="+923001234567"
            pattern="\+[1-9][0-9 \-]{7,18}"
            title="International format with country code, e.g. +923001234567"
            required
          />
        </div>
        <div className="field">
          <label>Telegram username</label>
          <input value={f.telegram} onChange={set("telegram")} placeholder="@yourname" required />
        </div>
      </div>

      <h4 className="amb-h4">Platforms you use</h4>
      <div className="amb-platforms">
        {Object.entries(PLATFORM_LABEL).map(([k, label]) => (
          <div className="amb-platform" key={k}>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={platforms[k].on}
                onChange={(e) => setPlatforms({ ...platforms, [k]: { ...platforms[k], on: e.target.checked } })}
              />
              {label}
            </label>
            {platforms[k].on && (
              <input
                type="number"
                min={0}
                placeholder={k === "groups" ? "Members" : "Followers"}
                value={platforms[k].followers}
                onChange={(e) => setPlatforms({ ...platforms, [k]: { ...platforms[k], followers: e.target.value } })}
              />
            )}
          </div>
        ))}
      </div>
      <div className="field">
        <label>Your audience (optional)</label>
        <input value={f.audience} onChange={set("audience")} placeholder="Niche, who follows you" />
      </div>
      <div className="field">
        <label>Community you run or will start (optional)</label>
        <input value={f.community} onChange={set("community")} placeholder="Telegram / WhatsApp link" />
      </div>

      <h4 className="amb-h4">Your work</h4>
      <div className="field">
        <label>1-3 links to content you made</label>
        {samples.map((s, i) => (
          <input
            key={i}
            style={{ marginTop: i ? 8 : 0 }}
            value={s}
            onChange={(e) => setSamples(samples.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder="https://…"
            required={i === 0}
          />
        ))}
      </div>
      <div className="field">
        <label>Your plan for the first 30 days</label>
        <textarea
          rows={5}
          value={f.plan}
          onChange={set("plan")}
          placeholder="What will you post, who will you reach, how will you help new members get started?"
          required
        />
      </div>

      <div className="amb-checks">
        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={checks.age18} onChange={(e) => setChecks({ ...checks, age18: e.target.checked })} required />
          <span>I am 18 or older.</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={checks.cocAgreed} onChange={(e) => setChecks({ ...checks, cocAgreed: e.target.checked })} required />
          <span>
            I agree to the <a href="#code-of-conduct">Code of Conduct</a>.
          </span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={checks.consent} onChange={(e) => setChecks({ ...checks, consent: e.target.checked })} required />
          <span>Pexli may contact me on email, WhatsApp and Telegram about the ambassador program.</span>
        </label>
      </div>

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit application"}
      </button>
      {msg && <p className="msg err">{msg}</p>}
    </form>
  );
}

// --- Approved ambassador home ------------------------------------------------

function AmbassadorHome({ data, A, profile, onChange }) {
  const app = data.application;
  const tabs = ["Overview", "Missions", "My Team", ...(app.regionalLead ? ["Region"] : [])];
  const [tab, setTab] = useState("Overview");
  return (
    <div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && <Overview data={data} A={A} profile={profile} onChange={onChange} />}
      {tab === "Missions" && <Missions data={data} onChange={onChange} />}
      {tab === "My Team" && <MyTeam />}
      {tab === "Region" && <Region />}
    </div>
  );
}

function Overview({ data, A, profile, onChange }) {
  const app = data.application;
  const [copied, setCopied] = useState("");
  const order = ["rising", "lead", "champion"];
  const next = order.find((t) => app.verifiedMembers < A.tiers[t]);
  const target = next ? A.tiers[next] : A.tiers.champion;
  const pct = Math.min(100, Math.round((app.verifiedMembers / Math.max(1, target)) * 100));
  const code = app.vanityCode || profile?.referralCode || "";
  const link = `${window.location.origin}/?ref=${code}`;
  const inviteAmb = `${window.location.origin}/ambassador?ref=${code}&sponsor=${code}`;
  const cp = (text, key) => copyText(text, (v) => setCopied(v ? key : ""));

  return (
    <div className="grid">
      {data.private?.announcement && (
        <div className="panel amb-announce" style={{ gridColumn: "1 / -1" }}>
          <b>Announcement</b> <span className="subtle">{day(data.private.announcement.at)}</span>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{data.private.announcement.text}</p>
        </div>
      )}
      {app.inactive && (
        <div className="panel" style={{ gridColumn: "1 / -1", borderColor: "var(--amber)" }}>
          <b>Your status is inactive.</b>{" "}
          <span className="subtle">
            You had fewer than {A.activityMin} approved submissions last month. Your next approved post
            or mission makes you active again (until then: base points and the normal referral share).
          </span>
        </div>
      )}
      {app.strikes.length > 0 && (
        <div className="panel" style={{ gridColumn: "1 / -1", borderColor: "var(--red)" }}>
          <b>Strikes: {app.strikes.length} of 3</b>
          <ul className="amb-list">
            {app.strikes.map((s, i) => (
              <li key={i}>
                {s.reason} <span className="subtle">({day(s.at)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <div className="row spread">
          <h3 className="card-title" style={{ margin: 0 }}>
            <Icon name="trophy" /> {TIER_LABEL[app.tier] || "Ambassador"} · @{app.xHandle}
          </h3>
          {app.cashEligible && <span className="badge on">Cash eligible</span>}
        </div>
        <div className="amb-stats">
          <div className="stat">
            <div className="n accent">{n(app.verifiedMembers)}</div>
            <div className="l">Verified members</div>
          </div>
          <div className="stat">
            <div className="n">{n(app.monthMembers)}</div>
            <div className="l">New this month</div>
          </div>
          <div className="stat">
            <div className="n">
              {app.monthApproved}/{A.activityMin}
            </div>
            <div className="l">Approved this month</div>
          </div>
        </div>
        <div className="amb-bar" aria-label="Progress to next tier">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="subtle" style={{ fontSize: 13, margin: "6px 0 0" }}>
          {next
            ? `${n(target - app.verifiedMembers)} more verified members to ${TIER_LABEL[next]}.`
            : "Top tier reached. Thank you!"}{" "}
          Points multiplier: x{data.multiplier}.
          {data.sponsorHandle ? ` Invited by @${data.sponsorHandle}.` : ""}
        </p>
        <label className="subtle amb-label">Your invite link</label>
        <div className="ref-code-box">
          <input className="ref-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-sm" onClick={() => cp(link, "link")}>
            <Icon name={copied === "link" ? "check" : "copy"} size={15} /> {copied === "link" ? "Copied" : "Copy"}
          </button>
        </div>
        <label className="subtle amb-label">Invite an ambassador</label>
        <div className="ref-code-box">
          <input className="ref-link" readOnly value={inviteAmb} onFocus={(e) => e.target.select()} />
          <button className="btn btn-sm" onClick={() => cp(inviteAmb, "amb")}>
            <Icon name={copied === "amb" ? "check" : "copy"} size={15} /> {copied === "amb" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <Checklist data={data} onChange={onChange} />
      <PostForm app={app} A={A} mult={data.multiplier} onChange={onChange} />
      <LinkSettings app={app} onChange={onChange} />
    </div>
  );
}

function Checklist({ data, onChange }) {
  const c = data.checklist || {};
  const group = data.private?.groupLink;
  async function tick(item) {
    try {
      await api.ambassador({ action: "onboardingTick", item });
      onChange();
    } catch (e) {
      /* non-critical */
    }
  }
  const items = [
    {
      k: "guide",
      done: c.guide,
      label: "Read the guide",
      action: (
        <Link className="btn btn-sm btn-ghost" to="/guide" onClick={() => tick("guide")}>
          Open guide
        </Link>
      ),
    },
    {
      k: "group",
      done: c.group,
      label: "Join the private ambassador Telegram group",
      action: group ? (
        <a className="btn btn-sm btn-ghost" href={group} target="_blank" rel="noreferrer" onClick={() => tick("group")}>
          Join
        </a>
      ) : (
        <span className="subtle" style={{ fontSize: 13 }}>Link coming soon</span>
      ),
    },
    { k: "intro", done: c.intro, label: "Post an intro on X with #PexliAmbassador and submit it below" },
    {
      k: "faucet",
      done: c.faucet,
      label: "Claim testnet PEX from the faucet",
      action: <Link className="btn btn-sm btn-ghost" to="/">Dashboard</Link>,
    },
    {
      k: "swap",
      done: c.swap,
      label: "Do a swap on the Lifelox DEX",
      action: <Link className="btn btn-sm btn-ghost" to="/wallet">Wallet</Link>,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  return (
    <div className="panel">
      <h3 className="card-title">
        <Icon name="check" /> Getting started ({doneCount}/{items.length})
      </h3>
      <div className="amb-checklist">
        {items.map((i) => (
          <div key={i.k} className={`amb-check-item ${i.done ? "done" : ""}`}>
            <span className="amb-tick">{i.done ? <Icon name="check" size={14} /> : null}</span>
            <span className="amb-check-label">{i.label}</span>
            {!i.done && i.action}
          </div>
        ))}
      </div>
    </div>
  );
}

function PostForm({ app, A, mult, onChange }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.ambassador({ action: "submitPost", url });
      setMsg({ ok: true, text: res.data.message });
      setUrl("");
      onChange();
    } catch (e2) {
      setMsg({ ok: false, text: errMessage(e2) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h3 className="card-title">
        <Icon name="x" /> Daily X post
      </h3>
      <p className="task-desc">
        Paste a post from @{app.xHandle} about Pexli, with #PexliAmbassador.{" "}
        {Math.round(A.postPoints * mult)} points after review, up to {A.weeklyPostCap} per week (
        {app.postsThisWeek}/{A.weeklyPostCap} used).
      </p>
      <div className="field">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={`https://x.com/${app.xHandle}/status/...`}
          required
        />
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy || app.postsThisWeek >= A.weeklyPostCap}>
        {busy ? "Submitting…" : "Submit post"}
      </button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </form>
  );
}

// Custom invite code + the team group link shown to my members.
function LinkSettings({ app, onChange }) {
  const [code, setCode] = useState(app.vanityCode || "");
  const [group, setGroup] = useState(app.groupUrl || "");
  const [msg, setMsg] = useState(null);
  async function run(action, payload, ok) {
    setMsg(null);
    try {
      await api.ambassador({ action, ...payload });
      setMsg({ ok: true, text: ok });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  return (
    <div className="panel">
      <h3 className="card-title">
        <Icon name="link" /> Your code and group
      </h3>
      <div className="field">
        <label>Custom invite code (3-12 letters or numbers)</label>
        <div className="ref-code-box">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ALI" maxLength={12} />
          <button className="btn btn-sm" onClick={() => run("setVanity", { code }, "Invite code saved.")}>
            Save
          </button>
        </div>
        <p className="subtle" style={{ fontSize: 12, margin: "6px 0 0" }}>
          Your link becomes {window.location.host}/?ref={code || "CODE"}
        </p>
      </div>
      <div className="field">
        <label>Your Telegram or WhatsApp group (shown to your members)</label>
        <div className="ref-code-box">
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="https://t.me/yourgroup" />
          <button className="btn btn-sm" onClick={() => run("setGroup", { url: group }, group ? "Group link saved." : "Group link removed.")}>
            Save
          </button>
        </div>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}

function Missions({ data, onChange }) {
  const missions = data.missions || [];
  if (!missions.length) {
    return <p className="subtle">No open missions right now. New ones are posted here and in the ambassador group.</p>;
  }
  return (
    <div className="grid">
      {missions.map((m) => (
        <MissionCard key={m.id} m={m} mult={data.multiplier} onChange={onChange} />
      ))}
    </div>
  );
}

function MissionCard({ m, mult, onChange }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const full = m.maxPerAmbassador > 0 && m.mine >= m.maxPerAmbassador;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.ambassador({ action: "submitMission", missionId: m.id, url });
      setMsg({ ok: true, text: res.data.message });
      setUrl("");
      onChange();
    } catch (e2) {
      setMsg({ ok: false, text: errMessage(e2) });
    } finally {
      setBusy(false);
    }
  }
  const isX = m.type === "x_post" || m.type === "x_thread";
  return (
    <form className="card" onSubmit={submit}>
      <div className="row spread">
        <span className="badge">{m.typeLabel}</span>
        <span className="task-points">+{Math.round(m.points * mult)}</span>
      </div>
      <h3 className="card-title" style={{ marginTop: 10 }}>{m.title}</h3>
      {m.description && <p className="task-desc" style={{ whiteSpace: "pre-wrap" }}>{m.description}</p>}
      <p className="subtle" style={{ fontSize: 12 }}>
        {m.endAt ? `Ends ${day(m.endAt)}. ` : ""}
        {m.maxPerAmbassador ? `You: ${m.mine}/${m.maxPerAmbassador}.` : `Submitted: ${m.mine}.`}
      </p>
      <div className="field">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={isX ? "https://x.com/you/status/..." : "https://…"}
          required
          disabled={full}
        />
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy || full}>
        {full ? "Limit reached" : busy ? "Submitting…" : "Submit"}
      </button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </form>
  );
}

function MyTeam() {
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api
      .ambassador({ action: "myTeam" })
      .then((r) => setT(r.data))
      .catch((e) => setErr(errMessage(e)));
  }, []);
  if (err) return <p className="msg err">{err}</p>;
  if (!t) return <div className="spin" />;
  return (
    <div>
      <div className="stat-grid" style={{ marginTop: 0 }}>
        <div className="stat">
          <div className="n accent">{n(t.memberCount)}</div>
          <div className="l">Members</div>
        </div>
        <div className="stat">
          <div className="n">{n(t.activatedCount)}</div>
          <div className="l">Activated</div>
        </div>
        <div className="stat">
          <div className="n">{n(t.teamEarned)}</div>
          <div className="l">Earned from your ambassadors</div>
        </div>
      </div>

      <div className="section-head mt">
        <h2 className="section-title">My ambassadors</h2>
        <span className="count">{t.ambassadors.length}</span>
      </div>
      {t.ambassadors.length === 0 ? (
        <p className="subtle">No ambassadors yet. Share your "Invite an ambassador" link from the Overview tab.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ambassador</th>
                <th style={{ textAlign: "right" }}>Verified members</th>
                <th style={{ textAlign: "right" }}>You earned</th>
              </tr>
            </thead>
            <tbody>
              {t.ambassadors.map((a) => (
                <tr key={a.xHandle}>
                  <td>
                    @{a.xHandle} <span className="subtle">{a.status === "approved" ? TIER_LABEL[a.tier] : a.status}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>{n(a.verifiedMembers)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{n(a.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head mt">
        <h2 className="section-title">My members</h2>
        <span className="count">{t.memberCount > t.members.length ? `latest ${t.members.length}` : t.memberCount}</span>
      </div>
      {t.members.length === 0 ? (
        <p className="subtle">Nobody has joined with your link yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Joined</th>
                <th>Activated</th>
                <th style={{ textAlign: "right" }}>Tasks</th>
                <th style={{ textAlign: "right" }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {t.members.map((m, i) => (
                <tr key={i}>
                  <td>{m.name}</td>
                  <td>{day(m.joinedAt)}</td>
                  <td>{m.activated ? <span className="badge on">Yes</span> : <span className="badge">No</span>}</td>
                  <td style={{ textAlign: "right" }}>{n(m.tasksDone)}</td>
                  <td style={{ textAlign: "right" }}>{n(m.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="subtle amb-note">
        For privacy you only see names and progress: never emails, phone numbers or wallets.
      </p>
    </div>
  );
}

function Region() {
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  async function load() {
    try {
      const res = await api.ambassador({ action: "regionView" });
      setR(res.data);
    } catch (e) {
      setErr(errMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function recommend(uid, withdraw) {
    const note = withdraw ? "" : window.prompt("Why do you recommend them? (optional)") || "";
    try {
      await api.ambassador({ action: "recommend", uid, note, withdraw });
      load();
    } catch (e) {
      setErr(errMessage(e));
    }
  }
  if (err) return <p className="msg err">{err}</p>;
  if (!r) return <div className="spin" />;
  return (
    <div>
      <p className="subtle" style={{ marginTop: 0 }}>
        Regional Lead for <b>{r.country}</b>. You can recommend applications; the Pexli team makes the
        final decision.
      </p>
      {r.rows.length === 0 ? (
        <p className="subtle">No other ambassadors or applications from your country yet.</p>
      ) : (
        <div className="grid">
          {r.rows.map((a) => (
            <div className="card" key={a.uid}>
              <div className="row spread">
                <a href={`https://x.com/${a.xHandle}`} target="_blank" rel="noreferrer">
                  <b>@{a.xHandle}</b>
                </a>
                <span className={`badge ${a.status === "pending" ? "pending" : ""}`}>
                  {a.status === "pending" ? "Applicant" : TIER_LABEL[a.tier]}
                </span>
              </div>
              <p className="subtle" style={{ margin: "6px 0" }}>
                {a.displayName || "—"} · {a.language} · {a.weeklyHours} h/week
              </p>
              <p style={{ margin: "4px 0", fontSize: 14 }}>
                {Object.entries(a.platforms)
                  .map(([k, v]) => `${PLATFORM_LABEL[k] || k}: ${n(v)}`)
                  .join(" · ")}
              </p>
              {a.status === "pending" && (
                <>
                  <p style={{ margin: "4px 0", whiteSpace: "pre-wrap", fontSize: 14 }}>{a.plan}</p>
                  {a.samples.map((s) => (
                    <div key={s} className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                      <a href={s} target="_blank" rel="noreferrer">{s}</a>
                    </div>
                  ))}
                  <div className="row mt" style={{ gap: 8 }}>
                    {a.recommendedByMe ? (
                      <button className="btn btn-sm" onClick={() => recommend(a.uid, true)}>
                        Withdraw recommendation
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => recommend(a.uid, false)}>
                        Recommend
                      </button>
                    )}
                    <span className="subtle" style={{ fontSize: 12 }}>{a.recommendations} recommendation(s)</span>
                  </div>
                </>
              )}
              {a.status === "approved" && (
                <p className="subtle" style={{ fontSize: 12, margin: 0 }}>{n(a.verifiedMembers)} verified members</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const COUNTRIES = [
  "Pakistan", "India", "Bangladesh", "Nigeria", "Indonesia", "Philippines", "Vietnam", "Turkey", "Egypt",
  "Kenya", "Ghana", "Brazil", "Mexico", "Argentina", "Colombia", "United States", "United Kingdom", "Canada",
  "Germany", "France", "Spain", "Italy", "Russia", "Ukraine", "Poland", "Netherlands", "United Arab Emirates",
  "Saudi Arabia", "Iran", "Iraq", "Morocco", "South Africa", "Ethiopia", "Tanzania", "Uganda", "Malaysia",
  "Thailand", "China", "Japan", "South Korea", "Australia", "Nepal", "Sri Lanka", "Afghanistan",
];
