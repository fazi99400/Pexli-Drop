import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccountLinks } from "../components/Account";
import { WalletManager, WalletOnboard } from "../components/InAppWallet";
import { useWallet } from "../context/WalletContext";
import { api, errMessage } from "../lib/functions";
import Icon from "../components/Icon";

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
        <DisplayNameCard current={profile?.displayName || ""} onSaved={refreshProfile} />
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

// Set the display name shown on the public leaderboard.
function DisplayNameCard({ current, onSaved }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.setDisplayName({ name: name.trim() });
      setMsg({ ok: true, text: "Saved. This name now shows on the leaderboard." });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const dirty = name.trim() !== (current || "").trim();
  return (
    <div className="panel">
      <h3 className="card-title">
        <Icon name="edit" /> Display name
      </h3>
      <p className="task-desc" style={{ marginBottom: 12 }}>
        This is the name other players see on the leaderboard.
      </p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input
          className="task-input"
          value={name}
          maxLength={24}
          placeholder="Your name (2–24 characters)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && !busy && name.trim().length >= 2 && save()}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={busy || !dirty || name.trim().length < 2}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}
