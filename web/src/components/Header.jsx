import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" style={{ textDecoration: "none" }}>
          {/* Owner: drop pexli-logo.svg into /web/public and swap this mark for an <img>. */}
          <span className="brand-mark">P</span>
          <span>Pexli&nbsp;Drop</span>
        </Link>

        <div className="row">
          {user && (
            <span className="points-pill">
              <b>{profile?.points ?? 0}</b> pts
            </span>
          )}
          {isAdmin && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/admin")}>
              Admin
            </button>
          )}
          {user ? (
            <button className="btn btn-sm" onClick={logout}>
              Sign out
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
