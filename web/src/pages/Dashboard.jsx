import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { connectWallet, addPexliNetwork } from "../lib/wallet";
import { LINKS, TX_TARGET_ADDRESS } from "../lib/chain";
import TaskCard from "../components/TaskCard";
import Leaderboard from "../components/Leaderboard";
import Icon from "../components/Icon";

export default function Dashboard() {
  const { profile, config, refreshProfile } = useAuth();

  // Surface the ?x=… result the X OAuth callback bounces back with.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("x");
    if (!p) return;
    refreshProfile();
    window.history.replaceState({}, "", "/");
  }, [refreshProfile]);

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
  const hasWallet = !!profile?.walletAddress;
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

      <div className="connect">
        <WalletSection profile={profile} onSaved={done} />
        <SocialSection profile={profile} onSaved={done} />
      </div>

      {R.enabled && <ReferralCard profile={profile} percent={R.percent} />}

      <Leaderboard />

      <SectionHead title="On-chain quests" />
      <div className="grid">
        <TaskCard
          title="Claim the faucet"
          desc="Claim test PEX from the faucet to your connected wallet."
          points={P.faucet}
          icon="faucet"
          cat="chain"
          enabled={T.faucet}
          buttonLabel="I claimed — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifyFaucet()).data}
          onDone={done}
        >
          <LinkOut href={LINKS.faucet}>Open faucet</LinkOut>
        </TaskCard>

        <TaskCard
          title="Swap on Lifelox"
          desc="Make any token swap on the Lifelox DEX. Repeats every 12h."
          points={P.swap}
          icon="swap"
          cat="chain"
          enabled={T.swap}
          buttonLabel="I swapped — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifySwap()).data}
          onDone={done}
        >
          <LinkOut href={LINKS.dex}>Open Lifelox</LinkOut>
        </TaskCard>

        <TaskCard
          title="Send PEX"
          desc="Send any amount of PEX from your wallet to the Pexli address below. Repeats hourly."
          points={P.tx}
          icon="send"
          cat="chain"
          enabled={T.tx}
          buttonLabel="I sent — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifyTx()).data}
          onDone={done}
        >
          <CopyRow value={TX_TARGET_ADDRESS} />
        </TaskCard>
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

// --- Wallet ---
function WalletSection({ profile, onSaved }) {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = profile?.walletAddress;

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      setAddr(await connectWallet());
    } catch (e) {
      setMsg({ ok: false, text: e?.message });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.setWallet({ walletAddress: addr.trim() });
      setMsg({ ok: true, text: `Saved ${res.data.walletAddress}` });
      setAddr("");
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title">
          <Icon name="wallet" /> Wallet {saved && <span className="badge on">saved</span>}
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={() => addPexliNetwork().catch(() => {})}>
          + Network
        </button>
      </div>
      {saved ? (
        <p className="kv">
          Reward address: <span className="mono">{saved}</span>
        </p>
      ) : (
        <p className="task-desc">Connect MetaMask/TrustWallet (auto-adds Pexli) or paste an address.</p>
      )}
      <div className="stack">
        <button className="btn btn-sm" onClick={connect} disabled={busy}>
          <Icon name="wallet" size={16} /> Connect wallet
        </button>
        <div className="row">
          <input
            className="task-input"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="0x… reward address"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !addr.trim()}>
            {saved ? "Update" : "Save"}
          </button>
        </div>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}

// --- Social handles (X + Instagram), no OAuth / no paid API ---
function SocialSection({ profile, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const connected = !!profile?.xUserId;

  async function connectX() {
    setBusy(true);
    setErr("");
    try {
      const res = await api.xAuthStart();
      window.location.href = res.data.url;
    } catch (e) {
      setErr(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title">
          <Icon name="users" /> Your socials
        </h3>
        <button className="btn btn-sm" onClick={connectX} disabled={busy || connected} title="Verify a real X account">
          <Icon name="x" size={15} /> {connected ? "X verified" : "Connect X"}
        </button>
      </div>
      <p className="task-desc">
        Save your handles to unlock the follow &amp; tweet quests. Optionally connect X to verify
        you&apos;re a real account.
      </p>
      {err && <p className="msg err">{err}</p>}
      <HandleRow
        icon="x"
        label="X (Twitter)"
        placeholder="your X handle"
        saved={profile?.xHandle}
        platform="x"
        onSaved={onSaved}
      />
      <HandleRow
        icon="instagram"
        label="Instagram"
        placeholder="your Instagram handle"
        saved={profile?.igHandle}
        platform="instagram"
        onSaved={onSaved}
      />
    </div>
  );
}

function HandleRow({ icon, label, placeholder, saved, platform, onSaved }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.setSocialHandle({ platform, handle: val.trim() });
      setMsg({ ok: true, text: `Saved @${res.data.handle}` });
      setVal("");
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="handle-row">
      <div className="row spread">
        <span className="kv" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name={icon} size={16} /> {label}
          {saved && <span className="mono">@{saved}</span>}
        </span>
      </div>
      <div className="row">
        <span className="at">@</span>
        <input
          className="task-input"
          style={{ flex: 1, minWidth: 120 }}
          placeholder={placeholder}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !val.trim()}>
          {saved ? "Update" : "Save"}
        </button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
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
