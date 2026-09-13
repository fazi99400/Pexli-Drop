import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { connectWallet, addPexliNetwork } from "../lib/wallet";
import { LINKS, TX_TARGET_ADDRESS } from "../lib/chain";
import TaskCard from "../components/TaskCard";
import Leaderboard from "../components/Leaderboard";

export default function Dashboard() {
  const { profile, config, refreshProfile } = useAuth();
  const [xNotice, setXNotice] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("x");
    if (!p) return;
    const map = {
      connected: "X account connected!",
      x_taken: "That X account is already linked to another user.",
      denied: "X authorization was cancelled.",
      expired: "The X sign-in expired — please try again.",
      failed: "Connecting X failed. Please try again.",
    };
    setXNotice(map[p] || "");
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
  const hasX = !!profile?.xUserId;
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
          Connect your wallet and socials, complete on-chain &amp; content quests, and stack points.
          Points convert to a mainnet PEX reward at distribution.
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

      {/* --- Connect --- */}
      <div className="connect">
        <WalletSection profile={profile} onSaved={done} />
        <XSection profile={profile} notice={xNotice} />
      </div>

      {/* --- Referral --- */}
      {R.enabled && <ReferralCard profile={profile} percent={R.percent} />}

      {/* --- Leaderboard --- */}
      <Leaderboard />

      {/* --- On-chain --- */}
      <SectionHead title="On-chain quests" />
      <div className="grid">
        <TaskCard
          title="Claim the faucet"
          desc="Claim test PEX from faucet.pex.li to your connected wallet."
          points={P.faucet}
          icon="🚰"
          cat="chain"
          enabled={T.faucet}
          buttonLabel="I claimed — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifyFaucet()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.faucet} target="_blank" rel="noreferrer">
            Open faucet ↗
          </a>
        </TaskCard>

        <TaskCard
          title="Swap on Lifelox"
          desc="Make any token swap on the Lifelox DEX. Repeats every 12h."
          points={P.swap}
          icon="🔁"
          cat="chain"
          enabled={T.swap}
          buttonLabel="I swapped — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifySwap()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.dex} target="_blank" rel="noreferrer">
            Open Lifelox ↗
          </a>
        </TaskCard>

        <TaskCard
          title="Send PEX"
          desc="Send any amount of PEX from your wallet to the Pexli address below, then verify. Repeats every hour."
          points={P.tx}
          icon="⚡"
          cat="chain"
          enabled={T.tx}
          buttonLabel="I sent — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first"
          action={async () => (await api.verifyTx()).data}
          onDone={done}
        >
          <CopyAddress address={TX_TARGET_ADDRESS} />
        </TaskCard>
      </div>

      {/* --- Follows --- */}
      <SectionHead title="Follow us" />
      <div className="grid">
        <TaskCard
          title="Follow @PexliLabs on X"
          desc="Follow the official Pexli account, then verify."
          points={P.follow_x}
          icon="𝕏"
          cat="social"
          enabled={T.follow_x}
          buttonLabel="Verify follow"
          disabled={!hasX}
          disabledNote="Connect X above first"
          action={async () => (await api.verifyFollowX()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">
            Open X ↗
          </a>
        </TaskCard>

        {T.follow_ig && (
          <div className="card task-card" data-cat="social">
            <div className="task-head">
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="task-icon">📸</div>
                <div>
                  <h3 className="task-title">Follow on Instagram</h3>
                  <p className="task-desc">
                    Follow @PexliLab. Instagram has no follow API, so this is reviewed manually.
                  </p>
                </div>
              </div>
              <span className="task-points">+{P.follow_ig}</span>
            </div>
            <div className="task-actions">
              <a className="btn btn-sm btn-ghost" href={LINKS.instagram} target="_blank" rel="noreferrer">
                Open Instagram ↗
              </a>
              <span className="subtle">Awarded after review</span>
            </div>
          </div>
        )}
      </div>

      {/* --- Tweet quest --- */}
      {T.tweet && <TweetQuest points={P.tweet} hasX={hasX} onDone={done} />}

      {/* --- Content --- */}
      <SectionHead title="Create content" />
      <div className="grid">
        {T.medium && (
          <TaskCard
            title="Write a Medium article"
            desc="Publish an article about Pexli, paste the link. Reviewed before finalizing."
            points={P.medium}
            icon="✍️"
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
            icon="▶️"
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
            icon="🎵"
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
            icon="📸"
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
            icon="⭐"
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

// Small copyable address chip (used by the "Send PEX" task).
function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      /* clipboard blocked */
    }
  }
  return (
    <div className="ref-code-box">
      <span className="mono" style={{ flex: 1, minWidth: 140, wordBreak: "break-all" }}>{address}</span>
      <button className="btn btn-sm" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
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
      setTimeout(() => setCopied(""), 1500);
    } catch (e) {
      setCopied("");
    }
  }

  return (
    <div className="referral mt">
      <div className="referral-inner">
        <div className="row spread" style={{ alignItems: "flex-start" }}>
          <div>
            <h3 className="task-title" style={{ fontSize: 18 }}>🎁 Invite friends, earn {percent}%</h3>
            <p className="task-desc" style={{ maxWidth: 460 }}>
              Share your link. You earn <b style={{ color: "var(--accent)" }}>{percent}%</b> of every
              point your referrals make — automatically, forever.
            </p>
          </div>
          <div className="row">
            <div className="stat" style={{ padding: "10px 16px" }}>
              <div className="n accent" style={{ fontSize: 20 }}>{profile?.referralCount ?? 0}</div>
              <div className="l">Invited</div>
            </div>
            <div className="stat" style={{ padding: "10px 16px" }}>
              <div className="n" style={{ fontSize: 20 }}>{(profile?.referralPointsEarned ?? 0).toLocaleString()}</div>
              <div className="l">Earned</div>
            </div>
          </div>
        </div>

        <div className="ref-code-box mt">
          <input className="ref-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-sm" onClick={() => copy(link, "link")}>
            {copied === "link" ? "Copied ✓" : "Copy link"}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => copy(code, "code")}>
            {copied === "code" ? "Copied ✓" : `Copy code ${code}`}
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
        <h3 className="task-title">
          👛 Wallet {saved && <span className="badge on">connected</span>}
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={() => addPexliNetwork().catch(() => {})}>
          + Pexli network
        </button>
      </div>
      {saved ? (
        <p className="kv">
          Reward address: <span className="mono">{saved}</span>
        </p>
      ) : (
        <p className="task-desc">Connect MetaMask/TrustWallet (auto-adds Pexli) or paste an address.</p>
      )}
      <div className="row">
        <button className="btn btn-sm" onClick={connect} disabled={busy}>
          Connect wallet
        </button>
        <input
          className="task-input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="0x… reward address"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !addr.trim()}>
          {saved ? "Update" : "Save"}
        </button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}

// --- X connect ---
function XSection({ profile, notice }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const connected = !!profile?.xUserId;

  async function connect() {
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
        <h3 className="task-title">
          𝕏 Account {connected && <span className="badge on">connected</span>}
        </h3>
        {!connected && (
          <button className="btn btn-sm btn-primary" onClick={connect} disabled={busy}>
            {busy ? "Redirecting…" : "Connect X"}
          </button>
        )}
      </div>
      <p className="kv">
        {connected ? (
          <>
            Connected as <b className="mono">@{profile.xHandle}</b>
          </>
        ) : (
          "Connect X to unlock the follow + tweet quests."
        )}
      </p>
      {notice && <p className="msg ok">{notice}</p>}
      {err && <p className="msg err">{err}</p>}
    </div>
  );
}

// --- Tweet quest ---
function TweetQuest({ points, hasX, onDone }) {
  const [tweet, setTweet] = useState(null);
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
      const res = await api.verifyTweet();
      setMsg({ ok: true, text: res.data.message || "Verified! Points added." });
      setTweet(null);
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
            <div className="task-icon">🐦</div>
            <div>
              <h3 className="task-title">Tweet from the pool</h3>
              <p className="task-desc">
                Get an assigned tweet, post it from your X account, verify. New tweet every 30 min.
              </p>
            </div>
          </div>
          <span className="task-points">+{points}</span>
        </div>

        {!hasX && <p className="subtle">Connect your X account above first.</p>}

        {tweet && (
          <div className="panel" style={{ background: "var(--bg)" }}>
            <p style={{ margin: 0 }}>{tweet}</p>
            <div className="task-actions mt">
              <a
                className="btn btn-sm btn-ghost"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open X to post ↗
              </a>
            </div>
          </div>
        )}

        <div className="task-actions">
          {!tweet ? (
            <button className="btn btn-primary btn-sm" onClick={getTweet} disabled={busy || !hasX}>
              {busy ? "…" : "Get my tweet"}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "I posted — verify"}
            </button>
          )}
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </div>
    </>
  );
}
