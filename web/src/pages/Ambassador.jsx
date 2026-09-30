import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";
import { LINKS } from "../lib/chain";
import Icon from "../components/Icon";

// Ambassador program: public explainer + (signed in) apply form, status,
// community progress and weekly post submission. All state lives server-side
// in the `ambassador` callable; this page only renders it.
function ambCfg(config) {
  const d = DEFAULT_CONFIG.ambassador;
  const a = config?.ambassador || {};
  return {
    ...d,
    ...a,
    tiers: { ...d.tiers, ...(a.tiers || {}) },
    tierBonus: { ...d.tierBonus, ...(a.tierBonus || {}) },
  };
}

const TIER_LABEL = { ambassador: "Ambassador", rising: "Rising", lead: "Lead", champion: "Champion" };
const n = (v) => Number(v || 0).toLocaleString();

export default function Ambassador() {
  const { user, isActive, profile, config } = useAuth();
  const A = ambCfg(config);
  const [app, setApp] = useState(undefined); // undefined = loading, null = none
  const [err, setErr] = useState("");

  async function load() {
    if (!user) return setApp(null);
    setErr("");
    try {
      const res = await api.ambassador({ action: "get" });
      setApp(res.data.application);
    } catch (e) {
      setErr(errMessage(e));
      setApp(null);
    }
  }
  useEffect(() => {
    load();
  }, [user]);

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

      {/* Tiers */}
      <div className="grid amb-tiers">
        <TierCard
          name="Ambassador"
          need="Approved application"
          reward={`${A.postPoints} pts per approved post (up to ${A.weeklyPostCap}/week) + your referral share`}
        />
        <TierCard
          name="Rising"
          need={`${n(A.tiers.rising)} verified members`}
          reward={`+${n(A.tierBonus.rising)} bonus points`}
        />
        <TierCard
          name="Lead"
          need={`${n(A.tiers.lead)} verified members`}
          reward={`+${n(A.tierBonus.lead)} bonus points and eligible for a cash reward`}
          cash
        />
        <TierCard
          name="Champion"
          need={`${n(A.tiers.champion)} verified members`}
          reward={`+${n(A.tierBonus.champion)} bonus points and eligible for a cash reward`}
          cash
        />
      </div>
      <p className="subtle amb-note">
        A <b>verified member</b> is someone who joins Pexli Drop with your referral link and saves a
        wallet. Followers, likes and empty sign-ups don't count.
      </p>

      {/* Status / apply */}
      <div className="mt">
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
        ) : app === undefined ? (
          <div className="center" style={{ minHeight: 120 }}>
            <div className="spin" />
          </div>
        ) : app && app.status === "approved" ? (
          <AmbassadorHome app={app} A={A} profile={profile} onChange={load} />
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
        ) : (
          <ApplyForm prev={app} enabled={A.enabled} onDone={setApp} />
        )}
        {err && <p className="msg err">{err}</p>}
      </div>

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
          title="Weekly: one original thread or short video"
          text="Show something you tried yourself: a quantum-safe account in the Lifelox Wallet, a swap on the Lifelox DEX (a Rust token and a Solidity token in one pool), or claiming testnet PEX."
        />
        <Task
          icon="users"
          title="Ongoing: grow your community"
          text="Share your referral link. Help new people sign in, save a wallet and finish their first tasks. That's what counts as a verified member."
        />
        <Task
          icon="spark"
          title="Optional: run a local group"
          text="Start a Telegram, Discord or WhatsApp group in your language and answer questions. Tell us about it in your application."
        />
      </div>

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
        <div className="panel">
          <h3 className="card-title">
            <Icon name="shield" /> Rules
          </h3>
          <ul className="amb-list">
            <li>
              Say you're a Pexli ambassador: add <b>#PexliAmbassador</b> to your posts.
            </li>
            <li>No bots, fake accounts, follow-trains or engagement farming. One account per person.</li>
            <li>
              No price or profit promises. Pexli is on testnet; test PEX has no value.
            </li>
            <li>Don't spam other projects' replies or DMs.</li>
            <li>Breaking the rules means removal from the program and losing ambassador points.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function TierCard({ name, need, reward, cash }) {
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

function ApplyForm({ prev, enabled, onDone }) {
  const [f, setF] = useState({
    xHandle: prev?.xHandle || "",
    region: prev?.region || "",
    language: prev?.language || "",
    audience: prev?.audience || "",
    community: prev?.community || "",
    plan: prev?.plan || "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.ambassador({ action: "apply", ...f });
      onDone(res.data.application);
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
      <div className="field">
        <label>X handle</label>
        <input value={f.xHandle} onChange={set("xHandle")} placeholder="@yourhandle" required />
      </div>
      <div className="amb-two">
        <div className="field">
          <label>Country / region</label>
          <input value={f.region} onChange={set("region")} placeholder="e.g. Pakistan" required />
        </div>
        <div className="field">
          <label>Language(s) you post in</label>
          <input value={f.language} onChange={set("language")} placeholder="e.g. Urdu, English" required />
        </div>
      </div>
      <div className="field">
        <label>Your audience (optional)</label>
        <input value={f.audience} onChange={set("audience")} placeholder="Followers, niche, groups you run" />
      </div>
      <div className="field">
        <label>Community you run or will start (optional)</label>
        <input value={f.community} onChange={set("community")} placeholder="Telegram / Discord / WhatsApp link" />
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
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit application"}
      </button>
      {msg && <p className="msg err">{msg}</p>}
    </form>
  );
}

function AmbassadorHome({ app, A, profile, onChange }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const order = ["rising", "lead", "champion"];
  const next = order.find((t) => app.verifiedMembers < A.tiers[t]);
  const target = next ? A.tiers[next] : A.tiers.champion;
  const pct = Math.min(100, Math.round((app.verifiedMembers / Math.max(1, target)) * 100));
  const link = `${window.location.origin}/?ref=${profile?.referralCode || ""}`;

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
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      /* blocked */
    }
  }

  return (
    <div className="grid">
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
            <div className="n">{n(app.invited)}</div>
            <div className="l">Invited</div>
          </div>
          <div className="stat">
            <div className="n">
              {app.postsThisWeek}/{A.weeklyPostCap}
            </div>
            <div className="l">Posts this week</div>
          </div>
        </div>
        <div className="amb-bar" aria-label="Progress to next tier">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="subtle" style={{ fontSize: 13, margin: "6px 0 0" }}>
          {next
            ? `${n(target - app.verifiedMembers)} more verified members to ${TIER_LABEL[next]}.`
            : "Top tier reached. Thank you!"}
        </p>
        <div className="ref-code-box mt">
          <input className="ref-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-sm" onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <form className="panel" onSubmit={submit}>
        <h3 className="card-title">
          <Icon name="x" /> Submit an X post
        </h3>
        <p className="task-desc">
          Paste a post from @{app.xHandle} about Pexli, with #PexliAmbassador. {A.postPoints} points
          after review, up to {A.weeklyPostCap} per week.
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
    </div>
  );
}
