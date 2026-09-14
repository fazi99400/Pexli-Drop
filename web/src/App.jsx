import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Faq from "./pages/Faq";
import Guide from "./pages/Guide";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Activate from "./pages/Activate";
import Settings from "./pages/Settings";
import WalletPage from "./pages/Wallet";
import WalletSecurity from "./pages/WalletSecurity";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { LINKS } from "./lib/chain";

// Shown when the build has no Firebase env config — prevents the blank page and
// tells the operator exactly what to set.
function SetupScreen() {
  return (
    <div className="center" style={{ padding: 24 }}>
      <div className="card login-card" style={{ maxWidth: 520, textAlign: "left" }}>
        <img className="brand-logo" src="/LogoWhite.svg" alt="Pexli" style={{ height: 30, marginBottom: 14 }} />
        <h2 className="section-title" style={{ marginTop: 0 }}>Almost there — add your Firebase config</h2>
        <p className="subtle">
          The app loaded fine, but no Firebase web config was found, so sign-in is disabled. Open
          this file in the repo and fill in your 5 values, then commit — Cloudflare rebuilds
          automatically (no host variables needed):
        </p>
        <pre className="mono" style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, overflowX: "auto" }}>
{`web/src/firebase.config.js

apiKey: "…"
authDomain: "your-project.firebaseapp.com"
projectId: "…"
appId: "…"
messagingSenderId: "…"`}
        </pre>
        <p className="subtle">
          Values come from Firebase console → ⚙ Project settings → General → Your apps → Web app.
        </p>
      </div>
    </div>
  );
}

// Human-readable copy for the ?x=<code> the X OAuth callback bounces back with.
function xResultBanner(code, msg) {
  const map = {
    connected: { ok: true, text: "X account connected." },
    denied: { ok: false, text: "You cancelled the X authorization." },
    bad_request: { ok: false, text: "X sent back an incomplete response — try again." },
    expired: { ok: false, text: "That X sign-in link expired — tap Connect X again." },
    no_user: { ok: false, text: "Could not read your X profile. Try again." },
    x_taken: { ok: false, text: "That X account is already linked to another Pexli account." },
    failed: {
      ok: false,
      text: msg ? `X connect failed: ${msg}` : "X connect failed. Please try again.",
    },
  };
  return map[code] || null;
}

export default function App() {
  const { user, isAdmin, isActive, loading, firebaseConfigured, refreshProfile } = useAuth();

  // Global handler for the X OAuth return (?x=<code>&m=<detail>). Runs on any
  // route so the result is visible even when we redirect to /activate.
  const [xBanner, setXBanner] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("x");
    if (!code) return;
    const banner = xResultBanner(code, params.get("m"));
    if (banner) setXBanner(banner);
    if (code === "connected" && refreshProfile) refreshProfile();
    // Strip the query so a refresh doesn't re-trigger the banner.
    params.delete("x");
    params.delete("m");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  if (!firebaseConfigured) return <SetupScreen />;

  if (loading) {
    return (
      <div className="center">
        <div className="spin" />
      </div>
    );
  }

  // The main app area, gated by sign-in + activation. Terms/Privacy are always
  // public; Settings/Activate are reachable while signed in.
  function MainRoutes() {
    if (!user) return <Landing />;
    if (!isActive) return <Navigate to="/activate" replace />;
    return <Dashboard />;
  }

  return (
    <>
      <Header />
      {xBanner && (
        <div className="container" style={{ marginTop: 12 }}>
          <div className={`x-banner ${xBanner.ok ? "ok" : "err"}`}>
            <span>{xBanner.text}</span>
            <button className="x-banner-close" onClick={() => setXBanner(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}
      <main className="container">
        <Routes>
          <Route path="/" element={<MainRoutes />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/wallet-security" element={<WalletSecurity />} />
          <Route
            path="/activate"
            element={!user ? <Login /> : isActive ? <Navigate to="/" replace /> : <Activate />}
          />
          <Route path="/settings" element={user ? <Settings /> : <Login />} />
          <Route path="/wallet" element={user ? <WalletPage /> : <Login />} />
          <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          <div className="row spread">
            <div>
              <Link to="/guide">Guide</Link>
              <Link to="/faq">FAQ</Link>
              <a href={LINKS.main}>Pexli</a>
              <a href={LINKS.faucet}>Faucet</a>
              <a href={LINKS.dex}>Lifelox</a>
              <a href={LINKS.x}>X</a>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/wallet-security">Wallet Security</Link>
            </div>
            <span className="subtle">Pexli Airdrop · points convert to mainnet PEX</span>
          </div>
        </div>
      </footer>
    </>
  );
}
