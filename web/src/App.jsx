import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Activate from "./pages/Activate";
import Settings from "./pages/Settings";
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

export default function App() {
  const { user, isAdmin, isActive, loading, firebaseConfigured } = useAuth();

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
    if (!user) return <Login />;
    if (!isActive) return <Navigate to="/activate" replace />;
    return <Dashboard />;
  }

  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<MainRoutes />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/activate"
            element={!user ? <Login /> : isActive ? <Navigate to="/" replace /> : <Activate />}
          />
          <Route path="/settings" element={user ? <Settings /> : <Login />} />
          <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          <div className="row spread">
            <div>
              <a href={LINKS.main}>Pexli</a>
              <a href={LINKS.faucet}>Faucet</a>
              <a href={LINKS.dex}>Lifelox</a>
              <a href={LINKS.x}>X</a>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
            </div>
            <span className="subtle">Pexli Airdrop · points convert to mainnet PEX</span>
          </div>
        </div>
      </footer>
    </>
  );
}
