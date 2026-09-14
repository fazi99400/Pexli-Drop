import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccountLinks } from "../components/Account";
import { WalletManager, WalletOnboard } from "../components/InAppWallet";
import { useWallet } from "../context/WalletContext";

// Settings — manage the in-app wallet + socials here (kept off the dashboard).
export default function Settings() {
  const { profile, refreshProfile, logout } = useAuth();
  const { unlocked } = useWallet();
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="section-head">
        <h2 className="section-title">Settings</h2>
      </div>
      <div className="stack">
        {unlocked ? <WalletManager /> : <WalletOnboard onReady={refreshProfile} />}
        <AccountLinks profile={profile} onSaved={refreshProfile} />
        <div className="panel">
          <h3 className="card-title">Account</h3>
          <p className="kv">{profile?.email || "—"}</p>
          <div className="row mt">
            <Link className="btn btn-sm btn-ghost" to="/terms">
              Terms of Service
            </Link>
            <Link className="btn btn-sm btn-ghost" to="/privacy">
              Privacy Policy
            </Link>
            <Link className="btn btn-sm btn-ghost" to="/wallet-security">
              Wallet Security
            </Link>
            <button className="btn btn-sm btn-danger" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
