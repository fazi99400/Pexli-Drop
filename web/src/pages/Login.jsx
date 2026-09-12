import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signInGoogle, signInApple } = useAuth();
  const [err, setErr] = useState("");
  const referred = safeGet("pexli_ref");

  const run = (fn) => async () => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user") setErr(e?.message || "Sign-in failed.");
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
            🎁 You were invited with code <b>{referred}</b> — sign in to link it.
          </p>
        )}

        <button className="btn btn-primary" onClick={run(signInGoogle)}>
          Continue with Google
        </button>
        <button className="btn" onClick={run(signInApple)}>
          Continue with Apple
        </button>

        {err && <p className="msg err mt">{err}</p>}
        <p className="subtle mt">
          One wallet &amp; one X account per person. All points are verified server-side.
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
