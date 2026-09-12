import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signInGoogle, signInApple } = useAuth();
  const [err, setErr] = useState("");

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
        <div className="brand" style={{ justifyContent: "center", marginBottom: 8 }}>
          <span className="brand-mark">P</span>
          <span style={{ fontSize: 20 }}>Pexli Drop</span>
        </div>
        <p className="subtle" style={{ marginTop: 0 }}>
          Sign in to earn PEX airdrop points by completing on-chain and social quests.
        </p>

        <button className="btn btn-primary" onClick={run(signInGoogle)}>
          Continue with Google
        </button>
        <button className="btn" onClick={run(signInApple)}>
          Continue with Apple
        </button>

        {err && <p className="msg err mt">{err}</p>}
        <p className="subtle mt">
          One wallet & one X account per person. All points are verified server-side.
        </p>
      </div>
    </div>
  );
}
