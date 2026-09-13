import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SocialCard } from "../components/Account";
import { WalletOnboard } from "../components/InAppWallet";
import Icon from "../components/Icon";

// Onboarding: the user creates/imports their in-app Pexli wallet + links an X
// account to activate. The wallet's public address is what activates the
// account (saved via setWallet inside WalletOnboard). Redirects once active.
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
          Set up your in-app <span className="accent">Pexli</span> wallet and link your X account to
          join the airdrop. Both are required — this keeps bots out.
        </p>
      </div>

      <div className="checklist">
        <span className={`chk ${hasWallet ? "done" : ""}`}>
          <Icon name={hasWallet ? "check" : "wallet"} size={16} /> Pexli wallet
        </span>
        <span className={`chk ${hasX ? "done" : ""}`}>
          <Icon name={hasX ? "check" : "x"} size={16} /> X account
        </span>
      </div>

      <div className="stack mt">
        <WalletOnboard onReady={refreshProfile} />
        <SocialCard profile={profile} onSaved={refreshProfile} />
      </div>

      <p className="subtle mt" style={{ textAlign: "center" }}>
        By activating you agree to our <Link to="/terms">Terms</Link>,{" "}
        <Link to="/privacy">Privacy Policy</Link> and <Link to="/wallet-security">Wallet Security</Link> notes.
      </p>
    </div>
  );
}
