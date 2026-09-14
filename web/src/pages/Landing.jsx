import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LINKS } from "../lib/chain";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";
import Icon from "../components/Icon";

// Public marketing home for signed-out visitors. Sign-in lives right here so a
// visitor can go from landing to earning without leaving the page.
export default function Landing() {
  const { signInGoogle, signInX } = useAuth();
  const [err, setErr] = useState("");
  const referred = safeGet("pexli_ref");
  const P = DEFAULT_CONFIG.points;

  const run = (fn) => async () => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      if (e?.code === "auth/popup-closed-by-user") return;
      if (e?.code === "auth/operation-not-allowed") {
        setErr("X sign-in isn't enabled yet — use Google, or enable Twitter in Firebase Auth.");
      } else {
        setErr(e?.message || "Sign-in failed.");
      }
    }
  };

  return (
    <div className="landing">
      {/* ---------- Hero ---------- */}
      <section className="lhero">
        <div className="hero-badge">
          <span className="dot" /> Pexli airdrop is live
        </div>
        <h1>
          Earn <span className="accent">PEX</span> by doing real things
        </h1>
        <p className="lhero-sub">
          The official Pexli airdrop. Spin up an in-app wallet, complete on-chain &amp; social
          quests, climb the leaderboard, and turn your points into a mainnet PEX reward — no
          extensions, no experience needed.
        </p>

        <div className="lhero-cta">
          <button className="btn btn-primary btn-lg" onClick={run(signInGoogle)}>
            Continue with Google
          </button>
          <button className="btn btn-lg" onClick={run(signInX)}>
            <Icon name="x" size={16} /> Continue with X
          </button>
        </div>
        {referred && (
          <p className="msg ok" style={{ marginTop: 12 }}>
            Invited with code <b>{referred}</b> — sign in to link it.
          </p>
        )}
        {err && <p className="msg err" style={{ marginTop: 12 }}>{err}</p>}
        <p className="subtle" style={{ marginTop: 14 }}>
          Free to join · One wallet &amp; one X account per person ·{" "}
          <Link to="/guide">See how it works</Link>
        </p>

        <div className="lstats">
          <div className="lstat">
            <div className="n accent">11</div>
            <div className="l">Ways to earn</div>
          </div>
          <div className="lstat">
            <div className="n">In-app</div>
            <div className="l">Non-custodial wallet</div>
          </div>
          <div className="lstat">
            <div className="n">1-tap</div>
            <div className="l">Faucet · Swap · Send</div>
          </div>
        </div>
      </section>

      {/* ---------- What is Pexli ---------- */}
      <section className="lsection">
        <div className="section-head lsection-head">
          <h2 className="section-title">What is Pexli?</h2>
        </div>
        <p className="lsection-lead">
          Pexli is an EVM-compatible network with its own token, <b>PEX</b>. It ships with a full
          ecosystem — a faucet, a block explorer, and the Lifelox DEX — so you can get testnet PEX,
          swap tokens, and explore transactions. This airdrop rewards the people who actually use it.
        </p>
        <div className="lfeatures">
          <EcoCard icon="faucet" title="Faucet" href={LINKS.faucet}
            desc="Get PEX in one tap to start transacting." />
          <EcoCard icon="swap" title="Lifelox DEX" href={LINKS.dex}
            desc="Swap tokens on Pexli's decentralized exchange." />
          <EcoCard icon="external" title="Explorer" href={LINKS.main}
            desc="Look up any address or transaction on-chain." />
          <EcoCard icon="wallet" title="In-app wallet" href="/guide" internal
            desc="Create or import a wallet right inside the site." />
        </div>
        <div className="lsection-more">
          <a className="btn btn-sm btn-ghost" href={LINKS.main} target="_blank" rel="noreferrer">
            Visit pex.li <Icon name="external" size={15} />
          </a>
          <a className="btn btn-sm btn-ghost" href={LINKS.chainlist} target="_blank" rel="noreferrer">
            Add Pexli network <Icon name="external" size={15} />
          </a>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="lsection">
        <div className="section-head lsection-head">
          <h2 className="section-title">How it works</h2>
        </div>
        <div className="lsteps">
          <Step n="1" icon="users" title="Sign in">
            Continue with Google or X. Your account is created instantly — one per person.
          </Step>
          <Step n="2" icon="wallet" title="Set up your wallet">
            Create a fresh in-app wallet or import one with a seed phrase. Keys are encrypted on your
            device — <b>never</b> on our servers.
          </Step>
          <Step n="3" icon="bolt" title="Complete quests">
            Claim the faucet, swap, send PEX, follow &amp; post on socials, and create content. Each
            quest awards points.
          </Step>
          <Step n="4" icon="trophy" title="Earn your reward">
            Points stack up and rank you on the leaderboard. When the airdrop lands, points convert
            to PEX.
          </Step>
        </div>
      </section>

      {/* ---------- Ways to earn ---------- */}
      <section className="lsection">
        <div className="section-head lsection-head">
          <h2 className="section-title">Ways to earn points</h2>
        </div>
        <div className="lfeatures">
          <EarnCard icon="faucet" cat="chain" title="Claim the faucet" pts={P.faucet}
            desc="Get PEX sent to your wallet in one click." />
          <EarnCard icon="swap" cat="chain" title="Swap tokens" pts={P.swap}
            desc="Do a real swap on the Lifelox DEX in-app." />
          <EarnCard icon="send" cat="chain" title="Send PEX" pts={P.tx}
            desc="Send a Pexli transaction, verified on-chain." />
          <EarnCard icon="x" cat="x" title="Follow &amp; tweet" pts={P.follow_x}
            desc="Follow @PexliLabs and post from the tweet pool." />
          <EarnCard icon="medium" cat="content" title="Write an article" pts={P.medium}
            desc="Publish about Pexli on Medium — highest reward." />
          <EarnCard icon="youtube" cat="content" title="Make a video" pts={P.youtube}
            desc="YouTube, TikTok or Instagram about Pexli." />
          <EarnCard icon="gift" cat="social" title="Invite friends" pts={`${DEFAULT_CONFIG.referral.percent}%`}
            suffix desc="Earn a % of every point your referrals make — forever." />
          <EarnCard icon="star" cat="content" title="Write a review" pts={P.review}
            desc="Post a public written review and paste the link." />
        </div>
        <p className="subtle" style={{ marginTop: 14 }}>
          Point values are set by the team and can change. See the full list in the{" "}
          <Link to="/guide">guide</Link>.
        </p>
      </section>

      {/* ---------- Points → PEX (kept small & tucked away, as requested) ---------- */}
      <section className="lsection">
        <div className="conv-note">
          <div className="conv-note-ic"><Icon name="spark" size={16} /></div>
          <p>
            <b>Points → PEX.</b> The airdrop is shared <b>pro-rata</b>: whatever percentage of PEX is
            allocated to the airdrop is split across everyone by the share of total points they hold.
            More points = a bigger slice. <Link to="/faq">Details in FAQ →</Link>
          </p>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="lsection">
        <div className="lcta">
          <h2>Ready to earn PEX?</h2>
          <p>Join in seconds — it's free. New questers are climbing the board right now.</p>
          <div className="lhero-cta" style={{ marginTop: 18 }}>
            <button className="btn btn-primary btn-lg" onClick={run(signInGoogle)}>
              Continue with Google
            </button>
            <button className="btn btn-lg" onClick={run(signInX)}>
              <Icon name="x" size={16} /> Continue with X
            </button>
          </div>
          <p className="subtle" style={{ fontSize: 12, marginTop: 14 }}>
            By continuing you agree to our <Link to="/terms">Terms</Link> &amp;{" "}
            <Link to="/privacy">Privacy Policy</Link>. New here?{" "}
            <Link to="/guide">Read the guide</Link> or <Link to="/faq">FAQ</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}

function EcoCard({ icon, title, desc, href, internal }) {
  const inner = (
    <>
      <div className="task-icon"><Icon name={icon} /></div>
      <div>
        <h3 className="lfeat-title">{title}</h3>
        <p className="task-desc">{desc}</p>
      </div>
    </>
  );
  if (internal) return <Link className="lfeat" to={href}>{inner}</Link>;
  return (
    <a className="lfeat" href={href} target="_blank" rel="noreferrer">{inner}</a>
  );
}

function EarnCard({ icon, title, desc, pts, cat, suffix }) {
  return (
    <div className="lfeat" data-cat={cat}>
      <div className="task-icon"><Icon name={icon} /></div>
      <div style={{ flex: 1 }}>
        <div className="lfeat-row">
          <h3 className="lfeat-title" dangerouslySetInnerHTML={{ __html: title }} />
          <span className="task-points">{suffix ? pts : `+${pts}`}</span>
        </div>
        <p className="task-desc" dangerouslySetInnerHTML={{ __html: desc }} />
      </div>
    </div>
  );
}

function Step({ n, icon, title, children }) {
  return (
    <div className="lstep">
      <div className="lstep-n">{n}</div>
      <div className="task-icon"><Icon name={icon} /></div>
      <h3 className="lfeat-title">{title}</h3>
      <p className="task-desc">{children}</p>
    </div>
  );
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
