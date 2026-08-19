import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, isAdmin, canCreateEvents } from "../context/HouseholdContext";
import type {
  EventAttendee,
  EventProviderMapping,
  EventRecurrence,
  EventReminder,
  EventRow,
  RsvpState,
} from "../lib/types";
import { addDays, readableForeground } from "../lib/eventUtils";
import { describeRule } from "../lib/recurrence";
import { describeOffset } from "./ReminderEditor";
import { AttachmentsPanel } from "./AttachmentsPanel";

interface EventDetailProps {
  event: EventRow;
  /** When a repeating occurrence was clicked, its concrete times. */
  occurrence: { start: Date; end: Date } | null;
  seriesRule: EventRecurrence | null;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** synthetic rows (birthdays) render read-only */
  synthetic?: boolean;
}

const RSVP_LABELS: Record<RsvpState, string> = {
  needs_response: "No response",
  accepted: "Going",
  declined: "Not going",
  tentative: "Maybe",
};

export function EventDetail(props: EventDetailProps) {
  const { event, occurrence, seriesRule, onClose, onEdit, onDuplicate, onDelete, synthetic } = props;
  const { user } = useAuth();
  const { role, categories, calendars, household } = useHousehold();
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [mapping, setMapping] = useState<EventProviderMapping | null>(null);

  const category = categories.find((c) => c.id === event.category_id);
  const calendar = calendars.find((c) => c.id === event.calendar_id);

  // EVT-002: read-only external sources present no destructive actions.
  const externalReadOnly =
    calendar != null && calendar.source !== "local" && calendar.sync_direction === "pull";

  const canEdit =
    !synthetic &&
    !externalReadOnly &&
    (isAdmin(role) || (role === "user" && event.created_by === user?.id));

  const load = useCallback(async () => {
    if (synthetic) return;
    const [att, rem, map] = await Promise.all([
      supabase.from("event_attendees").select("*").eq("event_id", event.id).order("created_at"),
      supabase.from("event_reminders").select("*").eq("event_id", event.id),
      supabase
        .from("event_provider_mappings")
        .select("id, event_id, connection_id, remote_event_id, last_synced_at, deleted_remote")
        .eq("event_id", event.id)
        .limit(1)
        .maybeSingle(),
    ]);
    setAttendees((att.data as EventAttendee[]) ?? []);
    setReminders((rem.data as EventReminder[]) ?? []);
    setMapping((map.data as EventProviderMapping) ?? null);
  }, [event.id, synthetic]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtDate = new Intl.DateTimeFormat(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const fmtTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit",
  });

  let when: string;
  if (occurrence && !event.all_day) {
    when = `${fmtDate.format(occurrence.start)} · ${fmtTime.format(occurrence.start)} – ${fmtTime.format(occurrence.end)}`;
  } else if (event.all_day) {
    const startStr = occurrence ? undefined : event.start_date!;
    const s = occurrence ? occurrence.start : new Date(`${startStr}T00:00:00`);
    const lastDay = event.end_date_exclusive ? addDays(event.end_date_exclusive, -1) : null;
    const e = occurrence ? occurrence.start : lastDay ? new Date(`${lastDay}T00:00:00`) : s;
    when =
      s.toDateString() === e.toDateString()
        ? `${fmtDate.format(s)} · All day`
        : `${fmtDate.format(s)} – ${fmtDate.format(e)} · All day`;
  } else {
    const s = new Date(event.start_at!);
    const e = new Date(event.end_at!);
    when =
      s.toDateString() === e.toDateString()
        ? `${fmtDate.format(s)} · ${fmtTime.format(s)} – ${fmtTime.format(e)}`
        : `${fmtDate.format(s)} ${fmtTime.format(s)} – ${fmtDate.format(e)} ${fmtTime.format(e)}`;
  }

  const myAttendeeRow = attendees.find((a) => a.member_user_id === user?.id);

  async function setMyRsvp(next: RsvpState) {
    if (!myAttendeeRow) return;
    // PPL-001 — attendees respond; RLS lets a member update only their own row.
    await supabase.from("event_attendees").update({ rsvp: next }).eq("id", myAttendeeRow.id);
    await load();
  }

  return (
    <aside className="drawer" aria-label="Event details">
      <div className="drawer-head">
        <h3>{event.title}</h3>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close details">✕</button>
      </div>

      <div className="drawer-body stack">
        {event.needs_attention && (
          <p className="attention-banner">
            🔎 Imported — needs review: confirm the time and category, then save.
          </p>
        )}
        <div className="detail-line">{when}</div>
        {seriesRule && (
          <div className="detail-line muted">↻ Repeats {describeRule(seriesRule.rrule)}</div>
        )}
        {event.original_occurrence_at && (
          <div className="detail-line muted small">Changed from its usual series time</div>
        )}
        {event.timezone !== household?.timezone && !synthetic && (
          <div className="detail-line muted">Timezone: {event.timezone}</div>
        )}

        <div className="chips">
          {category && (
            <span
              className="chip"
              style={{
                background: category.color,
                color: category.foreground ?? readableForeground(category.color),
              }}
            >
              {category.name}
            </span>
          )}
          {calendar && !synthetic && <span className="chip chip-outline">{calendar.name}</span>}
          {event.status !== "confirmed" && (
            <span className={`chip chip-status-${event.status}`}>{event.status}</span>
          )}
          {event.visibility === "private" && (
            <span className="chip chip-outline">🔒 private</span>
          )}
        </div>

        {event.location_text && <div className="detail-line">📍 {event.location_text}</div>}
        {event.description && <p className="detail-desc">{event.description}</p>}

        {attendees.length > 0 && (
          <div>
            <h4>People</h4>
            <ul className="plain-list">
              {attendees.map((a) => (
                <li key={a.id} className="attendee-line">
                  <span>
                    {a.display_name}
                    {a.attendee_type !== "required" && (
                      <span className="muted small"> · {a.attendee_type}</span>
                    )}
                  </span>
                  <span className={`rsvp rsvp-${a.rsvp}`}>{RSVP_LABELS[a.rsvp]}</span>
                </li>
              ))}
            </ul>
            {myAttendeeRow && (
              <div className="rsvp-controls" role="group" aria-label="Your response">
                {(["accepted", "tentative", "declined"] as RsvpState[]).map((s) => (
                  <button
                    key={s}
                    className={`btn ${myAttendeeRow.rsvp === s ? "btn-primary" : ""}`}
                    onClick={() => void setMyRsvp(s)}
                  >
                    {RSVP_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {reminders.length > 0 && (
          <div>
            <h4>Reminders</h4>
            <ul className="plain-list">
              {reminders.map((r) => (
                <li key={r.id} className="muted small">
                  ⏰ {describeOffset(r.offset_minutes)}
                  {r.scope === "household" ? " · whole household" : ""}
                  {r.created_by === user?.id ? " · yours" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!synthetic && (
          <AttachmentsPanel event={event} canUpload={canCreateEvents(role)} />
        )}

        {!synthetic && (
          <div className="detail-line muted small">
            Last updated {new Date(event.updated_at).toLocaleString()}
            {" · Source: "}
            {calendar && calendar.source !== "local"
              ? calendar.source === "google" ? "Google Calendar" : "Microsoft / Outlook"
              : "local"}
            {mapping?.last_synced_at &&
              ` · synced ${new Date(mapping.last_synced_at).toLocaleString()}`}
            {externalReadOnly && " · read-only"}
          </div>
        )}
      </div>

      <div className="drawer-actions">
        {canEdit && <button className="btn" onClick={onEdit}>Edit</button>}
        {canCreateEvents(role) && !synthetic && (
          <button className="btn" onClick={onDuplicate}>Duplicate</button>
        )}
        {canEdit && (
          <button className="btn btn-danger" onClick={onDelete}>Delete</button>
        )}
      </div>
    </aside>
  );
}
