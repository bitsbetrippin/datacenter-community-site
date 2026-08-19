import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import { COMMON_TIMEZONES } from "../lib/eventUtils";

/**
 * v1.0 first-run experience — role-gated by default:
 * a fresh signup lands in a WAITING ROOM until a household Owner/Admin
 * approves them from Settings → Members & roles. Starting a brand-new
 * household is still possible, tucked behind an expander for the true
 * first user.
 */
export function OnboardingPage() {
  const { user, signOut } = useAuth();
  const { refresh } = useHousehold();
  const guessTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(
    COMMON_TIMEZONES.includes(guessTz) ? guessTz : "America/Chicago",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  // Quietly re-check every 30s — the moment an admin approves, walk in.
  useEffect(() => {
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function checkNow() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  async function createHousehold(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("create_household", {
      p_name: name,
      p_timezone: timezone,
    });
    if (err) {
      setBusy(false);
      setError("Could not create the household. Please try again.");
      return;
    }
    await refresh();
    setBusy(false);
    navigate("/");
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden>⏳</span>
          <h1>Almost there!</h1>
        </div>
        <h2>Waiting for your role</h2>
        <p className="muted">
          Your account (<strong>{user?.email}</strong>) is created. A household
          Owner or Admin now needs to approve you and pick your role — ask them
          to open <em>Settings → Members &amp; roles</em>. This page checks
          automatically every 30 seconds.
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => void checkNow()} disabled={checking}>
            {checking ? "Checking…" : "Check again now"}
          </button>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>

        <details className="new-household-expander">
          <summary className="muted">Setting up a brand-new household instead?</summary>
          <p className="muted small">
            Only do this if you're the first person in your family here — it
            creates a separate calendar with you as the Owner.
          </p>
          <form onSubmit={createHousehold} className="stack">
            <label>
              Household name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Carter Family"
                required
              />
            </label>
            <label>
              Timezone
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {[...new Set([guessTz, ...COMMON_TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn" disabled={busy}>
              {busy ? "Creating…" : "Create new household"}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
