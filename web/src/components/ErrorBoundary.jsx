import { Component } from "react";

// Catches render-time errors anywhere in the tree and shows a message instead
// of a blank white screen (which is what an uncaught error produces).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Pexli] Uncaught UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center" style={{ padding: 24 }}>
          <div className="card login-card" style={{ maxWidth: 520, textAlign: "left" }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>Something went wrong</h2>
            <p className="subtle">The page hit an unexpected error. Try reloading.</p>
            <pre
              className="mono"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 14,
                overflowX: "auto",
                color: "var(--red)",
              }}
            >
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
