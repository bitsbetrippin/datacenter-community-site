import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHousehold, isAdmin, canCreateEvents } from "../context/HouseholdContext";
import { NotificationsBell } from "./NotificationsBell";
import { SearchBox } from "./SearchBox";

/**
 * Application shell per §5.1: top bar, left navigation, primary canvas.
 * The calendar (or the active page) receives the majority of the space.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { household, role, schemaBehind } = useHousehold();
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  // (Theme + density are applied app-wide by <ThemeLoader /> in App.tsx,
  //  so the wall display and export views get them too.)

  useEffect(() => {
    // Connection health indicator (top bar, §5.1) — pings the Worker API.
    let cancelled = false;
    fetch("/api/health")
      .then((r) => !cancelled && setHealthy(r.ok))
      .catch(() => !cancelled && setHealthy(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email ||
    "Account";

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand" aria-hidden>📅</span>
          <span className="household-name">{household?.name ?? "Family Calendar"}</span>
        </div>
        <SearchBox />
        <div className="topbar-right">
          <NotificationsBell />
          <span
            className={`health-dot ${healthy === null ? "unknown" : healthy ? "ok" : "bad"}`}
            title={
              healthy === null
                ? "Checking connection…"
                : healthy
                  ? "Connected"
                  : "Connection issue"
            }
            aria-label="connection health"
          />
          <div className="user-menu">
            <button
              className="btn btn-ghost"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
            >
              {displayName} ▾
            </button>
            {menuOpen && (
              <div className="menu-pop" onMouseLeave={() => setMenuOpen(false)}>
                <button className="menu-item" onClick={() => navigate("/wall")}>
                  🖥 Wall display
                </button>
                <button className="menu-item" onClick={() => navigate("/export")}>
                  🖨 Export PDF / PPT
                </button>
                <button className="menu-item" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {schemaBehind && (
        <div className="schema-banner" role="alert">
          ⚠️ <strong>Database update pending.</strong>{" "}
          {isAdmin(role)
            ? "The app is newer than the database, so some features are limited. Fix: Supabase dashboard → SQL Editor → run apply_all_missing.sql from the latest release zip, then reload this page."
            : "Some features are limited until the household Owner finishes an update."}
        </div>
      )}

      <div className="body">
        <nav className="sidenav" aria-label="Main">
          <NavLink to="/" end className="nav-item">
            <span aria-hidden>🗓️</span> Calendar
          </NavLink>
          {canCreateEvents(role) && (
            <NavLink to="/import" className="nav-item">
              <span aria-hidden>📥</span> Import
            </NavLink>
          )}
          <NavLink to="/settings" className="nav-item">
            <span aria-hidden>⚙️</span> Settings
          </NavLink>
          {isAdmin(role) && (
            <NavLink to="/settings/integrations" className="nav-item">
              <span aria-hidden>🔗</span> Integrations
            </NavLink>
          )}
          {isAdmin(role) && (
            <NavLink to="/settings/categories" className="nav-item">
              <span aria-hidden>🎨</span> Categories
            </NavLink>
          )}
          {isAdmin(role) && (
            <NavLink to="/settings/audit" className="nav-item">
              <span aria-hidden>🧾</span> Audit
            </NavLink>
          )}
          <div className="nav-footer muted">v1.1</div>
        </nav>
        <main id="main-content" className="canvas">{children}</main>
      </div>
    </div>
  );
}
