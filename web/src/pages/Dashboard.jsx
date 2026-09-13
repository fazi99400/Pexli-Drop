import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { LINKS } from "../lib/chain";
import TaskCard from "../components/TaskCard";
import Leaderboard from "../components/Leaderboard";
import Icon from "../components/Icon";

export default function Dashboard() {
  const { profile, config, refreshProfile } = useAuth();

  if (!config) {
    return (
      <div className="center">
        <div className="spin" />
      </div>
    );
  }

  const T = config.tasks || {};
  const P = config.points || {};
  const R = config.referral || { enabled: false, percent: 0 };
  const hasX = !!profile?.xHandle;
  const hasIG = !!profile?.igHandle;
  const done = () => refreshProfile();

  return (
    <>
      <section className="hero">
        <img className="hero-logo" src="/LogoWhite.svg" alt="Pexli" />
        <div className="hero-badge">
          <span className="dot" /> Pexli airdrop is live
        </div>
        <h1>
          Earn <span className="accent">PEX</span> by doing real things
        </h1>
        <p>
          Connect your wallet and socials, complete on-chain &amp; content quests, and climb the
          leaderboard. Points convert to a mainnet PEX reward.
        </p>
        <div className="stat-grid">
          <div className="stat">
            <div className="n accent">{(profile?.points ?? 0).toLocaleString()}</div>
            <div className="l">Your points</div>
          </div>
          <div className="stat">
            <div className="n">{profile?.referralCount ?? 0}</div>
            <div className="l">Referrals</div>
          </div>
          <div className="stat">
            <div className="n">{(profile?.referralPointsEarned ?? 0).toLocaleString()}</div>
            <div className="l">From referrals</div>
          </div>
        </div>
      </section>

      {R.enabled && <ReferralCard profile={profile} percent={R.percent} />}

      <Leaderboard />

      <SectionHead title="Your Pexli wallet" />
      <div className="panel wallet-hub">
        <div className="row spread">
          <h3 className="card-title"><Icon name="wallet" /> Faucet, swap &amp; send — all in-app</h3>
          <span className="badge">+{P.faucet} pts</span>
        </div>
        <p className="task-desc">
          Claim <b>{(config.faucet?.amountPex) || "0.05"} PEX</b> from the faucet in one click, swap tokens,
          and send PEX — right inside your own non-custodial wallet. No external site, no browser extension.
        </p>
        <Link className="btn btn-primary" to="/wallet">
          <Icon name="wallet" size={16} /> Open my wallet
        </Link>
      </div>

      <SectionHead title="Follow us" />
      <div className="grid">
        {T.follow_x && (
          <TaskCard
            title="Follow @PexliLabs on X"
            desc="Follow @PexliLabs, then post a tweet tagging @PexliLabs and paste the link. Auto-verified, free."
            points={P.follow_x}
            icon="x"
            cat="social"
            buttonLabel="Verify tweet"
            disabled={!hasX}
            disabledNote="Save your X handle above first"
            input={{ placeholder: "Paste your tweet link (must tag @PexliLabs)" }}
            onSubmit={async (url) => (await api.submitFollow({ platform: "x", tweetUrl: url })).data}
            onDone={done}
          >
            <div className="task-actions" style={{ marginTop: 0 }}>
              <LinkOut href={LINKS.x}>Open @PexliLabs</LinkOut>
              <a
                className="btn btn-sm btn-ghost"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  "Just joined the @PexliLabs airdrop! #Pexli #PEX",
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Post tweet <Icon name="external" size={15} />
              </a>
            </div>
          </TaskCard>
        )}
        {T.follow_ig && (
          <TaskCard
            title="Follow on Instagram"
            desc="Follow @PexliLab on Instagram, then verify — points are instant."
            points={P.follow_ig}
            icon="instagram"
            cat="social"
            buttonLabel="I followed — verify"
            disabled={!hasIG}
            disabledNote="Save your Instagram handle above first"
            action={async () => (await api.submitFollow({ platform: "instagram" })).data}
            onDone={done}
          >
            <LinkOut href={LINKS.instagram}>Open Instagram</LinkOut>
          </TaskCard>
        )}
      </div>

      {T.tweet && <TweetQuest points={P.tweet} hasX={hasX} onDone={done} />}

      <SectionHead title="Create content" />
      <div className="grid">
        {T.medium && (
          <TaskCard
            title="Write a Medium article"
            desc="Publish an article about Pexli, paste the link. Reviewed before finalizing."
            points={P.medium}
            icon="medium"
            cat="content"
            buttonLabel="Submit link"
            input={{ placeholder: "https://medium.com/@you/..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "medium", url })).data}
            onDone={done}
          />
        )}
        {T.youtube && (
          <TaskCard
            title="Post a YouTube video"
            desc="Make a video about Pexli, paste the link. Reviewed before finalizing."
            points={P.youtube}
            icon="youtube"
            cat="content"
            buttonLabel="Submit link"
            input={{ placeholder: "https://youtube.com/watch?v=..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "youtube", url })).data}
            onDone={done}
          />
        )}
        {T.tiktok && (
          <TaskCard
            title="Post a TikTok"
            desc="Make a TikTok about Pexli and paste the link."
            points={P.tiktok}
            icon="tiktok"
            cat="content"
            buttonLabel="Submit link"
            input={{ placeholder: "https://tiktok.com/@you/video/..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "tiktok", url })).data}
            onDone={done}
          />
        )}
        {T.instagram && (
          <TaskCard
            title="Post on Instagram"
            desc="Share a Pexli post and paste the link."
            points={P.instagram}
            icon="instagram"
            cat="content"
            buttonLabel="Submit link"
            input={{ placeholder: "https://instagram.com/p/..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "instagram", url })).data}
            onDone={done}
          />
        )}
        {T.review && (
          <TaskCard
            title="Write a review"
            desc="Publish a written review of Pexli anywhere public, paste the link."
            points={P.review}
            icon="star"
            cat="content"
            buttonLabel="Submit link"
            input={{ placeholder: "https://..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "review", url })).data}
            onDone={done}
          />
        )}
      </div>
    </>
  );
}

function SectionHead({ title }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
    </div>
  );
}

function LinkOut({ href, children }) {
  return (
    <a className="btn btn-sm btn-ghost" href={href} target="_blank" rel="noreferrer">
      {children} <Icon name="external" size={15} />
    </a>
  );
}

function CopyRow({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      /* blocked */
    }
  }
  return (
    <div className="copy-row">
      <span className="mono">{value}</span>
      <button className="btn btn-sm" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// --- Referral ---
function ReferralCard({ profile, percent }) {
  const [copied, setCopied] = useState("");
  const code = profile?.referralCode || "…";
  const link = `${window.location.origin}/?ref=${code}`;
  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1400);
    } catch (e) {
      /* blocked */
    }
  }
  return (
    <div className="referral mt">
      <div className="referral-inner">
        <div className="ref-top">
          <div>
            <h3 className="card-title">
              <Icon name="gift" /> Invite friends, earn {percent}%
            </h3>
            <p className="task-desc" style={{ maxWidth: 460 }}>
              Share your link. You earn <b className="accent">{percent}%</b> of every point your
              referrals make — automatically, forever.
            </p>
          </div>
          <div className="ref-stats">
            <div className="stat">
              <div className="n accent">{profile?.referralCount ?? 0}</div>
              <div className="l">Invited</div>
            </div>
            <div className="stat">
              <div className="n">{(profile?.referralPointsEarned ?? 0).toLocaleString()}</div>
              <div className="l">Earned</div>
            </div>
          </div>
        </div>
        <div className="ref-code-box mt">
          <input className="ref-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-sm" onClick={() => copy(link, "link")}>
            <Icon name={copied === "link" ? "check" : "copy"} size={15} />
            {copied === "link" ? "Copied" : "Link"}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => copy(code, "code")}>
            {copied === "code" ? "Copied" : code}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Tweet quest (assign + verify via free oEmbed) ---
function TweetQuest({ points, hasX, onDone }) {
  const [tweet, setTweet] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function getTweet() {
    setBusy(true);
    setMsg(null);
    try {
      setTweet((await api.assignTweet()).data.text);
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.verifyTweetPublic({ url: url.trim() });
      setMsg({ ok: true, text: res.data.message || "Verified!" });
      setTweet(null);
      setUrl("");
      onDone?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead title="Post a tweet" />
      <div className="card task-card" data-cat="x">
        <div className="task-head">
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <div className="task-icon">
              <Icon name="x" />
            </div>
            <div>
              <h3 className="task-title">Tweet from the pool</h3>
              <p className="task-desc">
                Get a tweet, post it from your X account, then paste the tweet link. New tweet every
                30 min.
              </p>
            </div>
          </div>
          <span className="task-points">+{points}</span>
        </div>

        {!hasX && <p className="subtle">Save your X handle above first.</p>}

        {tweet && (
          <div className="panel" style={{ background: "var(--bg)" }}>
            <p style={{ margin: 0 }}>{tweet}</p>
            <div className="task-actions mt">
              <a
                className="btn btn-sm btn-ghost"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  /@pexlilabs/i.test(tweet) ? tweet : `${tweet} @PexliLabs`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Post on X <Icon name="external" size={15} />
              </a>
            </div>
            <input
              className="task-input mt"
              placeholder="Paste your tweet link (…/status/…)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        <div className="task-actions">
          {!tweet ? (
            <button className="btn btn-primary btn-sm" onClick={getTweet} disabled={busy || !hasX}>
              {busy ? "…" : "Get my tweet"}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={verify} disabled={busy || !url.trim()}>
              {busy ? "Checking…" : "Verify tweet"}
            </button>
          )}
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </div>
    </>
  );
}
