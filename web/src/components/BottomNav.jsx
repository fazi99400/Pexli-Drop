import { NavLink } from "react-router-dom";
import Icon from "./Icon";

// Mobile bottom tab bar — the native-app-style navigation. Rendered only for
// signed-in users and shown only on mobile (CSS hides it on desktop, where the
// top header nav stays). Uses NavLink so the active tab is highlighted.
const TABS = [
  { to: "/", icon: "home", label: "Home", end: true },
  { to: "/leaderboard", icon: "trophy", label: "Ranks" },
  { to: "/wallet", icon: "wallet", label: "Wallet" },
  { to: "/referrals", icon: "users", label: "Invite" },
  { to: "/settings", icon: "gear", label: "Settings" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `bn-item ${isActive ? "active" : ""}`}
        >
          <span className="bn-ic">
            <Icon name={t.icon} size={22} />
          </span>
          <span className="bn-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
