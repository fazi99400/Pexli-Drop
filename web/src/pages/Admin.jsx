import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";

const TABS = ["Tasks & Points", "Tweet Pool", "Moderation", "Users", "Admins"];

export default function Admin() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <>
      <h1 className="section-title" style={{ marginTop: 28 }}>
        Admin
      </h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Tasks & Points" && <ConfigTab />}
      {tab === "Tweet Pool" && <TweetPoolTab />}
      {tab === "Moderation" && <ModerationTab />}
      {tab === "Users" && <UsersTab />}
      {tab === "Admins" && <AdminsTab />}
    </>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  return <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>;
}

// --- Tasks, points, locks, approvals ---
function ConfigTab() {
  const { config } = useAuth();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (config && !draft) setDraft(JSON.parse(JSON.stringify(config)));
  }, [config, draft]);

  if (!draft) return <div className="spin" />;

  const setTask = (k, v) => setDraft({ ...draft, tasks: { ...draft.tasks, [k]: v } });
  const setPoint = (k, v) => setDraft({ ...draft, points: { ...draft.points, [k]: v } });
  const setLock = (k, v) => setDraft({ ...draft, locks: { ...draft.locks, [k]: v } });
  const setApproval = (k, v) =>
    setDraft({ ...draft, requiresApproval: { ...draft.requiresApproval, [k]: v } });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateConfig({ patch: draft });
      setMsg({ ok: true, text: "Config saved. Live for all users." });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h3 className="task-title">Task toggles</h3>
        <p className="subtle">Turn any task type on/off instantly — no redeploy.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
          {Object.keys(draft.tasks).map((k) => (
            <label key={k} className="row">
              <input
                type="checkbox"
                checked={!!draft.tasks[k]}
                onChange={(e) => setTask(k, e.target.checked)}
              />
              <span>{k}</span>
              <span className={`badge ${draft.tasks[k] ? "on" : "off"}`}>
                {draft.tasks[k] ? "on" : "off"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="card mt">
        <h3 className="task-title">Point values</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
          {Object.keys(draft.points).map((k) => (
            <div className="field" key={k}>
              <label>{k}</label>
              <input
                className="num"
                type="number"
                value={draft.points[k]}
                onChange={(e) => setPoint(k, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card mt">
        <h3 className="task-title">Time locks</h3>
        <div className="row">
          {Object.keys(draft.locks).map((k) => (
            <div className="field" key={k}>
              <label>{k}</label>
              <input
                className="num"
                type="number"
                value={draft.locks[k]}
                onChange={(e) => setLock(k, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card mt">
        <h3 className="task-title">Referral rewards</h3>
        <p className="subtle">Referrers earn this % of every point their invitees make.</p>
        <div className="row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!draft.referral?.enabled}
              onChange={(e) =>
                setDraft({ ...draft, referral: { ...draft.referral, enabled: e.target.checked } })
              }
            />
            <span>Enabled</span>
          </label>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Percent (%)</label>
            <input
              className="num"
              type="number"
              min="0"
              max="100"
              value={draft.referral?.percent ?? 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  referral: { ...draft.referral, percent: Number(e.target.value) },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="card mt">
        <h3 className="task-title">Requires admin approval</h3>
        <p className="subtle">Link tasks that hold points as “pending” until you approve them.</p>
        <div className="row">
          {Object.keys(draft.requiresApproval).map((k) => (
            <label key={k} className="row">
              <input
                type="checkbox"
                checked={!!draft.requiresApproval[k]}
                onChange={(e) => setApproval(k, e.target.checked)}
              />
              <span>{k}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="row mt">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save config"}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

// --- Tweet pool bulk upload ---
function TweetPoolTab() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function upload() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.uploadTweets({ text });
      setMsg({ ok: true, text: `Added ${res.data.added} tweets to the pool.` });
      setText("");
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const count = text.split("\n").filter((l) => l.trim()).length;
  return (
    <div className="card">
      <h3 className="task-title">Bulk-upload tweets</h3>
      <p className="subtle">One tweet per line (≤280 chars, include hashtags). Paste up to 10k.</p>
      <textarea
        className="task-input"
        style={{ minHeight: 260, fontFamily: "inherit" }}
        placeholder={"gm from the Pexli chain! #Pexli #PEX\nJust swapped on @LifeloxDEX ⚡ #Pexli"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row mt">
        <button className="btn btn-primary" onClick={upload} disabled={busy || !count}>
          {busy ? "Uploading…" : `Upload ${count} tweets`}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

// --- Moderation of pending submissions ---
function ModerationTab() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setMsg(null);
    try {
      const res = await api.listPending();
      setRows(res.data);
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(id, approve) {
    try {
      await (approve ? api.approveSubmission({ id }) : api.rejectSubmission({ id }));
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  if (!rows) return <div className="spin" />;
  return (
    <div>
      <div className="row spread">
        <h3 className="task-title">Pending submissions ({rows.length})</h3>
        <button className="btn btn-sm" onClick={load}>
          Refresh
        </button>
      </div>
      <Msg msg={msg} />
      {rows.length === 0 ? (
        <p className="subtle">Nothing awaiting approval. 🎉</p>
      ) : (
        <div className="table-wrap mt">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Link / ref</th>
                <th>Points</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.taskType}</td>
                  <td className="mono">
                    {/^https?:/.test(r.refId) ? (
                      <a href={r.refId} target="_blank" rel="noreferrer">
                        {r.refId}
                      </a>
                    ) : (
                      r.refId
                    )}
                  </td>
                  <td>{r.points}</td>
                  <td className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => act(r.id, true)}>
                      Approve
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => act(r.id, false)}>
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Users + CSV export ---
function UsersTab() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.listUsers({ search, limit: 100 });
      setRows(res.data);
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  async function exportCsv() {
    setMsg(null);
    try {
      const res = await api.exportUsersCsv();
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pexli-users-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: `Exported ${res.data.count} users.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  return (
    <div>
      <div className="row spread">
        <div className="row">
          <input
            className="task-input"
            style={{ maxWidth: 280 }}
            placeholder="Search handle / email / wallet"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button className="btn btn-sm" onClick={load} disabled={busy}>
            Search
          </button>
        </div>
        <button className="btn btn-sm btn-primary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <Msg msg={msg} />
      <div className="table-wrap mt">
        <table>
          <thead>
            <tr>
              <th>Handle</th>
              <th>Email</th>
              <th>Wallet</th>
              <th>Points</th>
              <th>Providers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.uid}>
                <td>{u.xHandle || "—"}</td>
                <td>{u.email || "—"}</td>
                <td className="mono">{u.walletAddress || "—"}</td>
                <td>
                  <b>{u.points}</b>
                </td>
                <td>{(u.authProviders || []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Grant admin ---
function AdminsTab() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);

  async function grant(makeAdmin) {
    setMsg(null);
    try {
      const res = await api.grantAdmin({ email, admin: makeAdmin });
      setMsg({ ok: true, text: `${makeAdmin ? "Granted" : "Revoked"} admin for ${res.data.uid}.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 className="task-title">Manage admins</h3>
      <p className="subtle">
        Grant/revoke the admin claim by email. The user must sign out and back in for it to take
        effect. (First admin is set via the <span className="mono">bootstrapAdmin</span> function.)
      </p>
      <div className="field">
        <label>User email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@pex.li" />
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={() => grant(true)} disabled={!email}>
          Grant admin
        </button>
        <button className="btn btn-sm btn-danger" onClick={() => grant(false)} disabled={!email}>
          Revoke
        </button>
      </div>
      <Msg msg={msg} />
    </div>
  );
}
