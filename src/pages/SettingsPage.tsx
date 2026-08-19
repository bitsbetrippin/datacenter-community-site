import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, isAdmin } from "../context/HouseholdContext";
import type { MemberWithProfile, Role } from "../lib/types";
import { COMMON_TIMEZONES } from "../lib/eventUtils";
import {
  AUTO_THEME_ID,
  BASE_THEMES,
  SEASONAL_THEMES,
  applyTheme,
  resolveTheme,
} from "../lib/themes";

/**
 * Release 1 settings: profile, household defaults, members & roles, calendars.
 * The full admin console (categories editor, appearance, audit log, …) is R2.
 * Admin-only sections are hidden for other roles AND blocked by RLS (ADM-001).
 */
export function SettingsPage() {
  const { role } = useHousehold();
  return (
    <div className="settings-page stack-lg">
      <h1>Settings</h1>

      <div className="section-divider">
        <span aria-hidden>👤</span> Personal
      </div>
      <ProfileSection />
      <AppearanceSection />
      <MfaSection />
      {role !== "viewer" && <ContactsSection />}

      {isAdmin(role) ? (
        <>
          <div className="section-divider admin-divider">
            <span aria-hidden>🛡️</span> Administration
            <span className="muted small admin-divider-note">
              Owner &amp; Admins only — changes here affect the whole household
            </span>
          </div>
          <div className="admin-bucket">
            <HouseholdSection />
            <MembersSection />
            <CalendarsSection />
            <BackupSection />
          </div>
        </>
      ) : (
        <p className="muted">
          Household-wide settings are managed by your household's Owner or Admin.
        </p>
      )}
    </div>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [name, setName] = useState(
    (user?.user_metadata?.display_name as string | undefined) ?? "",
  );
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    await Promise.all([
      supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id),
      supabase.auth.updateUser({ data: { display_name: name.trim() } }),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="card">
      <h2>Your profile</h2>
      <form onSubmit={onSubmit} className="row row-end">
        <label>
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button className="btn btn-primary">{saved ? "Saved ✓" : "Save"}</button>
      </form>
      <p className="muted small">Signed in as {user?.email}</p>
    </section>
  );
}

function HouseholdSection() {
  const { household, categories, refresh } = useHousehold();
  const [name, setName] = useState(household?.name ?? "");
  const [timezone, setTimezone] = useState(household?.timezone ?? "America/Chicago");
  const [weekStart, setWeekStart] = useState(household?.week_start ?? 0);
  const [defaultView, setDefaultView] = useState(household?.default_view ?? "dayGridMonth");
  const [duration, setDuration] = useState(household?.default_event_duration_minutes ?? 60);
  const [defaultCategory, setDefaultCategory] = useState(household?.default_category_id ?? "");
  const [showBirthdays, setShowBirthdays] = useState(household?.show_birthdays ?? true);
  const [saved, setSaved] = useState(false);

  if (!household) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("households")
      .update({
        name: name.trim(),
        timezone,
        week_start: weekStart,
        default_view: defaultView,
        default_event_duration_minutes: duration,
        default_category_id: defaultCategory || null,
        show_birthdays: showBirthdays,
      })
      .eq("id", household!.id);
    if (!error) {
      setSaved(true);
      await refresh();
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <section className="card">
      <h2>Household</h2>
      <form onSubmit={onSubmit} className="stack">
        <div className="row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Timezone
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Week starts on
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(Number(e.target.value))}
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={6}>Saturday</option>
            </select>
          </label>
          <label>
            Default view
            <select value={defaultView} onChange={(e) => setDefaultView(e.target.value)}>
              <option value="dayGridMonth">Month</option>
              <option value="timeGridWeek">Week</option>
              <option value="timeGridDay">Day</option>
              <option value="listMonth">Agenda</option>
              <option value="multiMonthYear">Year</option>
            </select>
          </label>
          <label>
            Default event length (minutes)
            <input
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Default category for new events
            <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="check-row" style={{ alignSelf: "flex-end" }}>
            <input
              type="checkbox"
              checked={showBirthdays}
              onChange={(e) => setShowBirthdays(e.target.checked)}
            />
            Show birthdays & anniversaries on the calendar
          </label>
        </div>
        <div>
          <button className="btn btn-primary">{saved ? "Saved ✓" : "Save household"}</button>
        </div>
      </form>
    </section>
  );
}

interface PendingProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

function MembersSection() {
  const { household, role } = useHousehold();
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    const [{ data }, pendingRes] = await Promise.all([
      supabase
        .from("household_members")
        .select("household_id, user_id, role, status, profiles(display_name, email)")
        .eq("household_id", household.id)
        .order("role"),
      supabase.rpc("list_unassigned_profiles"),
    ]);
    setMembers((data as unknown as MemberWithProfile[]) ?? []);
    setPending((pendingRes.data as PendingProfile[]) ?? []);
  }, [household]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approvePending(p: PendingProfile) {
    const chosen = pendingRoles[p.id] ?? "user";
    const { error } = await supabase.rpc("add_member_by_id", {
      p_household: household!.id,
      p_user: p.id,
      p_role: chosen,
    });
    if (error) {
      setErr("Could not assign the role. Try again.");
      return;
    }
    setMsg(`${p.display_name ?? p.email} added as ${chosen}.`);
    await load();
  }

  if (!household) return null;

  async function addMember(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const { error } = await supabase.rpc("add_member_by_email", {
      p_household: household!.id,
      p_email: email.trim(),
      p_role: newRole,
    });
    if (error) {
      setErr(
        error.message.includes("no_account_for_email")
          ? "No account found for that email. Ask them to create an account first (Sign up), then add them here."
          : "Could not add that member.",
      );
      return;
    }
    setMsg("Member added.");
    setEmail("");
    await load();
  }

  async function changeRole(m: MemberWithProfile, next: Role) {
    const { error } = await supabase
      .from("household_members")
      .update({ role: next })
      .eq("household_id", m.household_id)
      .eq("user_id", m.user_id);
    if (!error) await load();
  }

  async function removeMember(m: MemberWithProfile) {
    if (!window.confirm(`Remove ${m.profiles?.display_name ?? m.profiles?.email}?`)) return;
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", m.household_id)
      .eq("user_id", m.user_id);
    if (!error) await load();
  }

  return (
    <section className="card">
      <h2>Members & roles</h2>

      {pending.length > 0 && (
        <div className="pending-box" role="region" aria-label="Pending signups">
          <h3>⏳ Waiting for a role ({pending.length})</h3>
          <p className="muted small">
            These people created accounts but can't use the calendar until you
            assign them a role.
          </p>
          {pending.map((p) => (
            <div key={p.id} className="row row-end pending-row">
              <div className="pending-who">
                <strong>{p.display_name ?? "—"}</strong>
                <span className="muted small">
                  {" "}{p.email} · signed up {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
              <select
                value={pendingRoles[p.id] ?? "user"}
                aria-label={`Role for ${p.display_name ?? p.email}`}
                onChange={(e) =>
                  setPendingRoles((r) => ({ ...r, [p.id]: e.target.value as Role }))
                }
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn btn-primary" onClick={() => void approvePending(p)}>
                Approve
              </button>
            </div>
          ))}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Email</th>
            <th>Role</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isOwnerRow = m.role === "owner";
            const isSelf = m.user_id === user?.id;
            return (
              <tr key={m.user_id}>
                <td>{m.profiles?.display_name ?? "—"}{isSelf ? " (you)" : ""}</td>
                <td>{m.profiles?.email ?? "—"}</td>
                <td>
                  {isOwnerRow ? (
                    <span className="chip chip-outline">owner</span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as Role)}
                      disabled={role !== "owner" && m.role === "admin"}
                    >
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                      <option value="viewer">viewer</option>
                    </select>
                  )}
                </td>
                <td>
                  {!isOwnerRow && !isSelf && (
                    <button className="btn btn-ghost" onClick={() => void removeMember(m)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Add a member</h3>
      <p className="muted small">
        They need to create their own account first (Sign up page). Then add
        their email here — no account is created automatically (§8).
      </p>
      <form onSubmit={addMember} className="row row-end">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Role
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="user">User</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button className="btn btn-primary">Add member</button>
      </form>
      {msg && <p className="form-ok">{msg}</p>}
      {err && <p className="form-error" role="alert">{err}</p>}
    </section>
  );
}

function CalendarsSection() {
  const { household, calendars, refresh } = useHousehold();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b5bdb");

  if (!household) return null;

  async function addCalendar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("calendars").insert({
      household_id: household!.id,
      name: name.trim(),
      color,
      created_by: user?.id,
    });
    if (!error) {
      setName("");
      await refresh();
    }
  }

  return (
    <section className="card">
      <h2>Calendars</h2>
      <ul className="plain-list">
        {calendars.map((c) => (
          <li key={c.id} className="check-row">
            <span className="cat-bubble" style={{ background: c.color }} />
            {c.name}
            {c.is_default && <span className="muted small"> · default</span>}
          </li>
        ))}
      </ul>
      <form onSubmit={addCalendar} className="row row-end">
        <label>
          New calendar
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kids activities"
            required
          />
        </label>
        <label>
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <button className="btn btn-primary">Add calendar</button>
      </form>
    </section>
  );
}

function AppearanceSection() {
  const { user } = useAuth();
  const [timeFormat, setTimeFormat] = useState("12h");
  const [density, setDensity] = useState("comfortable");
  const [theme, setTheme] = useState("classic");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("user_preferences")
      .select("time_format, density, theme")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const prefs = data as { time_format?: string; density?: string; theme?: string } | null;
        if (prefs?.time_format) setTimeFormat(prefs.time_format);
        if (prefs?.density) setDensity(prefs.density);
        if (prefs?.theme) setTheme(prefs.theme);
      });
  }, [user]);

  useEffect(() => {
    document.body.classList.toggle("density-compact", density === "compact");
    applyTheme(theme); // live preview, including festive dressing
  }, [density, theme]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    await supabase
      .from("user_preferences")
      .upsert({ user_id: user.id, time_format: timeFormat, density, theme });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="card">
      <h2>Appearance</h2>
      <form onSubmit={save} className="row row-end">
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value={AUTO_THEME_ID}>
              ✨ Auto — follow the seasons (now: {resolveTheme(AUTO_THEME_ID).label})
            </option>
            <optgroup label="Seasonal packs">
              {SEASONAL_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Everyday">
              {BASE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Time format
          <select value={timeFormat} onChange={(e) => setTimeFormat(e.target.value)}>
            <option value="12h">12-hour (3:30 PM)</option>
            <option value="24h">24-hour (15:30)</option>
          </select>
        </label>
        <label>
          Density
          <select value={density} onChange={(e) => setDensity(e.target.value)}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <button className="btn btn-primary">{saved ? "Saved ✓" : "Save"}</button>
      </form>
      <p className="muted small">
        Applies to your account on every device — wall display included. Pick a
        pack directly, or ✨ Auto to let the calendar dress itself through the
        year (Halloween in October, Christmas in December…).
      </p>
    </section>
  );
}

function MfaSection() {
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(
      (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })),
    );
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  async function startEnroll() {
    setMsg(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      setMsg("Could not start enrollment. MFA may not be enabled for this project.");
      return;
    }
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnroll() {
    if (!enrolling) return;
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
    if (challenge.error || !challenge.data) {
      setMsg("Could not verify the code. Try again.");
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    if (error) {
      setMsg("That code didn't match. Check your authenticator app and try again.");
      return;
    }
    setEnrolling(null);
    setCode("");
    setMsg("Two-factor authentication is on.");
    await loadFactors();
  }

  async function removeFactor(id: string) {
    if (!window.confirm("Turn off two-factor authentication?")) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    await loadFactors();
  }

  const active = factors.filter((f) => f.status === "verified");

  return (
    <section className="card">
      <h2>Two-factor authentication</h2>
      {active.length > 0 ? (
        <div className="row row-end">
          <p className="form-ok">Enabled with an authenticator app.</p>
          <button className="btn" onClick={() => void removeFactor(active[0].id)}>
            Turn off
          </button>
        </div>
      ) : enrolling ? (
        <div className="stack">
          <p className="muted small">
            Scan this QR code with an authenticator app (Google Authenticator,
            1Password, Authy…), then enter the 6-digit code it shows.
          </p>
          <img className="mfa-qr" src={enrolling.qr} alt="Authenticator enrollment QR code" />
          <p className="muted small">Manual key: <code>{enrolling.secret}</code></p>
          <div className="row row-end">
            <label>
              6-digit code
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" onClick={() => void verifyEnroll()}>
              Verify
            </button>
            <button className="btn" onClick={() => setEnrolling(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => void startEnroll()}>
          Set up authenticator app
        </button>
      )}
      {msg && <p className="muted small" role="status">{msg}</p>}
    </section>
  );
}

function ContactsSection() {
  const { household, people, refresh } = useHousehold();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");

  if (!household) return null;

  async function addContact(e: FormEvent) {
    e.preventDefault();
    await supabase.from("people").insert({
      household_id: household!.id,
      display_name: name.trim(),
      email: email.trim() || null,
      birthday: birthday || null,
      created_by: user?.id,
    });
    setName("");
    setEmail("");
    setBirthday("");
    await refresh();
  }

  async function setDate(id: string, field: "birthday" | "anniversary", value: string) {
    await supabase.from("people").update({ [field]: value || null }).eq("id", id);
    await refresh();
  }

  async function removeContact(id: string, label: string) {
    if (!window.confirm(`Remove contact "${label}"?`)) return;
    await supabase.from("people").delete().eq("id", id);
    await refresh();
  }

  const contacts = people.filter((p) => !p.member_user_id);

  return (
    <section className="card">
      <h2>Contacts & special dates</h2>
      <p className="muted small">
        Shared household contacts — coaches, grandparents, sitters. Birthdays and
        anniversaries appear on the calendar automatically when the household
        setting is on.
      </p>
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Birthday</th><th>Anniversary</th><th /></tr>
        </thead>
        <tbody>
          {contacts.map((p) => (
            <tr key={p.id}>
              <td>{p.display_name}</td>
              <td className="muted small">{p.email ?? "—"}</td>
              <td>
                <input
                  type="date"
                  value={p.birthday ?? ""}
                  onChange={(e) => void setDate(p.id, "birthday", e.target.value)}
                  aria-label={`Birthday for ${p.display_name}`}
                />
              </td>
              <td>
                <input
                  type="date"
                  value={p.anniversary ?? ""}
                  onChange={(e) => void setDate(p.id, "anniversary", e.target.value)}
                  aria-label={`Anniversary for ${p.display_name}`}
                />
              </td>
              <td>
                <button
                  className="btn btn-ghost"
                  onClick={() => void removeContact(p.id, p.display_name)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr><td colSpan={5} className="muted">No contacts yet.</td></tr>
          )}
        </tbody>
      </table>
      <form onSubmit={addContact} className="row row-end">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Birthday
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <button className="btn btn-primary">Add contact</button>
      </form>
    </section>
  );
}

function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function downloadBackup() {
    setBusy(true);
    setErr(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/admin/backup", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `family-calendar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Backup failed — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Backup & export</h2>
      <p className="muted small">
        Downloads everything the household owns — events, calendars,
        categories, people, attendees, reminders, settings — as one JSON file
        for portability (§15). Attachment files stay in Supabase Storage and
        the database itself is covered by Supabase's own backups. For a
        calendar you can import elsewhere, use ⋯ → Export .ics on the
        calendar page.
      </p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void downloadBackup()}>
        {busy ? "Preparing…" : "⬇ Download household backup (JSON)"}
      </button>
      {err && <p className="form-error small">{err}</p>}
    </section>
  );
}
