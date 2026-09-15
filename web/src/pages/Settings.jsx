import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccountLinks } from "../components/Account";
import { WalletManager, WalletOnboard } from "../components/InAppWallet";
import { useWallet } from "../context/WalletContext";
import { api, errMessage } from "../lib/functions";
import Icon from "../components/Icon";
import { LINKS } from "../lib/chain";
import { canInstall, onInstallChange, promptInstall, isStandalone, isIOS } from "../lib/pwa";

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
        <InstallAppCard />
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
        <LinksCard />
      </div>
    </div>
  );
}

// Footer links live here on mobile (the page footer is hidden on small screens).
function LinksCard() {
  return (
    <div className="panel mobile-only">
      <h3 className="card-title">More</h3>
      <div className="links-grid">
        <Link className="btn btn-sm btn-ghost" to="/guide">Guide</Link>
        <Link className="btn btn-sm btn-ghost" to="/faq">FAQ</Link>
        <a className="btn btn-sm btn-ghost" href={LINKS.main} target="_blank" rel="noreferrer">Pexli</a>
        <a className="btn btn-sm btn-ghost" href={LINKS.faucet} target="_blank" rel="noreferrer">Faucet</a>
        <a className="btn btn-sm btn-ghost" href={LINKS.dex} target="_blank" rel="noreferrer">Lifelox</a>
        <a className="btn btn-sm btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">X</a>
      </div>
      <p className="subtle" style={{ marginTop: 12, marginBottom: 0 }}>
        Pexli Airdrop — All rights reserved by Pexli Labs
      </p>
    </div>
  );
}

// "Install app" card — installs Pexli as a home-screen app (PWA). Uses the
// native install prompt where available; gives iOS users the manual steps.
function InstallAppCard() {
  const [installable, setInstallable] = useState(canInstall());
  const [done, setDone] = useState(false);
  useEffect(() => onInstallChange(setInstallable), []);

  if (isStandalone()) return null; // already running as an installed app

  async function install() {
    const ok = await promptInstall();
    if (ok) setDone(true);
  }

  return (
    <div className="panel install-card">
      <div className="install-ic">
        <img src="/icon-192.png" alt="Pexli app" width={44} height={44} />
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          Install the Pexli app
        </h3>
        {done ? (
          <p className="task-desc">Installed! Look for the Pexli icon on your home screen.</p>
        ) : installable ? (
          <p className="task-desc">
            Add Pexli to your home screen for a full-screen, app-like experience.
          </p>
        ) : isIOS() ? (
          <p className="task-desc">
            On iPhone/iPad: tap the <b>Share</b> button in Safari, then{" "}
            <b>“Add to Home Screen.”</b>
          </p>
        ) : (
          <p className="task-desc">
            Open your browser menu and choose <b>“Install app”</b> / <b>“Add to Home screen.”</b>
          </p>
        )}
      </div>
      {installable && !done && (
        <button className="btn btn-primary btn-sm" onClick={install}>
          <Icon name="download" size={15} /> Install
        </button>
      )}
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
