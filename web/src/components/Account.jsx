import { useState } from "react";
import { api, errMessage } from "../lib/functions";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

// "Your logins" card. ONE login (Google OR X) is enough for an active account
// (see AuthContext.isActive); linking the other one is optional and just lets
// the user sign in either way (and unlocks the X quests). Whichever the user
// did NOT sign up with is offered as a Connect button here. Uniqueness is
// enforced server-side: Google natively (auth/credential-already-in-use), X
// via xIndex.
export function AccountLinks({ profile, onSaved }) {
  const { googleLinked, xLinked, linkGoogle } = useAuth();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function connectX() {
    setBusy("x");
    setErr("");
    try {
      const res = await api.xAuthStart();
      window.location.href = res.data.url;
    } catch (e) {
      setErr(errMessage(e));
      setBusy("");
    }
  }

  async function connectGoogle() {
    setBusy("google");
    setErr("");
    try {
      await linkGoogle();
      onSaved?.();
    } catch (e) {
      if (e?.code === "auth/credential-already-in-use") {
        setErr("That Google account is already linked to another Pexli account.");
      } else if (e?.code === "auth/popup-closed-by-user") {
        /* user cancelled — no error */
      } else {
        setErr(e?.message || "Could not link Google.");
      }
      setBusy("");
    }
  }

  return (
    <div className="panel">
      <h3 className="card-title"><Icon name="users" /> Your logins</h3>
      <p className="task-desc">
        One login (Google <b>or</b> X) is enough, your account is active with just one. Linking the
        other is optional: it lets you sign in either way and unlocks the X quests. Each Google or
        X account can be linked to only one Pexli account.
      </p>
      {err && <p className="msg err">{err}</p>}

      <div className="link-row">
        <span className="link-name">
          <Icon name="users" size={16} /> Google
          {profile?.email && <span className="mono">{profile.email}</span>}
        </span>
        {googleLinked ? (
          <span className="badge on"><Icon name="check" size={13} /> Linked</span>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={connectGoogle} disabled={busy === "google"}>
            {busy === "google" ? "…" : "Connect Google"}
          </button>
        )}
      </div>

      <div className="link-row">
        <span className="link-name">
          <Icon name="x" size={16} /> X (Twitter)
          {profile?.xHandle && <span className="mono">@{profile.xHandle}</span>}
        </span>
        {xLinked ? (
          <span className="badge on"><Icon name="check" size={13} /> Linked</span>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={connectX} disabled={busy === "x"}>
            {busy === "x" ? "…" : "Connect X"}
          </button>
        )}
      </div>

      <div className="wl-sep" />
      <HandleRow icon="instagram" label="Instagram (optional)" placeholder="your Instagram handle"
        saved={profile?.igHandle} platform="instagram" onSaved={onSaved} />
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
