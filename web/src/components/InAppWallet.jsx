import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { api, errMessage } from "../lib/functions";
import {
  createWallet,
  importFromMnemonic,
  importFromPrivateKey,
  unlockWallet,
  exportSecret,
  changeWalletPassword,
  removeWallet,
  explorerTxUrl,
} from "../lib/localWallet";
import Icon from "./Icon";

// Push the (public) wallet address to the server so the account can activate.
// Only the address is sent — never the key.
async function syncAddress(address) {
  try {
    await api.setWallet({ walletAddress: address });
  } catch (e) {
    // Non-fatal for the wallet itself; surfaced by the caller if it matters.
    console.warn("setWallet failed", errMessage(e));
    throw e;
  }
}

function Field({ label, ...props }) {
  return (
    <label className="wl-field">
      <span className="wl-label">{label}</span>
      <input className="task-input" {...props} />
    </label>
  );
}

// --- Onboarding: create OR import, then unlock -------------------------------
export function WalletOnboard({ onReady }) {
  const { exists, adopt } = useWallet();
  if (exists) return <UnlockForm onReady={onReady} />;
  return <CreateOrImport onReady={onReady} adopt={adopt} />;
}

function CreateOrImport({ onReady, adopt }) {
  const [tab, setTab] = useState("create");
  return (
    <div className="panel">
      <h3 className="card-title">
        <Icon name="wallet" /> Your Pexli wallet
      </h3>
      <p className="task-desc">
        This is a self-custody wallet that lives in <b>your browser only</b>. Your secret phrase is
        encrypted with your password and never leaves this device or reaches our servers — so keep a
        backup, because no one can reset it for you.
      </p>
      <div className="wl-tabs">
        <button className={`wl-tab ${tab === "create" ? "on" : ""}`} onClick={() => setTab("create")}>
          Create new
        </button>
        <button className={`wl-tab ${tab === "import" ? "on" : ""}`} onClick={() => setTab("import")}>
          Import existing
        </button>
      </div>
      {tab === "create" ? (
        <CreateForm onReady={onReady} adopt={adopt} />
      ) : (
        <ImportForm onReady={onReady} adopt={adopt} />
      )}
    </div>
  );
}

function passwordProblem(pw, pw2) {
  if (pw.length < 8) return "Use a password of at least 8 characters.";
  if (pw !== pw2) return "The two passwords don't match.";
  return null;
}

function CreateForm({ onReady, adopt }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [backup, setBackup] = useState(null); // { mnemonic }
  const [confirmed, setConfirmed] = useState(false);

  async function create() {
    const problem = passwordProblem(pw, pw2);
    if (problem) return setErr(problem);
    setErr("");
    setBusy(true);
    try {
      const { mnemonic } = await createWallet(pw);
      setBackup({ mnemonic });
    } catch (e) {
      setErr(e?.message || "Could not create wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setErr("");
    try {
      const signer = await unlockWallet(pw);
      await syncAddress(signer.address);
      adopt(signer);
      onReady?.(signer.address);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (backup) {
    return (
      <div className="stack">
        <div className="wl-warn">
          <Icon name="shield" size={16} /> Write these 12 words down and store them offline. Anyone
          with them controls your funds. We can never recover them for you.
        </div>
        <div className="wl-seed">
          {backup.mnemonic.split(" ").map((w, i) => (
            <span key={i} className="wl-word">
              <b>{i + 1}</b> {w}
            </span>
          ))}
        </div>
        <label className="wl-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have saved my recovery phrase somewhere safe.
        </label>
        {err && <p className="msg err">{err}</p>}
        <button className="btn btn-primary" onClick={finish} disabled={busy || !confirmed}>
          {busy ? "Finishing…" : "Continue"}
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <Field label="Wallet password" type="password" value={pw} placeholder="at least 8 characters"
        onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <Field label="Confirm password" type="password" value={pw2} placeholder="repeat password"
        onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      <p className="subtle">This password encrypts your wallet on this device. There's no “forgot password” — back up your phrase.</p>
      {err && <p className="msg err">{err}</p>}
      <button className="btn btn-primary" onClick={create} disabled={busy || !pw || !pw2}>
        {busy ? "Creating…" : "Create wallet"}
      </button>
    </div>
  );
}

function ImportForm({ onReady, adopt }) {
  const [mode, setMode] = useState("phrase");
  const [secret, setSecret] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function doImport() {
    const problem = passwordProblem(pw, pw2);
    if (problem) return setErr(problem);
    if (!secret.trim()) return setErr("Paste your phrase or private key.");
    setErr("");
    setBusy(true);
    try {
      if (mode === "phrase") await importFromMnemonic(secret, pw);
      else await importFromPrivateKey(secret, pw);
      const signer = await unlockWallet(pw);
      await syncAddress(signer.address);
      adopt(signer);
      setSecret("");
      onReady?.(signer.address);
    } catch (e) {
      setErr(e?.message || errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="wl-tabs sm">
        <button className={`wl-tab ${mode === "phrase" ? "on" : ""}`} onClick={() => setMode("phrase")}>
          Recovery phrase
        </button>
        <button className={`wl-tab ${mode === "pk" ? "on" : ""}`} onClick={() => setMode("pk")}>
          Private key
        </button>
      </div>
      <label className="wl-field">
        <span className="wl-label">{mode === "phrase" ? "12 / 24-word phrase" : "Private key"}</span>
        <textarea
          className="task-input"
          rows={mode === "phrase" ? 3 : 2}
          placeholder={mode === "phrase" ? "word1 word2 word3 …" : "0x…"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <p className="subtle">Import your MetaMask / Trust / any EVM wallet. It stays in this browser only.</p>
      <Field label="New wallet password" type="password" value={pw} placeholder="at least 8 characters"
        onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <Field label="Confirm password" type="password" value={pw2} placeholder="repeat password"
        onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      {err && <p className="msg err">{err}</p>}
      <button className="btn btn-primary" onClick={doImport} disabled={busy || !secret.trim() || !pw || !pw2}>
        {busy ? "Importing…" : "Import wallet"}
      </button>
    </div>
  );
}

function UnlockForm({ onReady }) {
  const { adopt, address, setExists, setAddress } = useWallet();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmForgot, setConfirmForgot] = useState(false);

  // There is no password reset for a properly encrypted, non-custodial
  // wallet — that's the whole point. The only way back in without the
  // password is the recovery phrase, so this just clears the local, now-
  // inaccessible keystore and drops the user into Import (see WalletOnboard:
  // exists becomes false, so CreateOrImport renders instead of this form).
  function forgotPassword() {
    removeWallet();
    setExists(false);
    setAddress(null);
  }

  async function unlock() {
    setBusy(true);
    setErr("");
    try {
      const signer = await unlockWallet(pw);
      adopt(signer);
      setPw("");
      // Self-heal: the very first sync (at creation/import time) can fail
      // silently — a network blip, a cold function — and until now nothing
      // ever retried it, leaving the wallet unlocked locally forever while
      // the server never learned the address (faucet/swap/send all then
      // fail with "set up your wallet" despite it clearly existing). Retry
      // it on every unlock, best-effort — never blocks getting into the wallet.
      syncAddress(signer.address).catch(() => {});
      onReady?.(signer.address);
    } catch (e) {
      setErr(e?.message || "Wrong password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3 className="card-title">
        <Icon name="wallet" /> Unlock your wallet
      </h3>
      {address && (
        <p className="kv">
          <span className="mono">{address.slice(0, 10)}…{address.slice(-8)}</span>
        </p>
      )}
      <div className="stack">
        <Field label="Wallet password" type="password" value={pw} placeholder="your password"
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()}
          autoComplete="current-password" />
        {err && <p className="msg err">{err}</p>}
        <button className="btn btn-primary" onClick={unlock} disabled={busy || !pw}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        {!confirmForgot ? (
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmForgot(true)}>
            Forgot password?
          </button>
        ) : (
          <div className="wl-warn">
            <Icon name="shield" size={16} />
            <div>
              <p style={{ margin: 0 }}>
                There's no password reset — only your 12-word recovery phrase gets you back in. If
                you saved it, remove this wallet from the device and re-import with your phrase.
                If you didn't save it, this wallet is unrecoverable.
              </p>
              <div className="row mt">
                <button className="btn btn-sm btn-danger" onClick={forgotPassword}>
                  Remove from device &amp; re-import
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirmForgot(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Change the wallet's encryption password — needs the current password (a
// re-encrypt, never a blind reset). Lives inside WalletManager.
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function change() {
    const problem = passwordProblem(newPw, newPw2);
    if (problem) return setMsg({ ok: false, text: problem });
    setBusy(true);
    setMsg(null);
    try {
      await changeWalletPassword(oldPw, newPw);
      setMsg({ ok: true, text: "Password changed." });
      setOldPw("");
      setNewPw("");
      setNewPw2("");
      setTimeout(() => setOpen(false), 1200);
    } catch (e) {
      setMsg({ ok: false, text: e?.message || "Could not change password." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="edit" size={14} /> Change password
      </button>
    );
  }
  return (
    <div className="stack">
      <Field label="Current password" type="password" value={oldPw} placeholder="current password"
        onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
      <Field label="New password" type="password" value={newPw} placeholder="at least 8 characters"
        onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
      <Field label="Confirm new password" type="password" value={newPw2} placeholder="repeat new password"
        onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      <div className="row">
        <button className="btn btn-sm btn-primary" onClick={change} disabled={busy || !oldPw || !newPw || !newPw2}>
          {busy ? "Changing…" : "Save new password"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Manager: address, balance, backup, lock, remove ------------------------
export function WalletManager() {
  const { address, balance, unlocked, lock, refreshBalance, setExists, setAddress } = useWallet();
  const [reveal, setReveal] = useState(null); // { mnemonic, privateKey }
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function doReveal() {
    setBusy(true);
    setErr("");
    try {
      setReveal(await exportSecret(pw));
      setPw("");
    } catch (e) {
      setErr(e?.message || "Wrong password.");
    } finally {
      setBusy(false);
    }
  }
  function copyAddr() {
    try {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      /* ignore */
    }
  }
  function remove() {
    removeWallet();
    setExists(false);
    setAddress(null);
    lock();
    setConfirmRemove(false);
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3 className="card-title">
          <Icon name="wallet" /> Wallet
        </h3>
        <span className={`badge ${unlocked ? "on" : ""}`}>{unlocked ? "unlocked" : "locked"}</span>
      </div>
      <p className="kv">
        Address:{" "}
        <span className="mono">{address ? `${address.slice(0, 12)}…${address.slice(-10)}` : "—"}</span>
      </p>
      <div className="row spread">
        <span className="kv">Balance: <b className="accent">{balance == null ? "…" : `${Number(balance).toFixed(4)} PEX`}</b></span>
        <div className="row">
          <button className="btn btn-sm btn-ghost" onClick={copyAddr}>{copied ? "Copied" : "Copy address"}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => refreshBalance()}>Refresh</button>
        </div>
      </div>

      <div className="wl-sep" />

      {!reveal ? (
        <div className="stack">
          <p className="task-desc">
            <Icon name="shield" size={15} /> Back up your recovery phrase. Enter your password to reveal it — it is shown on this device only.
          </p>
          <div className="row">
            <input className="task-input" style={{ flex: 1 }} type="password" placeholder="wallet password"
              value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <button className="btn btn-sm" onClick={doReveal} disabled={busy || !pw}>
              {busy ? "…" : "Reveal backup"}
            </button>
          </div>
          {err && <p className="msg err">{err}</p>}
        </div>
      ) : (
        <div className="stack">
          <div className="wl-warn"><Icon name="shield" size={16} /> Never share these. Anyone with them can take your funds.</div>
          {reveal.mnemonic && (
            <div className="wl-seed">
              {reveal.mnemonic.split(" ").map((w, i) => (
                <span key={i} className="wl-word"><b>{i + 1}</b> {w}</span>
              ))}
            </div>
          )}
          <label className="wl-field">
            <span className="wl-label">Private key</span>
            <input className="task-input mono" readOnly value={reveal.privateKey} onFocus={(e) => e.target.select()} />
          </label>
          <button className="btn btn-sm btn-ghost" onClick={() => setReveal(null)}>Hide</button>
        </div>
      )}

      <div className="wl-sep" />
      <ChangePasswordSection />

      <div className="wl-sep" />
      <div className="row spread">
        {unlocked ? (
          <button className="btn btn-sm btn-ghost" onClick={lock}>Lock wallet</button>
        ) : (
          <span className="subtle">Locked — unlock from the Wallet page to sign.</span>
        )}
        {!confirmRemove ? (
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmRemove(true)}>Remove from device</button>
        ) : (
          <span className="row">
            <span className="subtle">Backed up?</span>
            <button className="btn btn-sm btn-danger" onClick={remove}>Yes, remove</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(false)}>Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}

export { explorerTxUrl };
