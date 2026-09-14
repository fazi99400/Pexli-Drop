// Lightweight, dependency-free charts for the admin dashboard.
//
// Everything here is plain SVG / CSS so it adds ~nothing to the bundle and
// inherits the app's theme tokens (var(--accent) etc.) in both light and dark.
// Three primitives cover the whole dashboard: StatCard, Bars (categorical /
// time bars, single or grouped) and AreaLine (a smooth trend line).

const fmt = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 1 : 0) + "k";
  return String(v);
};

// A single headline metric tile.
export function StatCard({ label, value, sub, accent = "var(--accent)", icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className="stat-ic" style={{ background: accent }}>
            {icon}
          </span>
        )}
      </div>
      <div className="stat-value" style={{ color: accent }}>
        {typeof value === "number" ? fmt(value) : value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      <span className="stat-bar" style={{ background: accent }} />
    </div>
  );
}

// Short weekday/day label for a YYYY-MM-DD date.
function shortDay(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
function shortMonth(iso) {
  const d = new Date(iso + "-01T00:00:00Z");
  return d.toLocaleString("en", { month: "short", timeZone: "UTC" });
}

// Categorical / time bar chart. `data` = [{label, value}] or grouped via
// `series` = [{key,label,color}] over `data` rows that carry those keys.
export function Bars({ data, series, height = 150, color = "var(--accent)", kind = "day", empty }) {
  if (!data || !data.length) return <div className="chart-empty">{empty || "No data yet."}</div>;
  const keys = series ? series.map((s) => s.key) : ["value"];
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k]) || 0)));
  const labelOf = (d) =>
    kind === "month" ? shortMonth(d.month || d.label) : kind === "day" ? shortDay(d.date || d.label) : d.label;
  // Thin out day labels so they don't collide on wide ranges.
  const step = data.length > 31 ? Math.ceil(data.length / 12) : data.length > 14 ? 2 : 1;

  return (
    <div className="bars-wrap">
      <div className="bars" style={{ height }}>
        {data.map((d, i) => (
          <div className="bar-col" key={i}>
            <div className="bar-stack">
              {(series || [{ key: "value", color }]).map((s) => {
                const val = Number(d[s.key]) || 0;
                return (
                  <div
                    key={s.key}
                    className="bar"
                    title={`${labelOf(d)} · ${s.label ? s.label + ": " : ""}${fmt(val)}`}
                    style={{ height: `${(val / max) * 100}%`, background: s.color || color }}
                  />
                );
              })}
            </div>
            <span className="bar-x">{i % step === 0 ? labelOf(d) : ""}</span>
          </div>
        ))}
      </div>
      {series && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key} className="leg">
              <i style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Smooth area + line trend for a daily series.
export function AreaLine({ data, field = "value", color = "var(--accent)", height = 150, kind = "day" }) {
  if (!data || !data.length) return <div className="chart-empty">No data yet.</div>;
  const W = 600;
  const H = height;
  const pad = 6;
  const vals = data.map((d) => Number(d[field]) || 0);
  const max = Math.max(1, ...vals);
  const n = data.length;
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1));
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const gid = "g" + field;
  const peak = vals.indexOf(Math.max(...vals));
  return (
    <div className="area-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="area-svg" style={{ height }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <circle cx={x(peak)} cy={y(vals[peak])} r="3.5" fill={color} />
      </svg>
      <div className="area-x">
        <span>{kind === "month" ? shortMonth(data[0].month) : shortDay(data[0].date)}</span>
        <span>
          {kind === "month" ? shortMonth(data[n - 1].month) : shortDay(data[n - 1].date)}
        </span>
      </div>
    </div>
  );
}

// A pure-CSS donut for a two-way split (e.g. sign-in providers).
export function Donut({ parts, size = 116 }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0) || 1;
  let acc = 0;
  const stops = parts
    .map((p) => {
      const start = (acc / total) * 360;
      acc += p.value || 0;
      const end = (acc / total) * 360;
      return `${p.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      >
        <div className="donut-hole">
          <b>{fmt(total)}</b>
          <span>total</span>
        </div>
      </div>
      <div className="donut-legend">
        {parts.map((p) => (
          <span key={p.label} className="leg">
            <i style={{ background: p.color }} /> {p.label} · <b>{fmt(p.value || 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export { fmt };
