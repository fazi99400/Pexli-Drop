import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { WalletCard, SocialCard } from "../components/Account";
import Icon from "../components/Icon";

// Onboarding: the user must add a reward wallet + an X account to activate and
// join the airdrop. Redirects to the dashboard once active.
export default function Activate() {
  const { profile, isActive, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isActive) navigate("/", { replace: true });
  }, [isActive, navigate]);

  const hasWallet = !!profile?.walletAddress;
  const hasX = !!profile?.xHandle;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", paddingTop: 28 }}>
      <div className="hero" style={{ padding: "24px 0 18px" }}>
        <h1 style={{ fontSize: "clamp(26px,5vw,40px)" }}>Activate your account</h1>
        <p>
          To join the <span className="accent">PEX</span> airdrop, add your reward wallet and your X
          account. Both are required — this keeps bots out.
        </p>
      </div>

      <div className="checklist">
        <span className={`chk ${hasWallet ? "done" : ""}`}>
          <Icon name={hasWallet ? "check" : "wallet"} size={16} /> Wallet address
        </span>
        <span className={`chk ${hasX ? "done" : ""}`}>
          <Icon name={hasX ? "check" : "x"} size={16} /> X account
        </span>
      </div>

      <div className="stack mt">
        <WalletCard profile={profile} onSaved={refreshProfile} />
        <SocialCard profile={profile} onSaved={refreshProfile} />
      </div>

      <p className="subtle mt" style={{ textAlign: "center" }}>
        By activating you agree to our <Link to="/terms">Terms</Link> and{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}
