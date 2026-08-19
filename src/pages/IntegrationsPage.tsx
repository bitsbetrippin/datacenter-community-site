import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { useHousehold, isAdmin } from "../context/HouseholdContext";
import type { ConflictRow, ServiceConnection } from "../lib/types";

const PROVIDER_LABELS: Record<string, { name: string; emoji: string; slug: string }> = {
  GOOGLE_CALENDAR: { name: "Google Calendar", emoji: "🟦", slug: "google" },
  MS_GRAPH_CALENDAR: { name: "Microsoft / Outlook", emoji: "🟪", slug: "microsoft" },
  ICS_FEED: { name: "Calendar feed (.ics)", emoji: "📡", slug: "" },
  CALDAV_GENERIC: { name: "CalDAV", emoji: "🗄️", slug: "" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "ok" },
  attention: { label: "Attention required", cls: "warn" },
  paused: { label: "Paused", cls: "warn" },
  failed: { label: "Failed", cls: "bad" },
  disconnected: { label: "Disconnected", cls: "off" },
};

interface SetupStatus {
  google: { configured: boolean; redirectUri: string; secretNames: string[] };
  microsoft: { configured: boolean; redirectUri: string; secretNames: string[] };
  webhookUrl: string;
  serviceRoleConfigured: boolean;
}

interface RemoteCal {
  id: string;
  name: string;
  color: string | null;
  readOnly: boolean;
  primary: boolean;
  selected: boolean;
  direction: string;
}

export function IntegrationsPage() {
  const { household, role, refresh } = useHousehold();
  const [params, setParams] = useSearchParams();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [connections, setConnections] = useState<ServiceConnection[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [picker, setPicker] = useState<{ connection: ServiceConnection; cals: RemoteCal[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workerConfig, setWorkerConfig] = useState<Record<string, boolean> | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    const [{ data: conns }, { data: confl }, setupRes] = await Promise.all([
      supabase
        .from("service_connections")
        .select("id, household_id, provider_code, account_email, status, status_detail, last_success_at, last_error, created_at")
        .eq("household_id", household.id)
        .neq("status", "disconnected")
        .order("created_at"),
      supabase
        .from("conflicts")
        .select("*")
        .eq("household_id", household.id)
        .eq("state", "open")
        .order("created_at"),
      apiFetch<SetupStatus>("/api/admin/setup-status"),
    ]);
    setConnections((conns as ServiceConnection[]) ?? []);
    setConflicts((confl as ConflictRow[]) ?? []);
    if (setupRes.ok) {
      setSetup(setupRes.data);
      setWorkerConfig(null);
    } else {
      // The Worker itself is misconfigured — ask the public self-diagnostic
      // which settings are missing and show them plainly.
      try {
        const health = await fetch("/api/health").then((r) => r.json());
        setWorkerConfig((health as { config?: Record<string, boolean> }).config ?? {});
      } catch {
        setWorkerConfig({});
      }
    }
  }, [household]);

  useEffect(() => {
    void load();
  }, [load]);

  // OAuth round trip lands back here with ?connected= or ?error=
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice(`Connected ${connected === "google" ? "Google" : "Microsoft"} — now choose which calendars to sync.`);
    if (error) setNotice(`Connection failed (${error.replaceAll("_", " ")}). Try again.`);
    if (connected || error) {
      const p = new URLSearchParams(params);
      p.delete("connected");
      p.delete("error");
      setParams(p, { replace: true });
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!household) return null;
  if (!isAdmin(role)) {
    return <p className="muted">Integrations are managed by the Owner or an Admin.</p>;
  }

  async function connect(slug: "google" | "microsoft") {
    setBusy(slug);
    const res = await apiFetch<{ url?: string; error?: string }>(`/api/integrations/${slug}/connect`, { method: "POST" });
    setBusy(null);
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
    } else if (res.data?.error === "provider_not_configured") {
      setNotice("That provider's secrets aren't configured yet — see the setup card below.");
    } else {
      setNotice("Could not start the connection. Try again.");
    }
  }

  async function openPicker(connection: ServiceConnection) {
    setBusy(connection.id);
    const res = await apiFetch<{ calendars?: RemoteCal[] }>(`/api/integrations/${connection.id}/calendars`);
    setBusy(null);
    if (res.ok && res.data?.calendars) {
      setPicker({ connection, cals: res.data.calendars });
    } else {
      setNotice("Could not load calendars — run Test to check the connection.");
    }
  }

  async function savePicker() {
    if (!picker) return;
    setBusy(picker.connection.id);
    await apiFetch(`/api/integrations/${picker.connection.id}/calendars`, {
      method: "POST",
      body: JSON.stringify({
        picks: picker.cals.map((c) => ({
          remoteId: c.id,
          name: c.name,
          color: c.color,
          direction: c.readOnly ? "pull" : c.direction,
          selected: c.selected,
        })),
      }),
    });
    setBusy(null);
    setPicker(null);
    setNotice("Calendars saved — first sync is running now.");
    await refresh();
    await load();
  }

  async function op(connection: ServiceConnection, action: "sync" | "test" | "disconnect") {
    if (action === "disconnect" &&
        !window.confirm("Disconnect this account? Local events are kept; syncing stops (you can reconnect later).")) {
      return;
    }
    setBusy(connection.id);
    const res = await apiFetch<Record<string, unknown>>(`/api/integrations/${connection.id}/${action}`, { method: "POST" });
    setBusy(null);
    if (action === "sync" && res.ok) {
      const d = res.data ?? {};
      setNotice(`Sync finished — ${d.created ?? 0} new, ${d.applied ?? 0} updated, ${d.pushed ?? 0} pushed, ${d.conflicts ?? 0} conflicts.`);
    } else if (action === "test") {
      setNotice(String((res.data as { detail?: string } | null)?.detail ?? "Test finished."));
    }
    await refresh();
    await load();
  }

  async function resolve(conflict: ConflictRow, choice: "local" | "remote") {
    setBusy(conflict.id);
    const res = await apiFetch<{ ok: boolean }>(`/api/integrations/conflicts/${conflict.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    setBusy(null);
    if (!res.ok) setNotice("Could not resolve the conflict — try a manual sync first.");
    await load();
  }

  const needsSetup = setup && (!setup.google.configured || !setup.microsoft.configured);

  return (
    <div className="settings-page stack-lg">
      <h1>Integrations</h1>
      {notice && <p className="form-ok" role="status">{notice}</p>}

      {workerConfig && (
        <section className="card worker-config-card" role="alert">
          <h2>⚠️ Worker configuration incomplete</h2>
          <p className="muted small">
            The server side of the app can't reach the database yet, so
            everything on this page is on hold. Status of each required
            setting:
          </p>
          <ul className="plain-list">
            {[
              ["supabase_url_var", "SUPABASE_URL — wrangler.jsonc vars (edit file, commit, push)"],
              ["supabase_anon_key_var", "SUPABASE_ANON_KEY — wrangler.jsonc vars (paste your anon key, push)"],
              ["service_role_key_secret", "SUPABASE_SERVICE_ROLE_KEY — Cloudflare → Worker → Settings → Variables and Secrets (type: Secret)"],
              ["google_secrets", "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET — Cloudflare Worker Secrets (optional until you connect Google)"],
              ["microsoft_secrets", "MS_CLIENT_ID + MS_CLIENT_SECRET — Cloudflare Worker Secrets (optional until you connect Microsoft)"],
            ].map(([key, label]) => (
              <li key={key} className="check-row">
                <span aria-hidden>{workerConfig[key] ? "✅" : "❌"}</span> {label}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Fix the ❌ items, wait ~1 minute (secret changes) or for the deploy
            to finish (wrangler changes), then reload this page. You can also
            open <code>/api/health</code> directly in a browser tab to watch
            the checklist go green.
          </p>
        </section>
      )}

      {/* ---- connect buttons ---- */}
      <section className="card">
        <h2>Connect an account</h2>
        <div className="row">
          <button
            className="btn"
            disabled={busy === "google" || !setup?.google.configured}
            onClick={() => void connect("google")}
          >
            🟦 Connect Google Calendar
          </button>
          <button
            className="btn"
            disabled={busy === "microsoft" || !setup?.microsoft.configured}
            onClick={() => void connect("microsoft")}
          >
            🟪 Connect Microsoft / Outlook
          </button>
        </div>
        <p className="muted small">
          You can connect several accounts — yours, your spouse's, a shared one.
          Each account then chooses which of its calendars the household sees.
        </p>
      </section>

      {/* ---- one-time provider app setup (only shows what's missing) ---- */}
      {needsSetup && setup && (
        <section className="card setup-card">
          <h2>One-time provider setup</h2>
          <p className="muted small">
            Everything below is copy-paste — the app fills in the exact URLs for
            this deployment. Each provider takes about 5 minutes, once, ever.
          </p>
          {!setup.google.configured && (
            <details className="setup-steps">
              <summary><strong>Enable Google Calendar</strong> — not configured yet</summary>
              <ol>
                <li>Open <code>console.cloud.google.com</code> → create/select a project (e.g. <em>family-calendar</em>).</li>
                <li><strong>APIs &amp; Services → Library</strong> → enable <em>Google Calendar API</em>.</li>
                <li><strong>APIs &amp; Services → OAuth consent screen</strong> → External → app name <em>Family Calendar</em> → add your family's Gmail addresses under <strong>Test users</strong> (stays in "Testing" mode — no verification needed).</li>
                <li><strong>Credentials → Create credentials → OAuth client ID</strong> → type <em>Web application</em> → under Authorized redirect URIs paste:<br />
                  <code className="copy-value">{setup.google.redirectUri}</code></li>
                <li>Copy the Client ID and Client Secret it shows you.</li>
                <li>Cloudflare dashboard → your Worker → <strong>Settings → Variables and Secrets</strong> → add two <em>Secrets</em>:<br />
                  <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.</li>
                <li>Reload this page — the Connect button lights up.</li>
              </ol>
            </details>
          )}
          {!setup.microsoft.configured && (
            <details className="setup-steps">
              <summary><strong>Enable Microsoft / Outlook</strong> — not configured yet</summary>
              <ol>
                <li>Open <code>entra.microsoft.com</code> → <strong>App registrations → New registration</strong>.</li>
                <li>Name <em>Family Calendar</em>; supported account types: <em>Accounts in any organizational directory and personal Microsoft accounts</em>.</li>
                <li>Redirect URI: platform <em>Web</em>, value:<br />
                  <code className="copy-value">{setup.microsoft.redirectUri}</code></li>
                <li>After creation: <strong>Certificates &amp; secrets → New client secret</strong> → copy the secret <em>Value</em> (not the ID).</li>
                <li>Copy the <strong>Application (client) ID</strong> from Overview.</li>
                <li>Cloudflare dashboard → your Worker → <strong>Settings → Variables and Secrets</strong> → add two <em>Secrets</em>:<br />
                  <code>MS_CLIENT_ID</code> and <code>MS_CLIENT_SECRET</code>.</li>
                <li>Reload this page.</li>
              </ol>
            </details>
          )}
        </section>
      )}

      {/* ---- connections ---- */}
      <section className="card">
        <h2>Connected accounts</h2>
        {connections.length === 0 && <p className="muted">Nothing connected yet.</p>}
        <ul className="plain-list">
          {connections.map((c) => {
            const p = PROVIDER_LABELS[c.provider_code] ?? { name: c.provider_code, emoji: "🔗", slug: "" };
            const s = STATUS_LABELS[c.status] ?? { label: c.status, cls: "off" };
            return (
              <li key={c.id} className="connection-row">
                <div className="connection-main">
                  <span className={`conn-dot ${s.cls}`} title={s.label} />
                  <div>
                    <strong>{p.emoji} {p.name}</strong>
                    <div className="muted small">
                      {c.account_email ?? "account"} · {s.label}
                      {c.last_success_at && ` · last sync ${new Date(c.last_success_at).toLocaleString()}`}
                    </div>
                    {c.status_detail && <div className="muted small">{c.status_detail.replaceAll("_", " ")}</div>}
                    {c.last_error && c.status !== "connected" && (
                      <div className="form-error small">{c.last_error}</div>
                    )}
                  </div>
                </div>
                <div className="connection-actions">
                  {c.status === "attention" && p.slug && (
                    <button className="btn btn-primary" onClick={() => void connect(p.slug as "google" | "microsoft")}>
                      Reconnect
                    </button>
                  )}
                  {c.provider_code !== "ICS_FEED" && (
                    <button className="btn" disabled={busy === c.id} onClick={() => void openPicker(c)}>
                      Calendars…
                    </button>
                  )}
                  <button className="btn" disabled={busy === c.id} onClick={() => void op(c, "sync")}>
                    {busy === c.id ? "Working…" : "Sync now"}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === c.id} onClick={() => void op(c, "test")}>
                    Test
                  </button>
                  <button className="btn btn-ghost" disabled={busy === c.id} onClick={() => void op(c, "disconnect")}>
                    Disconnect
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- standards connections (WP9): ICS feed + CalDAV ---- */}
      <StandardsSection onDone={async () => { await refresh(); await load(); }} setNotice={setNotice} />

      {/* ---- conflicts (§14.2 — never silently discarded) ---- */}
      {conflicts.length > 0 && (
        <section className="card">
          <h2>Sync conflicts ({conflicts.length})</h2>
          <p className="muted small">
            These events were edited both here and in the connected calendar.
            Pick which version to keep — nothing is thrown away until you choose.
          </p>
          {conflicts.map((cf) => {
            const local = cf.local_snapshot.canon as { title?: string; start_at?: string; start_date?: string; location?: string };
            const remote = cf.remote_snapshot.canon as { title?: string; start_at?: string; start_date?: string; location?: string };
            const fmt = (c: typeof local) =>
              `${c.title ?? "?"} — ${c.start_at ? new Date(c.start_at).toLocaleString() : c.start_date ?? ""}${c.location ? ` @ ${c.location}` : ""}`;
            return (
              <div key={cf.id} className="conflict-row">
                <div className="conflict-side">
                  <div className="filter-group-title">This calendar</div>
                  <p>{fmt(local)}</p>
                  <button className="btn" disabled={busy === cf.id} onClick={() => void resolve(cf, "local")}>
                    Keep mine
                  </button>
                </div>
                <div className="conflict-side">
                  <div className="filter-group-title">Provider version</div>
                  <p>{fmt(remote)}</p>
                  <button className="btn" disabled={busy === cf.id} onClick={() => void resolve(cf, "remote")}>
                    Use theirs
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ---- calendar picker modal ---- */}
      {picker && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Choose calendars">
            <div className="modal-head">
              <h2>Choose calendars to sync</h2>
              <button className="btn btn-ghost" onClick={() => setPicker(null)}>✕</button>
            </div>
            <div className="import-list">
              {picker.cals.map((cal, i) => (
                <div key={cal.id} className="remote-cal-row">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={cal.selected}
                      onChange={() => {
                        const next = [...picker.cals];
                        next[i] = { ...cal, selected: !cal.selected };
                        setPicker({ ...picker, cals: next });
                      }}
                    />
                    <span className="cat-bubble small" style={{ background: cal.color ?? "#5b7fd6" }} />
                    {cal.name}
                    {cal.primary && <span className="muted small"> · primary</span>}
                    {cal.readOnly && <span className="muted small"> · read-only</span>}
                  </label>
                  {cal.selected && !cal.readOnly && (
                    <select
                      value={cal.direction}
                      aria-label={`Sync direction for ${cal.name}`}
                      onChange={(e) => {
                        const next = [...picker.cals];
                        next[i] = { ...cal, direction: e.target.value };
                        setPicker({ ...picker, cals: next });
                      }}
                    >
                      <option value="twoway">Two-way sync</option>
                      <option value="pull">Import only</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setPicker(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy === picker.connection.id} onClick={() => void savePicker()}>
                Save & sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StandardsSection({
  onDone,
  setNotice,
}: {
  onDone: () => Promise<void>;
  setNotice: (s: string) => void;
}) {
  const [feedUrl, setFeedUrl] = useState("");
  const [feedName, setFeedName] = useState("");
  const [davUrl, setDavUrl] = useState("");
  const [davUser, setDavUser] = useState("");
  const [davPass, setDavPass] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    setBusy("feed");
    const res = await apiFetch<{ ok?: boolean; detail?: string; error?: string }>(
      "/api/integrations/icsfeed/connect",
      { method: "POST", body: JSON.stringify({ url: feedUrl, name: feedName }) },
    );
    setBusy(null);
    if (res.ok) {
      setNotice(`Feed added — ${res.data?.detail ?? "importing now."} It refreshes automatically every ~30 minutes.`);
      setFeedUrl("");
      setFeedName("");
      await onDone();
    } else {
      setNotice(res.data?.detail ?? "That doesn't look like a valid .ics feed URL.");
    }
  }

  async function addCaldav(e: React.FormEvent) {
    e.preventDefault();
    setBusy("dav");
    const res = await apiFetch<{ ok?: boolean; calendars?: number; detail?: string }>(
      "/api/integrations/caldav/connect",
      {
        method: "POST",
        body: JSON.stringify({ base_url: davUrl, username: davUser, password: davPass }),
      },
    );
    setBusy(null);
    if (res.ok) {
      setNotice(
        `CalDAV connected — ${res.data?.calendars ?? 0} calendar(s) discovered. ` +
          `Click "Calendars…" on the new connection to choose which to sync.`,
      );
      setDavUrl("");
      setDavUser("");
      setDavPass("");
      await onDone();
    } else {
      setNotice(res.data?.detail ?? "CalDAV connection failed — check the URL and app password.");
    }
  }

  return (
    <section className="card">
      <h2>Subscribe & standards</h2>

      <h3>📡 Subscribe to a calendar feed (.ics URL)</h3>
      <p className="muted small">
        School lunch menus, sports team schedules, holiday feeds — anything that
        publishes an iCalendar URL. Read-only; refreshes automatically.
      </p>
      <form onSubmit={addFeed} className="row row-end">
        <label>
          Feed URL
          <input
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://…/calendar.ics"
            required
          />
        </label>
        <label>
          Name
          <input
            value={feedName}
            onChange={(e) => setFeedName(e.target.value)}
            placeholder="e.g. School district"
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy === "feed"}>
          {busy === "feed" ? "Checking…" : "Subscribe"}
        </button>
      </form>

      <h3>🗄️ Connect a CalDAV server</h3>
      <p className="muted small">
        Works with iCloud (use an app-specific password from appleid.apple.com
        with server <code>https://caldav.icloud.com/</code>), Fastmail, Nextcloud,
        Synology, and most self-hosted calendar servers. Two-way where the
        server allows it.
      </p>
      <form onSubmit={addCaldav} className="row row-end">
        <label>
          Server URL
          <input
            type="url"
            value={davUrl}
            onChange={(e) => setDavUrl(e.target.value)}
            placeholder="https://caldav.example.com/"
            required
          />
        </label>
        <label>
          Username
          <input value={davUser} onChange={(e) => setDavUser(e.target.value)} required />
        </label>
        <label>
          App password
          <input
            type="password"
            value={davPass}
            onChange={(e) => setDavPass(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy === "dav"}>
          {busy === "dav" ? "Connecting…" : "Connect"}
        </button>
      </form>
    </section>
  );
}
