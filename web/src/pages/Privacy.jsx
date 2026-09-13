import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="legal">
      <h1>Privacy Policy</h1>
      <p className="subtle">Last updated: {new Date().getFullYear()}</p>

      <h3>1. What we collect</h3>
      <p>
        We store only the minimum needed to run the airdrop: your sign-in email, your chosen display
        name, your X / Instagram handles, your wallet address, your points and an audit log of tasks
        completed. We do <b>not</b> store images or media.
      </p>

      <h3>2. How we use it</h3>
      <p>
        Your data is used to verify tasks, award points, prevent abuse, show the leaderboard, and to
        distribute the eventual PEX reward to your wallet.
      </p>

      <h3>3. Third parties</h3>
      <p>
        Sign-in and data storage use Google Firebase. On-chain checks query the Pexli blockchain
        explorer. Social verification uses public endpoints (e.g. X’s public oEmbed). Your wallet
        address and any content you post publicly (tweets, links) are, by nature, public.
      </p>

      <h3>4. Your in-app wallet (non-custodial)</h3>
      <p>
        The Pexli wallet is <b>self-custody</b>. Your recovery phrase and private key are generated
        and kept <b>only in your browser</b>, encrypted with your password. They are <b>never sent to
        or stored on our servers</b> — we only ever store your public wallet address. We cannot
        recover your wallet for you, so keep your own backup. See{" "}
        <Link to="/wallet-security">Wallet Security</Link>.
      </p>

      <h3>5. Cookies &amp; local storage</h3>
      <p>
        We use local storage for sign-in sessions, small conveniences (like a referral code), and to
        hold your <b>encrypted</b> wallet on your device. We do not sell your data.
      </p>

      <h3>6. Data retention &amp; deletion</h3>
      <p>
        We keep your account data while the airdrop runs. To request deletion of your account data,
        contact us via the official Pexli channels.
      </p>

      <h3>7. Security</h3>
      <p>
        All point and reward writes happen server-side; the browser can never write points. Access
        to your own data is restricted to your account.
      </p>

      <h3>8. Changes</h3>
      <p>We may update this policy; material changes will be reflected on this page.</p>

      <p className="mt">
        See also our <Link to="/terms">Terms of Service</Link>.
      </p>
    </div>
  );
}
