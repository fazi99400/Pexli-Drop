import { Link } from "react-router-dom";
import { LINKS } from "../lib/chain";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";
import Icon from "../components/Icon";

// Public how-to. Walks a brand-new user from sign-in all the way to earning and
// climbing the leaderboard. Written for people with zero crypto background.
export default function Guide() {
  const P = DEFAULT_CONFIG.points;
  return (
    <div className="doc legal-narrow">
      <h1><Icon name="bolt" /> How to earn PEX — full guide</h1>
      <p>
        A complete walk-through, from creating your account to earning points and climbing the
        leaderboard. No crypto experience needed — everything happens inside the site. Prefer quick
        answers? See the <Link to="/faq">FAQ</Link>.
      </p>

      <GStep n="1" icon="users" title="Create your account">
        <p>
          On the home page, tap <b>Continue with Google</b> or <b>Continue with X</b>. Your account
          is created instantly. You get <b>one account per person</b>, so pick the login you'll keep.
        </p>
        <p className="subtle">
          Tip: if you have a referral link from a friend, open that link first — their code links
          automatically when you sign in, and you both benefit.
        </p>
      </GStep>

      <GStep n="2" icon="gear" title="Activate & add your socials">
        <p>
          After signing in you'll land on activation. Add your <b>X handle</b> (and Instagram, if you
          have one) so social quests can be verified. You can update these any time in{" "}
          <b>Settings</b>.
        </p>
      </GStep>

      <GStep n="3" icon="wallet" title="Set up your in-app wallet">
        <p>
          Open <b>My wallet</b>. You have two options:
        </p>
        <ul>
          <li><b>Create a new wallet</b> — the site generates a fresh seed phrase for you.</li>
          <li><b>Import</b> — paste an existing seed phrase or private key.</li>
        </ul>
        <p>
          You'll set a <b>password</b> that encrypts the wallet <b>on your device</b>. We never see
          your keys or password.
        </p>
        <div className="g-warn">
          <Icon name="shield" size={16} />
          <span>
            Write your <b>seed phrase</b> on paper and keep it offline. If you lose it (or your
            password), <b>nobody</b> can recover the wallet — not even us. Never share it with anyone.
          </span>
        </div>
      </GStep>

      <GStep n="4" icon="faucet" title={`Claim the faucet  ·  +${P.faucet} pts`}>
        <p>
          In your wallet, tap <b>Claim faucet</b>. The site sends PEX straight to your wallet in one
          click — no forms, no external site. You'll need a little PEX for the swap and send quests,
          so start here. The faucet can be claimed again after a short cooldown.
        </p>
      </GStep>

      <GStep n="5" icon="send" title={`Send PEX  ·  +${P.tx} pts`}>
        <p>
          Tap <b>Send</b>. The amount and destination are already filled in — just confirm. Once the
          transaction is confirmed on-chain, tap <b>Get points</b> and your points are awarded. If it
          says "not visible yet", wait a few seconds and tap again — the PEX is already on its way.
        </p>
      </GStep>

      <GStep n="6" icon="swap" title={`Swap on the Lifelox DEX  ·  +${P.swap} pts`}>
        <p>
          Tap <b>Swap</b>. Pick the token you want to receive — the input amount is fixed, so it's
          one tap. Your in-app wallet signs the swap and it runs on the real{" "}
          <a href={LINKS.dex} target="_blank" rel="noreferrer">Lifelox</a> DEX. Points are awarded
          after the swap confirms.
        </p>
      </GStep>

      <GStep n="7" icon="x" title={`Follow & post on X  ·  +${P.follow_x} / +${P.tweet} pts`}>
        <p>
          Follow <a href={LINKS.x} target="_blank" rel="noreferrer">@PexliLabs</a>, then post a tweet
          tagging @PexliLabs and paste the link — it auto-verifies. You can also grab a ready-made
          tweet from the <b>tweet pool</b> and post it for extra points. A new pool tweet is
          available every 30 minutes.
        </p>
      </GStep>

      <GStep n="8" icon="medium" title={`Create content  ·  up to +${P.medium} pts`}>
        <p>Make something about Pexli and paste the link. Bigger efforts earn more:</p>
        <ul>
          <li><b>Medium article</b> — +{P.medium} pts (reviewed before finalizing)</li>
          <li><b>YouTube video</b> — +{P.youtube} pts</li>
          <li><b>TikTok</b> — +{P.tiktok} pts</li>
          <li><b>Instagram post</b> — +{P.instagram} pts</li>
          <li><b>Written review</b> — +{P.review} pts</li>
        </ul>
      </GStep>

      <GStep n="9" icon="gift" title={`Invite friends  ·  +${DEFAULT_CONFIG.referral.percent}% forever`}>
        <p>
          Share your referral link from the dashboard. You earn{" "}
          <b>{DEFAULT_CONFIG.referral.percent}%</b> of every point your invitees make, automatically
          and forever. It costs them nothing — it's a bonus for you on top.
        </p>
      </GStep>

      <GStep n="10" icon="trophy" title="Climb the leaderboard & earn PEX">
        <p>
          Every point ranks you on the <b>leaderboard</b>. Top ranks can earn bonus points. When the
          airdrop is distributed, your points convert to PEX <b>pro-rata</b> — your share of the pool
          equals your share of everyone's total points. Keep questing to grow your slice.
        </p>
      </GStep>

      <div className="g-tips">
        <h2>Quick tips</h2>
        <ul>
          <li>Do the faucet <b>first</b> — you need PEX for send &amp; swap.</li>
          <li>Back up your seed phrase offline; it's the only way to restore your wallet.</li>
          <li>If a quest is on cooldown, come back later — the timer is shown on the button.</li>
          <li>On mobile, refresh the page if something looks stale after an update.</li>
          <li>Only one account per person — fair play keeps your rewards safe.</li>
        </ul>
      </div>

      <div className="lcta" style={{ marginTop: 32 }}>
        <h2>That's it — go earn.</h2>
        <p>Sign in and start with the faucet.</p>
        <Link className="btn btn-primary btn-lg" to="/" style={{ marginTop: 14 }}>
          Go to the airdrop
        </Link>
      </div>
    </div>
  );
}

function GStep({ n, icon, title, children }) {
  return (
    <section className="g-step">
      <div className="g-step-head">
        <div className="g-step-n">{n}</div>
        <div className="task-icon"><Icon name={icon} /></div>
        <h2>{title}</h2>
      </div>
      <div className="g-step-body">{children}</div>
    </section>
  );
}
