import { Link } from "react-router-dom";
import Icon from "../components/Icon";

// 404 — friendly, on-brand, links back to the useful places.
export default function NotFound() {
  return (
    <div className="notfound">
      <img className="nf-logo" src="/LogoWhite.svg" alt="Pexli" />
      <div className="nf-code">404</div>
      <h1 className="nf-title">This page drifted off-chain</h1>
      <p className="nf-sub">
        The page you're looking for doesn't exist or was moved. Let's get you back to earning PEX.
      </p>
      <div className="nf-actions">
        <Link className="btn btn-primary" to="/">
          <Icon name="spark" size={16} /> Back to home
        </Link>
        <Link className="btn btn-ghost" to="/guide">
          Read the guide
        </Link>
        <Link className="btn btn-ghost" to="/faq">
          FAQ
        </Link>
      </div>
    </div>
  );
}
