import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import { LINKS } from "./lib/chain";

export default function App() {
  const { user, isAdmin, loading } = useAuth();

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
