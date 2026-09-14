import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, errMessage } from "../lib/functions";
import Icon from "../components/Icon";

// Dedicated "My referrals" page: who joined via your link, and how many points
// you've earned from each — with their name and wallet. Mirrors the dashboard
// card but as a full, standalone page.
export default function Referrals() {
  const { profile, config } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const percent = config?.referral?.percent ?? 0;

  const code = profile?.referralCode || "…";
  const link = `${window.location.origin}/?ref=${code}`;

  async function load() {
    setErr("");
    try {
      setData((await api.getMyReferrals()).data);
    } catch (e) {
      setErr(errMessage(e));
      setData({ count: 0, totalEarned: 0, rows: [] });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1400);
    } catch (e) {
      /* clipboard blocked */
    }
  }

  const shortWallet = (w) => (w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "—");

  return (
    <div className="referrals-page">
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="users" size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />
          My referrals
        </h2>
        <Link className="btn btn-sm btn-ghost" to="/">
          ← Dashboard
        </Link>
      </div>

      {/* Share + totals */}
      <div className="referral">
        <div className="referral-inner">
          <div className="ref-top">
            <div>
              <h3 className="card-title">
                <Icon name="gift" /> Your referral link
              </h3>
              <p className="task-desc" style={{ maxWidth: 460 }}>
                Share it anywhere. You earn <b className="accent">{percent}%</b> of every point your
                invitees make — automatically, forever.
              </p>
            </div>
            <div className="ref-stats">
              <div className="stat">
                <div className="n accent">{data?.count ?? profile?.referralCount ?? 0}</div>
                <div className="l">Invited</div>
              </div>
              <div className="stat">
                <div className="n">{(data?.totalEarned ?? 0).toLocaleString()}</div>
                <div className="l">Points earned</div>
              </div>
            </div>
          </div>
          <div className="ref-code-box mt">
            <input className="ref-link" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn btn-sm" onClick={() => copy(link, "link")}>
              <Icon name={copied === "link" ? "check" : "copy"} size={15} />
              {copied === "link" ? "Copied" : "Link"}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => copy(code, "code")}>
              {copied === "code" ? "Copied" : code}
            </button>
          </div>
        </div>
      </div>

      {/* Who joined */}
      <div className="section-head mt">
        <h3 className="section-title" style={{ fontSize: 18 }}>
          People who joined via your link
        </h3>
      </div>
      {err && <p className="msg err">{err}</p>}

      {data === null ? (
        <div className="center" style={{ minHeight: 120 }}>
          <div className="spin" />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="panel">
          <p className="subtle" style={{ margin: 0 }}>
            No one has joined with your link yet. Share it above — you'll see every invitee here,
            with the points you've earned from each.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Wallet</th>
                <th style={{ textAlign: "right" }}>Their points</th>
                <th style={{ textAlign: "right" }}>You earned</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.uid}>
                  <td className="subtle">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="mono" title={r.wallet || ""}>
                    {shortWallet(r.wallet)}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.theirPoints.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                    +{r.earnedFromThem.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="subtle" style={{ fontSize: 12, marginTop: 10 }}>
        Wallet shown so you can recognise your invitees. Points update as your invitees keep
        earning.
      </p>
    </div>
  );
}
