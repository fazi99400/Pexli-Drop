import { Link } from "react-router-dom";
import { LINKS } from "../lib/chain";
import Icon from "../components/Icon";

// Public FAQ. Native <details> accordions — no JS state, works everywhere.
const FAQS = [
  {
    q: "What is the Pexli airdrop?",
    a: (
      <>
        It's a rewards program for the <b>Pexli</b> network. You complete simple on-chain and social
        quests, earn points, and those points convert into a <b>PEX</b> reward when the airdrop is
        distributed. It's free to join.
      </>
    ),
  },
  {
    q: "How do points turn into PEX?",
    a: (
      <>
        The airdrop is shared <b>pro-rata</b>. The team allocates a percentage of PEX to the airdrop
        pool, and that pool is split across every participant in proportion to the points they hold.
        In short: your PEX ≈ (your points ÷ everyone's total points) × the airdrop pool. The more
        points you earn relative to others, the bigger your slice.
      </>
    ),
  },
  {
    q: "Is it free? Do I need crypto experience?",
    a: (
      <>
        Yes, it's completely free, and no experience is needed. You sign in with Google or X, the
        site creates a wallet for you, and the faucet gives you PEX to get started. Everything —
        wallet, faucet, swap, send — happens right inside the site.
      </>
    ),
  },
  {
    q: "Is the in-app wallet safe? Do you hold my keys?",
    a: (
      <>
        No — it's <b>non-custodial</b>. Your private key and seed phrase are generated and encrypted
        <b> on your own device</b> with a password only you know. They are <b>never</b> sent to or
        stored on our servers. If you forget your password or lose your seed phrase, no one — not
        even us — can recover the wallet, so back up your seed phrase somewhere safe.
      </>
    ),
  },
  {
    q: "What quests can I do?",
    a: (
      <>
        On-chain: claim the <b>faucet</b>, <b>swap</b> tokens on the Lifelox DEX, and <b>send PEX</b>.
        Social: follow <a href={LINKS.x} target="_blank" rel="noreferrer">@PexliLabs</a> and post from
        the tweet pool. Content: write a Medium article, post a YouTube / TikTok / Instagram, or
        publish a review. See the step-by-step <Link to="/guide">guide</Link>.
      </>
    ),
  },
  {
    q: "How many accounts can I have?",
    a: (
      <>
        One per person — one wallet and one X account each. Multiple or fake accounts can be removed
        and their points voided. Play fair to keep your rewards.
      </>
    ),
  },
  {
    q: "How do referrals work?",
    a: (
      <>
        Share your referral link from the dashboard. You earn a percentage of every point your
        invitees make — automatically, for as long as they keep questing. It doesn't reduce their
        points; it's a bonus on top.
      </>
    ),
  },
  {
    q: "Why is there a cooldown on the faucet / swap / send?",
    a: (
      <>
        To keep rewards fair and the network healthy, each on-chain quest can be repeated after a
        cooldown (for example the faucet resets roughly once a day). The button tells you how long
        is left when you're on cooldown.
      </>
    ),
  },
  {
    q: "I sent PEX / swapped but didn't get points. What now?",
    a: (
      <>
        On-chain confirmation can take a few seconds. Wait a moment and tap <b>Get points</b> again —
        the site re-checks the transaction on-chain and awards the points once it's confirmed. Your
        PEX is safe either way; only the point award waits for confirmation.
      </>
    ),
  },
  {
    q: "Connecting X isn't working.",
    a: (
      <>
        Make sure pop-ups aren't blocked, then try again. If it still fails, sign in with Google
        first, then connect X from Settings. An X account already linked to another Pexli account
        can't be reused.
      </>
    ),
  },
  {
    q: "When is the airdrop distributed?",
    a: (
      <>
        The team announces timing on the official channels. Keep earning points in the meantime —
        your standing is locked to your points at distribution. Follow{" "}
        <a href={LINKS.x} target="_blank" rel="noreferrer">@PexliLabs</a> for announcements.
      </>
    ),
  },
  {
    q: "How do I add Pexli to my wallet?",
    a: (
      <>
        You don't need to for this site — the in-app wallet is already on Pexli. To add it elsewhere,
        use <a href={LINKS.chainlist} target="_blank" rel="noreferrer">Chainlist</a> (network name
        Pexli, symbol PEX).
      </>
    ),
  },
];

export default function Faq() {
  return (
    <div className="doc legal-narrow">
      <h1><Icon name="spark" /> Frequently asked questions</h1>
      <p>
        Everything about the Pexli airdrop, the in-app wallet, quests, and how points become PEX.
        Still stuck? Read the <Link to="/guide">step-by-step guide</Link>.
      </p>

      <div className="faq-list">
        {FAQS.map((f, i) => (
          <details className="faq-item" key={i}>
            <summary>
              <span>{f.q}</span>
              <span className="faq-chevron" aria-hidden>+</span>
            </summary>
            <div className="faq-a">{f.a}</div>
          </details>
        ))}
      </div>

      <div className="lcta" style={{ marginTop: 32 }}>
        <h2>Ready to start?</h2>
        <p>Head back and sign in — it takes seconds.</p>
        <Link className="btn btn-primary btn-lg" to="/" style={{ marginTop: 14 }}>
          Go to the airdrop
        </Link>
      </div>
    </div>
  );
}
