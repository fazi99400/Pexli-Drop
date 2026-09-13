import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";

export default function Login() {
  const { signInGoogle, signInX } = useAuth();
  const [err, setErr] = useState("");
  const referred = safeGet("pexli_ref");

  const run = (fn) => async () => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      if (e?.code === "auth/popup-closed-by-user") return;
      if (e?.code === "auth/operation-not-allowed") {
        setErr("X sign-in isn't enabled yet — use Google, or enable Twitter in Firebase Auth.");
      } else {
        setErr(e?.message || "Sign-in failed.");
      }
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <img className="brand-logo" src="/LogoWhite.svg" alt="Pexli" />
        <p className="subtle" style={{ marginTop: 4 }}>
          Complete on-chain &amp; social quests to earn <b style={{ color: "var(--accent)" }}>PEX</b>{" "}
          airdrop points.
        </p>

        {referred && (
          <p className="msg ok" style={{ marginTop: 12 }}>
            You were invited with code <b>{referred}</b> — sign in to link it.
          </p>
        )}

        <button className="btn btn-primary" onClick={run(signInGoogle)}>
          Continue with Google
        </button>
        <button className="btn" onClick={run(signInX)}>
          <Icon name="x" size={16} /> Continue with X
        </button>

        {err && <p className="msg err mt">{err}</p>}
        <p className="subtle mt">
          One wallet &amp; one X account per person. After sign-in you’ll activate your account.
        </p>
        <p className="subtle" style={{ fontSize: 12 }}>
          By continuing you agree to our <Link to="/terms">Terms</Link> &amp;{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
