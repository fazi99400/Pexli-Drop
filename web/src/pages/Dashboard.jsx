import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { connectWallet, addPexliNetwork } from "../lib/wallet";
import { LINKS } from "../lib/chain";
import TaskCard from "../components/TaskCard";

export default function Dashboard() {
  const { profile, config, refreshProfile } = useAuth();
  const [xNotice, setXNotice] = useState("");

  // Surface the ?x=… result the X OAuth callback redirects back with.
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
  const hasWallet = !!profile?.walletAddress;
  const hasX = !!profile?.xUserId;
  const done = () => refreshProfile();

  return (
    <>
      <section className="hero">
        <h1>
          Earn <span className="accent">PEX</span> by doing real things
        </h1>
        <p>
          Connect your wallet and socials, complete on-chain and content quests, and rack up
          points. Points convert to a mainnet PEX reward at distribution.
        </p>
      </section>

      <WalletSection profile={profile} onSaved={done} />
      <XSection profile={profile} notice={xNotice} />

      {/* --- On-chain --- */}
      <h2 className="section-title">On-chain quests</h2>
      <div className="grid">
        <TaskCard
          title="Claim the faucet"
          desc="Claim test PEX from faucet.pex.li to your connected wallet."
          points={P.faucet}
          enabled={T.faucet}
          buttonLabel="I claimed — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first."
          action={async () => (await api.verifyFaucet()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.faucet} target="_blank" rel="noreferrer">
            Open faucet ↗
          </a>
        </TaskCard>

        <TaskCard
          title="Swap on Lifelox"
          desc="Make any token swap on the Lifelox DEX from your wallet. Repeats every 12h."
          points={P.swap}
          enabled={T.swap}
          buttonLabel="I swapped — verify"
          disabled={!hasWallet}
          disabledNote="Save your wallet first."
          action={async () => (await api.verifySwap()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.dex} target="_blank" rel="noreferrer">
            Open Lifelox ↗
          </a>
        </TaskCard>

        <TaskCard
          title="Send a transaction"
          desc="Do at least one on-chain transaction. Repeats every hour."
          points={P.tx}
          enabled={T.tx}
          buttonLabel="Verify transaction"
          disabled={!hasWallet}
          disabledNote="Save your wallet first."
          action={async () => (await api.verifyTx()).data}
          onDone={done}
        />
      </div>

      {/* --- Social follows --- */}
      <h2 className="section-title">Follow us</h2>
      <div className="grid">
        <TaskCard
          title="Follow @PexliLabs on X"
          desc="Follow the official Pexli account, then verify."
          points={P.follow_x}
          enabled={T.follow_x}
          buttonLabel="Verify follow"
          disabled={!hasX}
          disabledNote="Connect your X account above first."
          action={async () => (await api.verifyFollowX()).data}
          onDone={done}
        >
          <a className="btn btn-sm btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">
            Open X ↗
          </a>
        </TaskCard>

        {T.follow_ig && (
          <div className="card task-card">
            <div className="task-head">
              <div>
                <h3 className="task-title">Follow @PexliLab on Instagram</h3>
                <p className="task-desc">
                  Follow us on Instagram. Instagram has no public follow API, so this is
                  reviewed manually by an admin.
                </p>
              </div>
              <span className="task-points">+{P.follow_ig}</span>
            </div>
            <div className="task-actions">
              <a className="btn btn-sm btn-ghost" href={LINKS.instagram} target="_blank" rel="noreferrer">
                Open Instagram ↗
              </a>
            </div>
            <p className="subtle">Awarded after manual review.</p>
          </div>
        )}
      </div>

      {/* --- X tweet quest --- */}
      {T.tweet && <TweetQuest points={P.tweet} hasX={hasX} onDone={done} />}

      {/* --- Content links --- */}
      <h2 className="section-title">Create content</h2>
      <div className="grid">
        {T.medium && (
          <TaskCard
            title="Write a Medium article"
            desc="Publish an article about Pexli and paste the link. Reviewed before points finalize."
            points={P.medium}
            enabled={T.medium}
            buttonLabel="Submit link"
            input={{ placeholder: "https://medium.com/@you/..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "medium", url })).data}
            onDone={done}
          />
        )}
        {T.youtube && (
          <TaskCard
            title="Post a YouTube video"
            desc="Make a video about Pexli and paste the link. Reviewed before points finalize."
            points={P.youtube}
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
            buttonLabel="Submit link"
            input={{ placeholder: "https://instagram.com/p/..." }}
            onSubmit={async (url) => (await api.submitLink({ taskType: "instagram", url })).data}
            onDone={done}
          />
        )}
        {T.review && (
          <TaskCard
            title="Write a review"
            desc="Publish a written review of Pexli anywhere public and paste the link."
            points={P.review}
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
      const a = await connectWallet();
      setAddr(a);
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
    <div className="card mt">
      <div className="row spread">
        <div>
          <h3 className="task-title">Your wallet</h3>
          <p className="task-desc">
            {saved ? (
              <>
                Reward address: <span className="mono">{saved}</span>
              </>
            ) : (
              "Connect MetaMask/TrustWallet (auto-adds the Pexli network) or paste your address."
            )}
          </p>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={connect} disabled={busy}>
            Connect wallet
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => addPexliNetwork().catch(() => {})}>
            Add Pexli network
          </button>
        </div>
      </div>
      <div className="row mt">
        <input
          className="task-input"
          style={{ maxWidth: 460 }}
          placeholder="0x… wallet address (receives your PEX reward)"
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
    <div className="card mt">
      <div className="row spread">
        <div>
          <h3 className="task-title">Your X account</h3>
          <p className="task-desc">
            {connected ? (
              <>
                Connected as <b>@{profile.xHandle}</b>
              </>
            ) : (
              "Connect X to unlock the follow + tweet quests."
            )}
          </p>
        </div>
        {!connected && (
          <button className="btn btn-sm btn-primary" onClick={connect} disabled={busy}>
            {busy ? "Redirecting…" : "Connect X"}
          </button>
        )}
      </div>
      {notice && <p className="msg ok">{notice}</p>}
      {err && <p className="msg err">{err}</p>}
    </div>
  );
}

// --- Tweet quest (assign + verify) ---
function TweetQuest({ points, hasX, onDone }) {
  const [tweet, setTweet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function getTweet() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.assignTweet();
      setTweet(res.data.text);
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
      <h2 className="section-title">Post a tweet</h2>
      <div className="card task-card">
        <div className="task-head">
          <div>
            <h3 className="task-title">Tweet from the pool</h3>
            <p className="task-desc">
              Get an assigned tweet, post it from your own X account, then verify. New tweet every
              30 minutes.
            </p>
          </div>
          <span className="task-points">+{points}</span>
        </div>

        {!hasX && <p className="subtle">Connect your X account above first.</p>}

        {tweet && (
          <div className="card" style={{ background: "var(--bg)" }}>
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
