import { useMemo, useState } from "react";
import { useHousehold } from "../context/HouseholdContext";
import type { AttendeeType } from "../lib/types";

/** Draft attendee row used by the event modal before saving. */
export interface AttendeeDraft {
  id?: string; // existing row id when editing
  member_user_id: string | null;
  person_id: string | null;
  display_name: string;
  email: string | null;
  attendee_type: AttendeeType;
  rsvp?: string;
  /** external entry that should create a household contact on save */
  isNewExternal?: boolean;
}

export function attendeeKey(a: AttendeeDraft): string {
  return a.member_user_id ?? a.person_id ?? `ext:${(a.email ?? a.display_name).toLowerCase()}`;
}

const TYPES: AttendeeType[] = [
  "required",
  "optional",
  "organizer",
  "child",
  "driver",
  "observer",
];

interface Props {
  value: AttendeeDraft[];
  onChange: (next: AttendeeDraft[]) => void;
}

/**
 * §8 people picker: household members first, then saved contacts, then a new
 * external attendee by name + email (which becomes a household contact).
 */
export function AttendeeEditor({ value, onChange }: Props) {
  const { members, people } = useHousehold();
  const [query, setQuery] = useState("");
  const [extName, setExtName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [showExternal, setShowExternal] = useState(false);

  const chosen = useMemo(() => new Set(value.map(attendeeKey)), [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const memberHits = members
      .filter((m) => {
        const name = m.profiles?.display_name ?? "";
        const email = m.profiles?.email ?? "";
        return !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
      })
      .map((m) => ({
        kind: "member" as const,
        key: m.user_id,
        name: m.profiles?.display_name ?? m.profiles?.email ?? "Member",
        email: m.profiles?.email ?? null,
      }));
    const contactHits = people
      .filter((p) => !p.member_user_id)
      .filter(
        (p) =>
          !q ||
          p.display_name.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q),
      )
      .map((p) => ({
        kind: "contact" as const,
        key: p.id,
        name: p.display_name,
        email: p.email,
      }));
    return [...memberHits, ...contactHits]
      .filter((s) => !chosen.has(s.key))
      .slice(0, 8);
  }, [members, people, query, chosen]);

  function add(s: { kind: "member" | "contact"; key: string; name: string; email: string | null }) {
    onChange([
      ...value,
      {
        member_user_id: s.kind === "member" ? s.key : null,
        person_id: s.kind === "contact" ? s.key : null,
        display_name: s.name,
        email: s.email,
        attendee_type: "required",
      },
    ]);
    setQuery("");
  }

  function addExternal() {
    if (!extName.trim()) return;
    onChange([
      ...value,
      {
        member_user_id: null,
        person_id: null,
        display_name: extName.trim(),
        email: extEmail.trim() || null,
        attendee_type: "required",
        isNewExternal: true,
      },
    ]);
    setExtName("");
    setExtEmail("");
    setShowExternal(false);
  }

  return (
    <div className="stack attendee-editor">
      {value.length > 0 && (
        <ul className="plain-list attendee-list">
          {value.map((a, i) => (
            <li key={attendeeKey(a)} className="attendee-row">
              <span className="attendee-name">
                {a.display_name}
                {a.member_user_id && <span className="muted small"> · member</span>}
              </span>
              <select
                value={a.attendee_type}
                aria-label={`Role for ${a.display_name}`}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = { ...a, attendee_type: e.target.value as AttendeeType };
                  onChange(next);
                }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove ${a.display_name}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        placeholder="Add people — search family & contacts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && suggestions.length > 0 && (
        <div className="suggestion-list">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              className="suggestion"
              onClick={() => add(s)}
            >
              {s.name}
              <span className="muted small">
                {" "}{s.kind === "member" ? "member" : "contact"}
                {s.email ? ` · ${s.email}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {!showExternal ? (
        <button
          type="button"
          className="btn btn-ghost more-toggle"
          onClick={() => setShowExternal(true)}
        >
          + Add someone outside the household
        </button>
      ) : (
        <div className="row row-end">
          <label>
            Name
            <input value={extName} onChange={(e) => setExtName(e.target.value)} />
          </label>
          <label>
            Email (optional)
            <input
              type="email"
              value={extEmail}
              onChange={(e) => setExtEmail(e.target.value)}
            />
          </label>
          <button type="button" className="btn" onClick={addExternal}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
