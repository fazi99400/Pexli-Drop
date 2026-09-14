import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

// Light / dark theme toggle. The saved theme is applied pre-paint by the inline
// script in index.html; here we just flip it and persist.
function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    } catch (e) {
      return "dark";
    }
  });
  useEffect(() => {
    try {
      if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
      else document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("pexli_theme", theme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", theme === "light" ? "#fbf6f0" : "#0b0906");
    } catch (e) {
      /* storage blocked — ignore */
    }
  }, [theme]);
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
      aria-label="Toggle theme"
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
    </button>
  );
}

export default function Header() {
  const { user, profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <img src="/LogoWhite.svg" alt="Pexli" />
          <span className="sub">Drop</span>
        </Link>

        <div className="row">
          <ThemeToggle />
          {!user && (
            <>
              <Link className="btn btn-sm btn-ghost hide-sm" to="/guide">Guide</Link>
              <Link className="btn btn-sm btn-ghost hide-sm" to="/faq">FAQ</Link>
            </>
          )}
          {user && (
            <span className="points-pill">
              <span className="dot" />
              <b>{(profile?.points ?? 0).toLocaleString()}</b> pts
            </span>
          )}
          {isAdmin && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/admin")} title="Admin">
              <Icon name="shield" size={16} /> <span className="hide-sm">Admin</span>
            </button>
          )}
          {user && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/wallet")} title="Wallet">
              <Icon name="wallet" size={16} /> <span className="hide-sm">Wallet</span>
            </button>
          )}
          {user && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/settings")} title="Settings">
              <Icon name="gear" size={16} /> <span className="hide-sm">Settings</span>
            </button>
          )}
          {user ? (
            <button className="btn btn-sm" onClick={logout} title="Sign out">
              <Icon name="logout" size={16} /> <span className="hide-sm">Sign out</span>
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => navigate("/")}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
