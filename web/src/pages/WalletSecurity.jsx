import { Link } from "react-router-dom";
import Icon from "../components/Icon";

// Plain-language explanation of how the in-app wallet handles keys. Linked from
// activation, settings and the footer so the custody model is always clear.
export default function WalletSecurity() {
  return (
    <div className="doc" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1><Icon name="shield" /> Wallet Security</h1>
      <p className="subtle">How your Pexli wallet keeps your funds yours.</p>

      <h2>Self-custody — you hold the keys</h2>
      <p>
        Your Pexli wallet is <b>non-custodial</b>. When you create or import a wallet, the secret
        (your recovery phrase / private key) is generated and kept <b>only in your own browser</b>.
        It is encrypted with the password you choose and stored on your device. We never receive it,
        never store it, and can never see it.
      </p>

      <h2>What our servers store</h2>
      <p>
        Only your <b>public wallet address</b> — the same string you'd share to receive funds. That
        lets us credit your airdrop points and send faucet PEX to you. Nothing secret ever leaves
        your device.
      </p>

      <h2>Faucet &amp; swap</h2>
      <p>
        The faucet sends test PEX to your address from a Pexli-run account — you just click claim.
        Swaps are built and signed <b>inside your browser</b> by your own wallet; we don't hold or
        move your funds. Every transaction is yours to approve.
      </p>

      <h2>Your responsibility</h2>
      <ul>
        <li><b>Back up your recovery phrase</b> and store it offline. It is the only way to restore your wallet.</li>
        <li>There is <b>no "forgot password"</b> — if you lose both your password and your phrase, no one can recover the wallet.</li>
        <li><b>Never share</b> your phrase or private key with anyone, including anyone claiming to be Pexli support.</li>
        <li>Clearing your browser data removes the encrypted wallet from this device — restore it with your phrase.</li>
      </ul>

      <h2>Good to know</h2>
      <p>
        Entering a recovery phrase into any website carries more risk than a hardware or extension
        wallet. Use a strong, unique password, keep your device malware-free, and only ever type your
        phrase on the real <b>drop.pex.li</b>.
      </p>

      <p className="mt">
        See also our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}
