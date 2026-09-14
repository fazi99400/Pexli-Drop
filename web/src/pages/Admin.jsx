import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { StatCard, Bars, AreaLine, Donut } from "../components/StatCharts";

const TABS = ["Dashboard", "Tasks & Points", "Tweet Pool", "Moderation", "Users", "Admins"];

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
      {tab === "Dashboard" && <DashboardTab />}
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

// --- Analytics dashboard ----------------------------------------------------
const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

// Chart colours pulled from the theme so light/dark both look right.
const C = {
  orange: "var(--accent)",
  deep: "var(--accent-2)",
  green: "var(--green)",
  cyan: "var(--cyan)",
  red: "var(--red)",
};

function Panel({ title, sub, children, span }) {
  return (
    <div className="dash-panel" style={span ? { gridColumn: "1 / -1" } : undefined}>
      <div className="dash-panel-head">
        <h3 className="dash-panel-title">{title}</h3>
        {sub && <span className="subtle">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function DashboardTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState(null);

  async function load(d = days) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.adminStats({ days: d });
      setData(res.data);
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load(days);
  }, [days]); // eslint-disable-line

  if (busy && !data)
    return (
      <div className="center" style={{ padding: 40 }}>
        <div className="spin" />
      </div>
    );
  if (!data) return <Msg msg={msg} />;

  const u = data.users || {};
  const at = data.allTime || {};
  const tm = data.thisMonth || {};
  const activeToday = data.daily?.length ? data.daily[data.daily.length - 1].activeUsers : 0;
  const activePct = u.total ? Math.round((u.activated / u.total) * 100) : 0;
  const totalTx = (at.swap || 0) + (at.tx || 0) + (at.faucet || 0); // on-chain actions

  return (
    <div className="dash">
      <div className="row spread dash-toolbar">
        <div className="range-pills">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`pill ${days === r.days ? "active" : ""}`}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => load()} disabled={busy}>
          {busy ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>
      <Msg msg={msg} />

      {/* Headline KPIs */}
      <div className="kpi-grid">
        <StatCard label="Total users" value={u.total} sub={`${u.activated} activated · ${activePct}%`} accent={C.orange} icon="👥" />
        <StatCard label="Active today" value={activeToday} sub="earned points today" accent={C.cyan} icon="⚡" />
        <StatCard label="Total points minted" value={u.totalPoints} sub={`${u.referralPoints || 0} from referrals`} accent={C.green} icon="◆" />
        <StatCard label="Total swaps" value={at.swap || 0} sub={`${tm.swap || 0} this month`} accent={C.orange} icon="⇄" />
        <StatCard label="Total transactions" value={totalTx} sub={`swaps + sends + faucet`} accent={C.deep} icon="↗" />
        <StatCard label="Faucet claims" value={at.faucet || 0} sub={`${tm.faucet || 0} this month`} accent={C.cyan} icon="🚰" />
      </div>

      {/* Time-series */}
      <div className="dash-grid">
        <Panel title="Daily active users" sub={`last ${days} days`}>
          <AreaLine data={data.daily} field="activeUsers" color={C.cyan} />
        </Panel>
        <Panel title="Points minted / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.points }))} color={C.green} />
        </Panel>
        <Panel title="Swaps / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.swaps }))} color={C.orange} />
        </Panel>
        <Panel title="Transactions (send PEX) / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.txs }))} color={C.deep} />
        </Panel>
        <Panel title="New sign-ups / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.signups }))} color={C.cyan} />
        </Panel>
        <Panel title="Faucet claims / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.faucets }))} color={C.green} />
        </Panel>
      </div>

      {/* Monthly social / content */}
      <Panel title="Social & content — monthly" sub="X follows · Instagram · Medium articles (last 6 months)" span>
        <div className="month-cards">
          <StatCard label="X follows · this month" value={tm.follow_x || 0} sub={`${at.follow_x || 0} all-time`} accent={C.orange} icon="𝕏" />
          <StatCard label="Instagram · this month" value={tm.follow_ig || 0} sub={`${at.follow_ig || 0} all-time`} accent={C.red} icon="◎" />
          <StatCard label="Medium articles · this month" value={tm.medium || 0} sub={`${at.medium || 0} all-time`} accent={C.green} icon="✎" />
        </div>
        <Bars
          data={data.monthly}
          kind="month"
          height={170}
          series={[
            { key: "follow_x", label: "X follows", color: C.orange },
            { key: "follow_ig", label: "Instagram", color: C.red },
            { key: "medium", label: "Medium", color: C.green },
          ]}
        />
      </Panel>

      {/* Content breakdown + providers */}
      <div className="dash-grid two">
        <Panel title="Content submissions — this month" sub="approved / credited posts">
          <div className="mini-stats">
            <MiniStat label="Medium" v={tm.medium} allt={at.medium} c={C.green} />
            <MiniStat label="YouTube" v={tm.youtube} allt={at.youtube} c={C.red} />
            <MiniStat label="TikTok" v={tm.tiktok} allt={at.tiktok} c={C.cyan} />
            <MiniStat label="Instagram post" v={tm.instagram} allt={at.instagram} c={C.orange} />
            <MiniStat label="Review" v={tm.review} allt={at.review} c={C.deep} />
            <MiniStat label="Tweets" v={tm.tweet} allt={at.tweet} c={C.orange} />
          </div>
        </Panel>
        <Panel title="Sign-in providers" sub="how activated users log in">
          <Donut
            parts={[
              { label: "Google", value: u.google || 0, color: C.cyan },
              { label: "X (Twitter)", value: u.twitter || 0, color: C.orange },
            ]}
          />
          <div className="prov-rows">
            <div className="row spread"><span className="subtle">X handle linked</span><b>{u.withXHandle || 0}</b></div>
            <div className="row spread"><span className="subtle">Instagram linked</span><b>{u.withIgHandle || 0}</b></div>
          </div>
        </Panel>
      </div>

      {/* Task breakdown table */}
      <Panel title="Points ledger — task breakdown" sub={`within last ${days} days · ${data.ledgerTotal || 0} lifetime rows`} span>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Actions ({days}d)</th>
                <th>Points ({days}d)</th>
                <th>All-time actions</th>
              </tr>
            </thead>
            <tbody>
              {(data.taskBreakdown || []).map((t) => (
                <tr key={t.taskType}>
                  <td><span className="badge on" style={{ textTransform: "none" }}>{t.taskType}</span></td>
                  <td><b>{t.count}</b></td>
                  <td>{t.points.toLocaleString()}</td>
                  <td className="subtle">{at[t.taskType] ?? "—"}</td>
                </tr>
              ))}
              {(!data.taskBreakdown || !data.taskBreakdown.length) && (
                <tr><td colSpan={4} className="subtle">No activity in this range yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="subtle dash-foot">
        Snapshot generated {new Date(data.generatedAt).toLocaleString()}. Time-series come from the
        points ledger; all-time totals are exact counts.
      </p>
    </div>
  );
}

function MiniStat({ label, v, allt, c }) {
  return (
    <div className="mini-stat">
      <span className="mini-dot" style={{ background: c }} />
      <div className="mini-body">
        <span className="mini-label">{label}</span>
        <span className="mini-val">{v || 0}<em> / {allt || 0} all-time</em></span>
      </div>
    </div>
  );
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
        <h3 className="task-title">Leaderboard (daily rank bonus)</h3>
        <p className="subtle">Every 24h the top players earn these bonus points by rank.</p>
        <div className="row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!draft.leaderboard?.enabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  leaderboard: { ...draft.leaderboard, enabled: e.target.checked },
                })
              }
            />
            <span>Enabled</span>
          </label>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))" }}>
          {[
            ["rank1", "#1"],
            ["rank2", "#2"],
            ["rank3", "#3"],
            ["top10", "Top 10"],
            ["top50", "Top 50"],
            ["top100", "Top 100"],
          ].map(([k, label]) => (
            <div className="field" key={k}>
              <label>{label}</label>
              <input
                className="num"
                type="number"
                value={draft.leaderboard?.rewards?.[k] ?? 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    leaderboard: {
                      ...draft.leaderboard,
                      rewards: { ...draft.leaderboard?.rewards, [k]: Number(e.target.value) },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card mt">
        <h3 className="task-title">Follow verification</h3>
        <p className="subtle">
          Auto-credit follows instantly (X handle is checked for existence). Turn off to review
          each follow manually in Moderation.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.autoApproveFollows !== false}
            onChange={(e) => setDraft({ ...draft, autoApproveFollows: e.target.checked })}
          />
          <span>Auto-approve follows</span>
        </label>
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
      setRows(res.data || []);
    } catch (e) {
      setRows([]); // never leave it spinning forever
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
        <p className="subtle">Nothing awaiting approval.</p>
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
              <th>Adjust points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <UserRow key={u.uid} u={u} onChanged={load} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One user row with an inline points adjuster (+/- to cut or add points).
function UserRow({ u, onChanged }) {
  const [delta, setDelta] = useState("");
  const [pts, setPts] = useState(u.points);
  const [busy, setBusy] = useState(false);
  async function apply(sign) {
    const n = Math.abs(parseInt(delta, 10) || 0) * sign;
    if (!n) return;
    setBusy(true);
    try {
      const res = await api.adjustPoints({ uid: u.uid, delta: n, reason: "admin adjust" });
      setPts(res.data.points);
      setDelta("");
      onChanged?.();
    } catch (e) {
      alert(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>{u.xHandle || "—"}</td>
      <td>{u.email || "—"}</td>
      <td className="mono">{u.walletAddress || "—"}</td>
      <td>
        <b>{pts}</b>
      </td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            className="task-input num"
            type="number"
            value={delta}
            placeholder="0"
            onChange={(e) => setDelta(e.target.value)}
          />
          <button className="btn btn-sm" disabled={busy || !delta} onClick={() => apply(1)}>
            +
          </button>
          <button className="btn btn-sm btn-danger" disabled={busy || !delta} onClick={() => apply(-1)}>
            −
          </button>
        </div>
      </td>
    </tr>
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
