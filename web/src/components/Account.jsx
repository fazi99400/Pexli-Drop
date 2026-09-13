import { useState } from "react";
import { api, errMessage } from "../lib/functions";
import { connectWallet, addPexliNetwork } from "../lib/wallet";
import Icon from "./Icon";

// Wallet card — connect / paste the reward address. Reused on Activate + Settings.
export function WalletCard({ profile, onSaved }) {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = profile?.walletAddress;

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      setAddr(await connectWallet());
    } catch (e) {
      setMsg({ ok: false, text: e?.message });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.setWallet({ walletAddress: addr.trim() });
      setMsg({ ok: true, text: `Saved ${res.data.walletAddress}` });
      setAddr("");
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title">
          <Icon name="wallet" /> Wallet {saved && <span className="badge on">saved</span>}
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={() => addPexliNetwork().catch(() => {})}>
          + Network
        </button>
      </div>
      {saved ? (
        <p className="kv">
          Reward address: <span className="mono">{saved}</span>
        </p>
      ) : (
        <p className="task-desc">
          Enter the ETH-style address that will receive your PEX reward. Connect
          MetaMask/TrustWallet (auto-adds Pexli) or paste it.
        </p>
      )}
      <div className="stack">
        <button className="btn btn-sm" onClick={connect} disabled={busy}>
          <Icon name="wallet" size={16} /> Connect wallet
        </button>
        <div className="row">
          <input
            className="task-input"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="0x… reward address"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !addr.trim()}>
            {saved ? "Update" : "Save"}
          </button>
        </div>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}

// Socials card — save X / Instagram handles, optional X connect.
export function SocialCard({ profile, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const connected = !!profile?.xUserId;

  async function connectX() {
    setBusy(true);
    setErr("");
    try {
      const res = await api.xAuthStart();
      window.location.href = res.data.url;
    } catch (e) {
      setErr(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title">
          <Icon name="users" /> Your socials
        </h3>
        <button
          className="btn btn-sm"
          onClick={connectX}
          disabled={busy || connected}
          title="Verify a real X account"
        >
          <Icon name="x" size={15} /> {connected ? "X verified" : "Connect X"}
        </button>
      </div>
      <p className="task-desc">
        Save your X handle (required to activate). Instagram is optional. You can also connect X to
        verify a real account.
      </p>
      {err && <p className="msg err">{err}</p>}
      <HandleRow icon="x" label="X (Twitter)" placeholder="your X handle" saved={profile?.xHandle} platform="x" onSaved={onSaved} />
      <HandleRow icon="instagram" label="Instagram" placeholder="your Instagram handle" saved={profile?.igHandle} platform="instagram" onSaved={onSaved} />
    </div>
  );
}

function HandleRow({ icon, label, placeholder, saved, platform, onSaved }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.setSocialHandle({ platform, handle: val.trim() });
      setMsg({ ok: true, text: `Saved @${res.data.handle}` });
      setVal("");
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="handle-row">
      <div className="row spread">
        <span className="kv" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name={icon} size={16} /> {label}
          {saved && <span className="mono">@{saved}</span>}
        </span>
      </div>
      <div className="row">
        <span className="at">@</span>
        <input
          className="task-input"
          style={{ flex: 1, minWidth: 120 }}
          placeholder={placeholder}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !val.trim()}>
          {saved ? "Update" : "Save"}
        </button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}
