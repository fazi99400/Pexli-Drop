import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

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
