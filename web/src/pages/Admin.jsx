import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import { StatCard, Bars, AreaLine, Donut } from "../components/StatCharts";

const TABS = ["Dashboard", "Tasks & Points", "Tweet Pool", "Moderation", "Ambassadors", "Users", "Admins"];

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
      {tab === "Ambassadors" && <AmbassadorsTab />}
      {tab === "Users" && <UsersTab />}
      {tab === "Admins" && <AdminsTab />}
    </>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  return <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>;
}

// --- Ambassador program -----------------------------------------------------
// Applications (with private contacts), missions CRUD and program settings.
// Ambassador posts / missions land in the normal Moderation tab
// (taskType "ambassador_post" / "ambassador_mission").
const AMB_TIERS = ["ambassador", "rising", "lead", "champion"];
const AMB_TIER_LABEL = { ambassador: "Ambassador", rising: "Rising", lead: "Lead", champion: "Champion" };

function AmbassadorsTab() {
  const [sub, setSub] = useState("Applications");
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {["Applications", "Missions", "Settings"].map((t) => (
          <button key={t} className={`btn btn-sm ${sub === t ? "btn-primary" : ""}`} onClick={() => setSub(t)}>
            {t}
          </button>
        ))}
      </div>
      {sub === "Applications" && <AmbApplications />}
      {sub === "Missions" && <AmbMissions />}
      {sub === "Settings" && <AmbSettings />}
    </div>
  );
}

function AmbApplications() {
  const [status, setStatus] = useState("pending");
  const [country, setCountry] = useState("");
  const [tier, setTier] = useState("");
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setData(null);
    setMsg(null);
    try {
      const res = await api.ambassador({ action: "adminList", status, country, tier });
      setData(res.data);
    } catch (e) {
      setData({ rows: [], countries: [] });
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  useEffect(() => {
    load();
  }, [status, tier]);

  async function act(payload, ok) {
    setMsg(null);
    try {
      const res = await api.ambassador(payload);
      const extra =
        res.data?.forfeited !== undefined ? ` Forfeited ${res.data.forfeited} pts, rejected ${res.data.rejectedPending} pending.` : "";
      setMsg({ ok: true, text: ok + extra });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  async function exportCsv() {
    setMsg(null);
    try {
      const res = await api.ambassador({ action: "adminExport" });
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pexli-ambassadors-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: `Exported ${res.data.count} applications (includes private contacts, keep it safe).` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  return (
    <div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {["pending", "approved", "rejected", "removed", "all"].map((s) => (
          <button key={s} className={`btn btn-sm ${status === s ? "btn-primary" : ""}`} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Country"
          list="amb-admin-countries"
          style={{ maxWidth: 180 }}
        />
        <datalist id="amb-admin-countries">
          {(data?.countries || []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">All tiers</option>
          {AMB_TIERS.map((t) => (
            <option key={t} value={t}>
              {AMB_TIER_LABEL[t]}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={load}>
          Apply filter
        </button>
        <button className="btn btn-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <Msg msg={msg} />
      {!data ? (
        <div className="spin" />
      ) : data.rows.length === 0 ? (
        <p className="subtle">No {status === "all" ? "" : status} applications.</p>
      ) : (
        <div className="grid mt">
          {data.rows.map((r) => (
            <AmbAdminCard key={r.uid} r={r} act={act} />
          ))}
        </div>
      )}
    </div>
  );
}

function AmbAdminCard({ r, act }) {
  const d = (ms) => (ms ? new Date(ms).toLocaleDateString() : "");
  const plat = Object.entries(r.platforms || {})
    .map(([k, v]) => `${k}: ${Number(v).toLocaleString()}`)
    .join(" · ");
  function strike() {
    const reason = window.prompt("Strike reason (shown to the ambassador):");
    if (reason) act({ action: "adminStrike", uid: r.uid, reason }, "Strike added.");
  }
  function remove(fraud) {
    const reason = window.prompt(fraud ? "Fraud details (internal + shown as removal reason):" : "Removal reason:");
    if (reason === null) return;
    if (fraud && !window.confirm("Remove for fraud and forfeit ALL ambassador points (posts, missions, tier bonuses, team shares)?")) return;
    act({ action: "adminRemove", uid: r.uid, reason, fraud }, fraud ? "Removed for fraud." : "Removed.");
  }
  function sponsor() {
    const v = window.prompt("Sponsor: code, @handle or uid of an approved ambassador (empty = none):", r.sponsorHandle ? `@${r.sponsorHandle}` : "");
    if (v !== null) act({ action: "adminSetSponsor", uid: r.uid, sponsor: v }, "Sponsor updated.");
  }
  return (
    <div className="card amb-admin-card">
      <div className="row spread">
        <a href={`https://x.com/${r.xHandle}`} target="_blank" rel="noreferrer">
          <b>@{r.xHandle}</b>
        </a>
        <span className="row" style={{ gap: 4 }}>
          <span className={`badge ${r.status === "approved" ? "on" : r.status === "pending" ? "pending" : "off"}`}>{r.status}</span>
          <span className="badge">{AMB_TIER_LABEL[r.tier]}{r.tierOverride ? " (override)" : ""}</span>
        </span>
      </div>
      <p className="subtle" style={{ margin: "6px 0" }}>
        {r.displayName || "—"} · {r.region} · {r.language} · {r.weeklyHours || "?"} h/week
        {r.age18 ? " · 18+" : ""}
        {r.cocAgreed ? " · CoC agreed" : ""}
      </p>
      <p style={{ margin: "4px 0", fontSize: 14 }}>
        <b>Contact:</b> {r.email || "—"} · {r.whatsapp || "—"} · {r.telegram || "—"}
        {r.consentAt ? <span className="subtle"> (consent {d(r.consentAt)})</span> : null}
      </p>
      {plat && <p style={{ margin: "4px 0", fontSize: 14 }}><b>Platforms:</b> {plat}</p>}
      {r.audience && <p style={{ margin: "4px 0" }}><b>Audience:</b> {r.audience}</p>}
      {r.community && <p style={{ margin: "4px 0" }}><b>Community:</b> {r.community}</p>}
      <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}><b>Plan:</b> {r.plan}</p>
      {(r.samples || []).length > 0 && (
        <div style={{ margin: "4px 0", fontSize: 13 }}>
          <b>Samples:</b>
          {r.samples.map((s) => (
            <div key={s} className="mono" style={{ overflowWrap: "anywhere" }}>
              <a href={s} target="_blank" rel="noreferrer">{s}</a>
            </div>
          ))}
        </div>
      )}
      {r.recommendations.length > 0 && (
        <p style={{ margin: "4px 0", fontSize: 14 }}>
          <b>Recommended by:</b>{" "}
          {r.recommendations.map((x) => `@${x.handle}${x.note ? ` ("${x.note}")` : ""}`).join(", ")}
        </p>
      )}
      <p className="subtle" style={{ fontSize: 12 }}>
        {r.verifiedMembers} verified / {r.invited} invited · {r.monthApproved} approved this month
        {r.inactive ? " · INACTIVE" : ""} · sponsor {r.sponsorHandle ? `@${r.sponsorHandle}` : "none"}
        {r.vanityCode ? ` · code ${r.vanityCode}` : ""}
        {r.regionalLead ? " · Regional Lead" : ""} · wallet {r.wallet?.slice(0, 8)}… · applied {d(r.appliedAt)}
        {r.note ? ` · note: ${r.note}` : ""}
        {r.removedReason ? ` · removed: ${r.removedReason}` : ""}
        {r.forfeited ? ` · forfeited ${r.forfeited} pts` : ""}
      </p>
      {r.strikes.length > 0 && (
        <div style={{ fontSize: 13, margin: "4px 0" }}>
          <b>Strikes ({r.strikes.length}/3):</b>
          {r.strikes.map((s, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <span>{s.reason} <span className="subtle">({d(s.at)})</span></span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => act({ action: "adminRemoveStrike", uid: r.uid, index: i }, "Strike removed.")}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="amb-admin-actions">
        {(r.status === "pending" || r.status === "rejected") && (
          <button className="btn btn-sm btn-primary" onClick={() => act({ action: "adminReview", uid: r.uid, decision: "approved" }, "Approved.")}>
            Approve
          </button>
        )}
        {r.status === "pending" && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              const note = window.prompt("Reason shown to the applicant (optional):");
              if (note !== null) act({ action: "adminReview", uid: r.uid, decision: "rejected", note }, "Rejected.");
            }}
          >
            Reject
          </button>
        )}
        {r.status === "approved" && (
          <>
            <select
              value={r.tierOverride || ""}
              onChange={(e) => act({ action: "adminSetTier", uid: r.uid, tier: e.target.value || null }, "Tier updated.")}
            >
              <option value="">Tier: automatic</option>
              {AMB_TIERS.map((t) => (
                <option key={t} value={t}>
                  Override: {AMB_TIER_LABEL[t]}
                </option>
              ))}
            </select>
            {(r.tier === "lead" || r.tier === "champion") && (
              <button
                className="btn btn-sm"
                onClick={() => act({ action: "adminSetRegionalLead", uid: r.uid, on: !r.regionalLead }, "Regional Lead updated.")}
              >
                {r.regionalLead ? "Unset Regional Lead" : "Make Regional Lead"}
              </button>
            )}
            {r.vanityCode && (
              <button className="btn btn-sm" onClick={() => act({ action: "adminRevokeVanity", uid: r.uid }, "Code revoked.")}>
                Revoke code {r.vanityCode}
              </button>
            )}
            <button className="btn btn-sm" onClick={sponsor}>
              Sponsor
            </button>
            <button className="btn btn-sm" onClick={strike}>
              Strike
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => remove(false)}>
              Remove
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => remove(true)}>
              Fraud
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const MISSION_TYPES = {
  x_post: "X post",
  x_thread: "X thread",
  short_video: "Short video",
  community_event: "Community event",
  translation: "Translation",
  bug_report: "Bug report",
  meme: "Meme",
};
const toInputDate = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromInputDate = (v) => (v ? new Date(v).getTime() : null);
const EMPTY_MISSION = { id: null, title: "", description: "", type: "x_post", points: 50, startAt: "", endAt: "", maxPerAmbassador: 1, active: true };

function AmbMissions() {
  const [list, setList] = useState(null);
  const [f, setF] = useState(EMPTY_MISSION);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const res = await api.ambassador({ action: "adminMissions" });
      setList(res.data.missions || []);
    } catch (e) {
      setList([]);
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.ambassador({
        action: "adminMissionSave",
        ...f,
        startAt: fromInputDate(f.startAt),
        endAt: fromInputDate(f.endAt),
      });
      setMsg({ ok: true, text: f.id ? "Mission updated." : "Mission created." });
      setF(EMPTY_MISSION);
      load();
    } catch (e2) {
      setMsg({ ok: false, text: errMessage(e2) });
    }
  }
  async function toggle(m) {
    try {
      await api.ambassador({ action: "adminMissionSave", ...m, active: !m.active });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  async function del(m) {
    if (!window.confirm(`Delete mission "${m.title}"?`)) return;
    try {
      await api.ambassador({ action: "adminMissionDelete", id: m.id });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <form className="panel" onSubmit={save}>
        <h3 className="task-title">{f.id ? "Edit mission" : "New mission"}</h3>
        <div className="field">
          <label>Title</label>
          <input value={f.title} onChange={set("title")} required />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={3} value={f.description} onChange={set("description")} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          <div className="field">
            <label>Type</label>
            <select value={f.type} onChange={set("type")}>
              {Object.entries(MISSION_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Points</label>
            <input type="number" min={0} value={f.points} onChange={set("points")} />
          </div>
          <div className="field">
            <label>Max per ambassador (0 = no limit)</label>
            <input type="number" min={0} value={f.maxPerAmbassador} onChange={set("maxPerAmbassador")} />
          </div>
          <div className="field">
            <label>Start</label>
            <input type="datetime-local" value={f.startAt} onChange={set("startAt")} />
          </div>
          <div className="field">
            <label>End</label>
            <input type="datetime-local" value={f.endAt} onChange={set("endAt")} />
          </div>
        </div>
        <label className="row" style={{ gap: 8, margin: "4px 0 12px" }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Active
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-primary">{f.id ? "Save mission" : "Create mission"}</button>
          {f.id && (
            <button type="button" className="btn btn-sm" onClick={() => setF(EMPTY_MISSION)}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <Msg msg={msg} />
      {!list ? (
        <div className="spin" />
      ) : list.length === 0 ? (
        <p className="subtle">No missions yet.</p>
      ) : (
        <div className="table-wrap mt">
          <table>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Type</th>
                <th>Points</th>
                <th>Window</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.title} {m.active ? <span className="badge on">active</span> : <span className="badge">off</span>}
                  </td>
                  <td>{m.typeLabel}</td>
                  <td>{m.points}{m.maxPerAmbassador ? ` · max ${m.maxPerAmbassador}` : ""}</td>
                  <td className="subtle" style={{ fontSize: 12 }}>
                    {m.startAt ? new Date(m.startAt).toLocaleDateString() : "now"} → {m.endAt ? new Date(m.endAt).toLocaleDateString() : "open"}
                  </td>
                  <td className="row" style={{ gap: 4 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => setF({ ...m, startAt: toInputDate(m.startAt), endAt: toInputDate(m.endAt) })}
                    >
                      Edit
                    </button>
                    <button className="btn btn-sm" onClick={() => toggle(m)}>
                      {m.active ? "Pause" : "Activate"}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(m)}>
                      Delete
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

function AmbSettings() {
  const { config } = useAuth();
  const a = config?.ambassador || {};
  const [cfg, setCfg] = useState({
    enabled: a.enabled ?? true,
    postPoints: a.postPoints ?? 25,
    weeklyPostCap: a.weeklyPostCap ?? 7,
    activityMin: a.activityMin ?? 4,
    boardMemberPoints: a.boardMemberPoints ?? 10,
    ambassadorReferralPercent: a.ambassadorReferralPercent ?? 15,
    teamSharePercent: a.teamSharePercent ?? 3,
    tiers: { rising: 500, lead: 5000, champion: 10000, ...(a.tiers || {}) },
    tierBonus: { rising: 2000, lead: 20000, champion: 50000, ...(a.tierBonus || {}) },
    tierMultiplier: { ambassador: 1, rising: 1.1, lead: 1.25, champion: 1.5, ...(a.tierMultiplier || {}) },
    sponsorMilestones: { m1: 100, m2: 500, m3: 1000, ...(a.sponsorMilestones || {}) },
    sponsorMilestoneBonus: { m1: 1000, m2: 3000, m3: 5000, ...(a.sponsorMilestoneBonus || {}) },
  });
  const [priv, setPriv] = useState({ groupLink: "", announcement: "" });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api
      .ambassador({ action: "adminSettings" })
      .then((r) => setPriv({ groupLink: r.data.groupLink || "", announcement: r.data.announcement?.text || "" }))
      .catch((e) => setMsg({ ok: false, text: errMessage(e) }));
  }, []);

  async function save() {
    setMsg(null);
    try {
      await api.updateConfig({ patch: { ambassador: cfg } });
      await api.ambassador({ action: "adminSaveSettings", ...priv });
      setMsg({ ok: true, text: "Ambassador settings saved." });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }
  async function refreshAll() {
    setMsg(null);
    try {
      const r = await api.ambassador({ action: "adminRefreshAll" });
      setMsg({ ok: true, text: `Refreshed ${r.data.refreshed} of ${r.data.ambassadors} ambassadors.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    }
  }

  const num = (k, step = 1) => ({
    type: "number",
    min: 0,
    step,
    value: cfg[k],
    onChange: (e) => setCfg({ ...cfg, [k]: Number(e.target.value) }),
  });
  const nested = (g, k, step = 1) => ({
    type: "number",
    min: 0,
    step,
    value: cfg[g][k],
    onChange: (e) => setCfg({ ...cfg, [g]: { ...cfg[g], [k]: Number(e.target.value) } }),
  });
  const grid = { gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 };

  return (
    <div>
      <div className="panel">
        <h3 className="task-title">Private (ambassadors only)</h3>
        <div className="field">
          <label>Private ambassador Telegram group link</label>
          <input value={priv.groupLink} onChange={(e) => setPriv({ ...priv, groupLink: e.target.value })} placeholder="https://t.me/+..." />
        </div>
        <div className="field">
          <label>Announcement banner (empty = none)</label>
          <textarea rows={3} value={priv.announcement} onChange={(e) => setPriv({ ...priv, announcement: e.target.value })} />
        </div>
      </div>

      <div className="panel mt">
        <h3 className="task-title">Program</h3>
        <label className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
          Applications and submissions open
        </label>
        <div className="grid" style={grid}>
          <div className="field"><label>Points per daily post</label><input {...num("postPoints")} /></div>
          <div className="field"><label>Posts per week</label><input {...num("weeklyPostCap")} /></div>
          <div className="field"><label>Activity: approved / month</label><input {...num("activityMin")} /></div>
          <div className="field"><label>Board: points per member</label><input {...num("boardMemberPoints")} /></div>
          <div className="field"><label>Ambassador referral %</label><input {...num("ambassadorReferralPercent")} /></div>
          <div className="field"><label>Team share %</label><input {...num("teamSharePercent", 0.5)} /></div>
        </div>
        <h4 className="amb-h4">Tiers (verified members → bonus, multiplier)</h4>
        <div className="grid" style={grid}>
          {["rising", "lead", "champion"].map((t) => (
            <div className="field" key={t}><label>{AMB_TIER_LABEL[t]}: members</label><input {...nested("tiers", t)} /></div>
          ))}
          {["rising", "lead", "champion"].map((t) => (
            <div className="field" key={`b${t}`}><label>{AMB_TIER_LABEL[t]}: bonus pts</label><input {...nested("tierBonus", t)} /></div>
          ))}
          {AMB_TIERS.map((t) => (
            <div className="field" key={`m${t}`}><label>{AMB_TIER_LABEL[t]}: multiplier</label><input {...nested("tierMultiplier", t, 0.05)} /></div>
          ))}
        </div>
        <h4 className="amb-h4">Sponsor milestones (recruited ambassador reaches N members)</h4>
        <div className="grid" style={grid}>
          {["m1", "m2", "m3"].map((m, i) => (
            <div className="field" key={m}><label>Milestone {i + 1}: members</label><input {...nested("sponsorMilestones", m)} /></div>
          ))}
          {["m1", "m2", "m3"].map((m, i) => (
            <div className="field" key={`b${m}`}><label>Milestone {i + 1}: bonus pts</label><input {...nested("sponsorMilestoneBonus", m)} /></div>
          ))}
        </div>
        <div className="row mt" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={save}>
            Save settings
          </button>
          <button className="btn btn-sm" onClick={refreshAll}>
            Refresh all ambassador stats now
          </button>
        </div>
        <p className="subtle" style={{ fontSize: 12 }}>
          Stats, tier bonuses, sponsor milestones and the monthly activity rule also refresh automatically
          every day at 00:00 UTC.
        </p>
      </div>
      <Msg msg={msg} />
    </div>
  );
}

// --- Analytics dashboard ----------------------------------------------------
const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

// Chart colours — a single blue family (+ green for positive series), so the
// dashboard reads as one flat, Coinbase-style palette in both themes.
const C = {
  blue: "var(--accent)",
  indigo: "#6b8cff",
  sky: "#38bdf8",
  green: "var(--green)",
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
        <StatCard label="Total users" value={u.total} sub={`${u.activated} activated · ${activePct}%`} accent={C.blue} />
        <StatCard label="Active today" value={activeToday} sub="earned points today" accent={C.sky} />
        <StatCard label="Total points minted" value={u.totalPoints} sub={`${u.referralPoints || 0} from referrals`} accent={C.green} />
        <StatCard label="Total swaps" value={at.swap || 0} sub={`${tm.swap || 0} this month`} accent={C.blue} />
        <StatCard label="Total transactions" value={totalTx} sub={`swaps + sends + faucet`} accent={C.indigo} />
        <StatCard label="Faucet claims" value={at.faucet || 0} sub={`${tm.faucet || 0} this month`} accent={C.sky} />
      </div>

      {/* Time-series */}
      <div className="dash-grid">
        <Panel title="Daily active users" sub={`last ${days} days`}>
          <AreaLine data={data.daily} field="activeUsers" color={C.sky} />
        </Panel>
        <Panel title="Points minted / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.points }))} color={C.green} />
        </Panel>
        <Panel title="Swaps / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.swaps }))} color={C.blue} />
        </Panel>
        <Panel title="Transactions (send PEX) / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.txs }))} color={C.indigo} />
        </Panel>
        <Panel title="New sign-ups / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.signups }))} color={C.sky} />
        </Panel>
        <Panel title="Faucet claims / day" sub={`last ${days} days`}>
          <Bars data={data.daily.map((d) => ({ ...d, value: d.faucets }))} color={C.green} />
        </Panel>
      </div>

      {/* Monthly social / content */}
      <Panel title="Social & content — monthly" sub="X follows · Instagram · Medium articles (last 6 months)" span>
        <div className="month-cards">
          <StatCard label="X follows · this month" value={tm.follow_x || 0} sub={`${at.follow_x || 0} all-time`} accent={C.blue} />
          <StatCard label="Instagram · this month" value={tm.follow_ig || 0} sub={`${at.follow_ig || 0} all-time`} accent={C.indigo} />
          <StatCard label="Medium articles · this month" value={tm.medium || 0} sub={`${at.medium || 0} all-time`} accent={C.green} />
        </div>
        <Bars
          data={data.monthly}
          kind="month"
          height={170}
          series={[
            { key: "follow_x", label: "X follows", color: C.blue },
            { key: "follow_ig", label: "Instagram", color: C.indigo },
            { key: "medium", label: "Medium", color: C.green },
          ]}
        />
      </Panel>

      {/* Content breakdown + providers */}
      <div className="dash-grid two">
        <Panel title="Content submissions — this month" sub="approved / credited posts">
          <div className="mini-stats">
            <MiniStat label="Medium" v={tm.medium} allt={at.medium} c={C.green} />
            <MiniStat label="YouTube" v={tm.youtube} allt={at.youtube} c={C.indigo} />
            <MiniStat label="TikTok" v={tm.tiktok} allt={at.tiktok} c={C.sky} />
            <MiniStat label="Instagram post" v={tm.instagram} allt={at.instagram} c={C.blue} />
            <MiniStat label="Review" v={tm.review} allt={at.review} c={C.indigo} />
            <MiniStat label="Tweets" v={tm.tweet} allt={at.tweet} c={C.blue} />
          </div>
        </Panel>
        <Panel title="Sign-in providers" sub="how activated users log in">
          <Donut
            parts={[
              { label: "Google", value: u.google || 0, color: C.sky },
              { label: "X (Twitter)", value: u.twitter || 0, color: C.blue },
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

// Trigger the daily rank-bonus distribution on demand (idempotent per day).
function RunLeaderboardButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.runLeaderboardRewards();
      const d = res.data || {};
      setMsg({ ok: true, text: `Done — ranked ${d.ranked ?? 0}, awarded ${d.awarded ?? 0}.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="row" style={{ gap: 10 }}>
      {msg && <span className={`msg ${msg.ok ? "ok" : "err"}`} style={{ margin: 0 }}>{msg.text}</span>}
      <button className="btn btn-sm btn-primary" onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run now"}
      </button>
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
        <p className="subtle">
          Runs automatically every day at 00:00 UTC — the top players earn these bonus points by
          rank. Use “Run now” to distribute immediately (safe to click; it never pays twice per day).
        </p>
        <div className="row spread">
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
          <RunLeaderboardButton />
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
          Every follow submission (X and Instagram) always queues in <b>Moderation</b> for a human
          to check before points are credited — there's no free way to read either platform's real
          follower list, so nothing is auto-approved.
        </p>
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
  const [reBusy, setReBusy] = useState(false);
  const [reMsg, setReMsg] = useState(null);

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

  async function reseed() {
    setReBusy(true);
    setReMsg(null);
    try {
      const res = await api.reseedDefaultTweets();
      setReMsg({ ok: true, text: `Pool now has the ${res.data.count} built-in starter tweets.` });
    } catch (e) {
      setReMsg({ ok: false, text: errMessage(e) });
    } finally {
      setReBusy(false);
    }
  }

  const count = text.split("\n").filter((l) => l.trim()).length;
  return (
    <div>
      <div className="card mb">
        <h3 className="task-title">Starter tweets</h3>
        <p className="subtle">
          40 built-in tweets ship with the app and auto-seed the pool the first time anyone
          requests a tweet. Use this if the built-in set was just expanded and you want the live
          pool refreshed to match right away.
        </p>
        <div className="row">
          <button className="btn btn-sm" onClick={reseed} disabled={reBusy}>
            {reBusy ? "Reseeding…" : "Reseed starter tweets"}
          </button>
          <Msg msg={reMsg} />
        </div>
      </div>
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
              {rows.map((r) => {
                // Follow submissions carry the actual evidence to review
                // (tweetUrl / handle) — prefer that over the bare refId,
                // which for a follow is just "follow_x:<uid>".
                const link = r.tweetUrl || (/^https?:/.test(r.refId) ? r.refId : null);
                return (
                <tr key={r.id}>
                  <td>
                    {r.taskType}
                    {r.missionTitle ? <div className="subtle" style={{ fontSize: 12 }}>{r.missionTitle}</div> : null}
                  </td>
                  <td className="mono">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer">
                        {link}
                      </a>
                    ) : r.handle ? (
                      `@${r.handle}`
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Bot accounts (leaderboard filler) ---
function BotAccountsCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function seed() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.seedBotUsers();
      setMsg({ ok: true, text: `Created ${res.data.created} bot accounts with random names, points and wallets.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Remove all bot accounts from the leaderboard?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.removeBotUsers();
      setMsg({ ok: true, text: `Removed ${res.data.removed} bot accounts.` });
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb">
      <h3 className="task-title">Bot accounts (leaderboard filler)</h3>
      <p className="subtle">
        Seeds 100 Firestore-only accounts with random human-looking names, random points, and a
        freshly generated (never funded, never reused) wallet address each — so the leaderboard
        looks populated. They can never sign in, can never claim the faucet, and are excluded from
        the admin dashboard, the Users list, the CSV export, and daily rank-bonus rewards. Running
        “Seed” again resets all 100 to fresh random values.
      </p>
      <div className="row">
        <button className="btn btn-sm btn-primary" onClick={seed} disabled={busy}>
          {busy ? "Working…" : "Seed 100 bot accounts"}
        </button>
        <button className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
          Remove all bots
        </button>
      </div>
      <Msg msg={msg} />
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
      <BotAccountsCard />
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
              <th>Status</th>
              <th>Adjust points</th>
              <th>Moderate</th>
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
  const [showBlock, setShowBlock] = useState(false);
  const [hours, setHours] = useState(24);
  const [permanent, setPermanent] = useState(false);
  const [reason, setReason] = useState("");

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

  async function doBlock() {
    setBusy(true);
    try {
      await api.blockUser({ uid: u.uid, permanent, durationHours: Number(hours) || 24, reason });
      setShowBlock(false);
      onChanged?.();
    } catch (e) {
      alert(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function doUnblock() {
    setBusy(true);
    try {
      await api.unblockUser({ uid: u.uid });
      onChanged?.();
    } catch (e) {
      alert(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggleForceActivate() {
    setBusy(true);
    try {
      await api.setForceActivated({ uid: u.uid, value: !u.forceActivated });
      onChanged?.();
    } catch (e) {
      alert(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const isBlockedNow = u.blocked && (!u.blockedUntil || u.blockedUntil > Date.now());

  return (
    <>
      <tr>
        <td>{u.xHandle || "—"}</td>
        <td>{u.email || "—"}</td>
        <td className="mono">{u.walletAddress || "—"}</td>
        <td>
          <b>{pts}</b>
        </td>
        <td>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {isBlockedNow && (
              <span className="badge off" title={u.blockReason || ""}>
                Blocked{u.blockedUntil ? ` till ${new Date(u.blockedUntil).toLocaleDateString()}` : " (permanent)"}
              </span>
            )}
            {/* Same rule as the app (AuthContext.isActive): a saved wallet +
                ANY one login (Google OR X) = active. Both are not required. */}
            {u.walletAddress && (u.googleLinked || u.xHandleSet || u.forceActivated) ? (
              <span className="badge on">Active</span>
            ) : (
              <span className="badge pending">Needs wallet</span>
            )}
            {u.forceActivated && <span className="badge on">Force-active</span>}
            {u.googleLinked && <span className="badge">Google</span>}
            {u.xHandleSet && <span className="badge">X</span>}
          </div>
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
        <td>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {isBlockedNow ? (
              <button className="btn btn-sm" disabled={busy} onClick={doUnblock}>
                Unblock
              </button>
            ) : (
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setShowBlock((s) => !s)}>
                Block
              </button>
            )}
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={toggleForceActivate}>
              {u.forceActivated ? "Unforce" : "Force activate"}
            </button>
          </div>
        </td>
      </tr>
      {showBlock && (
        <tr>
          <td colSpan={7}>
            <div
              className="row"
              style={{ gap: 10, flexWrap: "wrap", background: "var(--bg)", padding: 10, borderRadius: 10 }}
            >
              <label className="toggle">
                <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
                <span>Permanent</span>
              </label>
              {!permanent && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Hours</label>
                  <input
                    className="num"
                    type="number"
                    min="1"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
              )}
              <input
                className="task-input"
                style={{ maxWidth: 240 }}
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={doBlock}>
                Confirm block
              </button>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setShowBlock(false)}>
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
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
