import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
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
          The app loaded fine, but no Firebase web config was found, so sign-in is disabled. Set
          these environment variables on your host (Cloudflare Pages → Settings → Environment
          variables), then redeploy:
        </p>
        <pre className="mono" style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, overflowX: "auto" }}>
{`VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=…
VITE_FIREBASE_PROJECT_ID=…
VITE_FIREBASE_APP_ID=…
VITE_FIREBASE_MESSAGING_SENDER_ID=…`}
        </pre>
        <p className="subtle">
          Values come from Firebase console → Project settings → Your apps. For local dev, copy
          <span className="mono"> web/.env.example </span> to <span className="mono">web/.env</span>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, isAdmin, loading, firebaseConfigured } = useAuth();

  if (!firebaseConfigured) return <SetupScreen />;

  if (loading) {
    return (
      <div className="center">
        <div className="spin" />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Login />} />
          <Route
            path="/admin"
            element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          <div className="row spread">
            <div>
              <a href={LINKS.main}>Pexli</a>
              <a href={LINKS.faucet}>Faucet</a>
              <a href={LINKS.dex}>Lifelox DEX</a>
              <a href={LINKS.x}>X</a>
              <a href={LINKS.instagram}>Instagram</a>
              <a href={LINKS.chainlist}>Add chain</a>
            </div>
            <span className="subtle">Pexli Airdrop · points convert to mainnet PEX</span>
          </div>
        </div>
      </footer>
    </>
  );
}
