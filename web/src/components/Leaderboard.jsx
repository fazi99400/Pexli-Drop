import { useEffect, useState } from "react";
import { api, errMessage } from "../lib/functions";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

// Top-100 leaderboard with the daily rank-bonus legend.
export default function Leaderboard() {
  const { user, config, profile, refreshProfile } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const lb = (config && config.leaderboard) || null;
  const r = (lb && lb.rewards) || {};

  async function load() {
    setErr("");
    try {
      const res = await api.getLeaderboard();
      setRows(res.data || []);
    } catch (e) {
      setErr(errMessage(e));
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const rankClass = (rank) => (rank <= 3 ? `rankbadge r${rank}` : "rankbadge");

  return (
    <>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="trophy" size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />
          Leaderboard
        </h2>
        <span className="count">Top 100 · updates live</span>
      </div>

      {profile && (
        <NameEditor
          current={profile.displayName || ""}
          onSaved={async () => {
            await refreshProfile();
            load();
          }}
        />
      )}

      {lb && lb.enabled && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <p className="task-desc" style={{ marginTop: 0 }}>
            Every 24 hours the top players earn bonus points by rank:
          </p>
          <div className="row" style={{ gap: 8 }}>
            <span className="task-points">#1 +{r.rank1}</span>
            <span className="task-points">#2 +{r.rank2}</span>
            <span className="task-points">#3 +{r.rank3}</span>
            <span className="task-points">Top 10 +{r.top10}</span>
            <span className="task-points">Top 50 +{r.top50}</span>
            <span className="task-points">Top 100 +{r.top100}</span>
          </div>
        </div>
      )}

      {err && <p className="msg err">{err}</p>}
      {rows === null ? (
        <div className="center" style={{ minHeight: 120 }}>
          <div className="spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="subtle">No players yet — be the first to earn points!</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Rank</th>
                <th>Player</th>
                <th style={{ textAlign: "right" }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const me = user && row.uid === user.uid;
                return (
                  <tr key={row.uid} style={me ? { background: "rgba(255, 154, 61,0.10)" } : undefined}>
                    <td>
                      <span className={rankClass(row.rank)}>{row.rank}</span>
                    </td>
                    <td>
                      {row.name} {me && <span className="badge on">you</span>}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                      {row.points.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Lets the user set the name shown on the leaderboard.
function NameEditor({ current, onSaved }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.setDisplayName({ name: name.trim() });
      setMsg({ ok: true, text: "Saved! Your leaderboard name is updated." });
      onSaved?.();
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="name-editor">
        <span className="subtle">
          Your leaderboard name: <b>{current || "Anon"}</b>
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
          <Icon name="edit" size={15} /> Change name
        </button>
      </div>
    );
  }
  return (
    <div className="name-editor">
      <input
        className="task-input"
        style={{ maxWidth: 260 }}
        value={name}
        maxLength={24}
        placeholder="Your name (2–24 chars)"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && name.trim().length >= 2 && save()}
      />
      <button className="btn btn-sm btn-primary" onClick={save} disabled={busy || name.trim().length < 2}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
      {msg && <span className={`msg ${msg.ok ? "ok" : "err"}`} style={{ margin: 0 }}>{msg.text}</span>}
    </div>
  );
}
