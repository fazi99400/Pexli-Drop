import { useState } from "react";
import { errMessage } from "../lib/functions";

// Generic quest card. Handles its own loading + success/error message. The
// parent passes an async `action` (button) or `onSubmit` (URL/text input);
// both resolve with an optional { message } or throw an Error.
export default function TaskCard({
  title,
  desc,
  points,
  icon = "✦",
  cat, // "chain" | "social" | "content" | "x"
  enabled = true,
  buttonLabel = "Verify",
  action,
  input,
  onSubmit,
  disabled = false,
  disabledNote,
  children,
  onDone,
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [value, setValue] = useState("");

  if (!enabled) return null;

  async function handle(fn) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ ok: true, text: res?.message || res?.data?.message || "Done! Points added." });
      if (input) setValue("");
      onDone?.();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card task-card" data-cat={cat}>
      <div className="task-head">
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div className="task-icon">{icon}</div>
          <div>
            <h3 className="task-title">{title}</h3>
            <p className="task-desc">{desc}</p>
          </div>
        </div>
        <span className="task-points">+{points}</span>
      </div>

      {children && <div className="task-body">{children}</div>}

      {input && (
        <input
          className="task-input"
          placeholder={input.placeholder}
          value={value}
          disabled={busy || disabled}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      <div className="task-actions">
        {onSubmit && (
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || disabled || !value.trim()}
            onClick={() => handle(() => onSubmit(value.trim()))}
          >
            {busy ? "Checking…" : buttonLabel}
          </button>
        )}
        {action && (
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || disabled}
            onClick={() => handle(action)}
          >
            {busy ? "Checking…" : buttonLabel}
          </button>
        )}
        {disabled && disabledNote && <span className="subtle">{disabledNote}</span>}
      </div>

      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </div>
  );
}
