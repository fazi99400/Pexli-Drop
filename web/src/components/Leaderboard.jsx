import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMessage } from "../lib/functions";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

// Top-100 leaderboard with the daily rank-bonus legend. Pass `limit` (e.g. 3)
// for a compact preview — the home dashboard shows only the top few, with a
// link to the full ranking; the dedicated /leaderboard page renders this with
// no limit and shows all 100.
// Ambassador badge text by tier (row.amb comes from users/{uid}.ambTier).
const AMB_LABEL = {
  ambassador: "Ambassador",
  rising: "Ambassador · Rising",
  lead: "Ambassador · Lead",
  champion: "Ambassador · Champion",
};

export default function Leaderboard({ limit } = {}) {
  const { user, config } = useAuth();
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
  const displayRows = limit && rows ? rows.slice(0, limit) : rows;

  return (
    <>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="trophy" size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />
          Leaderboard
        </h2>
        <span className="count">{limit ? `Top ${limit}` : "Top 100"} · updates live</span>
      </div>

      {!limit && lb && lb.enabled && (
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
      {displayRows === null ? (
        <div className="center" style={{ minHeight: 120 }}>
          <div className="spin" />
        </div>
      ) : displayRows.length === 0 ? (
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
              {displayRows.map((row) => {
                const me = user && row.uid === user.uid;
                return (
                  <tr key={row.uid} style={me ? { background: "rgba(255, 154, 61,0.10)" } : undefined}>
                    <td>
                      <span className={rankClass(row.rank)}>{row.rank}</span>
                    </td>
                    <td>
                      {row.name}
                      {row.amb && (
                        <span className="amb-badge" title="Pexli Ambassador">
                          {AMB_LABEL[row.amb] || "Ambassador"}
                        </span>
                      )}{" "}
                      {me && <span className="badge on">you</span>}
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

      {limit && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <Link className="btn btn-sm btn-ghost" to="/leaderboard">
            View full leaderboard <Icon name="external" size={14} />
          </Link>
        </div>
      )}
    </>
  );
}
