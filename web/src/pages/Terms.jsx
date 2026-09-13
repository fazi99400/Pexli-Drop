import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="legal">
      <h1>Terms of Service</h1>
      <p className="subtle">Last updated: {new Date().getFullYear()}</p>

      <h3>1. Acceptance</h3>
      <p>
        By accessing Pexli Drop (the “Platform”) at drop.pex.li, you agree to these Terms. If you do
        not agree, do not use the Platform.
      </p>

      <h3>2. Eligibility</h3>
      <p>
        You must be legally permitted to use the Platform in your jurisdiction. You are responsible
        for the accuracy of the wallet address and social accounts you provide.
      </p>

      <h3>3. Points and rewards</h3>
      <p>
        Points are earned by completing tasks and are verified server-side. Points have no monetary
        value and may later convert to a mainnet PEX reward at a rate and time decided solely by
        Pexli. We may adjust, withhold, or revoke points obtained through fraud, automation, or
        multiple/fake accounts.
      </p>

      <h3>4. Fair use &amp; anti-abuse</h3>
      <p>
        One wallet and one X account map to a single account. Bots, self-referrals, fake engagement,
        and any attempt to game verification are prohibited and may result in disqualification.
      </p>

      <h3>5. Your wallet &amp; on-chain actions</h3>
      <p>
        The in-app wallet is <b>non-custodial</b>: your recovery phrase and keys stay encrypted in
        your own browser and never reach our servers. <b>You alone</b> are responsible for backing up
        your recovery phrase and safeguarding your password — if you lose them, no one, including
        Pexli, can recover your wallet or funds. You are solely responsible for transactions you make
        (faucet, swaps, transfers); blockchain transactions are irreversible and Pexli is not liable
        for losses. See <Link to="/wallet-security">Wallet Security</Link>.
      </p>

      <h3>6. No warranty</h3>
      <p>
        The Platform is provided “as is”, without warranties of any kind. Rewards, timelines, and
        features may change or be discontinued at any time.
      </p>

      <h3>7. Limitation of liability</h3>
      <p>
        To the maximum extent permitted by law, Pexli is not liable for any indirect or
        consequential damages arising from your use of the Platform.
      </p>

      <h3>8. Changes</h3>
      <p>We may update these Terms; continued use means you accept the changes.</p>

      <p className="mt">
        See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}
