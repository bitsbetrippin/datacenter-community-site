import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, canCreateEvents } from "../context/HouseholdContext";
import type { EventRecurrence, EventRow } from "../lib/types";
import { toDateInputValue, toTimeInputValue } from "../lib/eventUtils";
import { nextOccurrence } from "../lib/recurrence";

interface UpcomingItem {
  row: EventRow;
  start: Date;
  isOccurrence: boolean;
}

interface Props {
  onOpen: (row: EventRow, occurrenceStart: Date | null) => void;
  onClose: () => void;
  refreshKey: number;
}

/** §12 upcoming panel (next events with time-to-event) + quick add form. */
export function UpcomingPanel({ onOpen, onClose, refreshKey }: Props) {
  const { household, role, categories } = useHousehold();
  const { user } = useAuth();
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [time, setTime] = useState(toTimeInputValue(new Date(Date.now() + 3600_000)));
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!household) return;
    const nowIso = new Date().toISOString();
    const today = toDateInputValue(new Date());
    const [plain, recurring] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("household_id", household.id)
        .is("deleted_at", null)
        .or(`start_at.gte.${nowIso},and(all_day.eq.true,end_date_exclusive.gt.${today})`)
        .order("start_at", { ascending: true, nullsFirst: false })
        .limit(30),
      supabase
        .from("event_recurrence")
        .select("*, events!inner(*)")
        .eq("household_id", household.id)
        .is("events.deleted_at", null),
    ]);

    const out: UpcomingItem[] = [];
    const recurringIds = new Set<string>();

    for (const rec of ((recurring.data as unknown as (EventRecurrence & { events: EventRow })[]) ?? [])) {
      recurringIds.add(rec.event_id);
      const next = nextOccurrence(rec.rrule, rec.exdates, new Date());
      if (next) out.push({ row: rec.events, start: next, isOccurrence: true });
    }
    for (const row of ((plain.data as EventRow[]) ?? [])) {
      if (recurringIds.has(row.id)) continue;
      const start = row.all_day
        ? new Date(`${row.start_date}T00:00:00`)
        : new Date(row.start_at!);
      out.push({ row, start, isOccurrence: false });
    }
    out.sort((a, b) => a.start.getTime() - b.start.getTime());
    setItems(out.slice(0, 10));
  }, [household]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function timeToEvent(d: Date): string {
    const mins = Math.round((d.getTime() - Date.now()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `in ${mins}m`;
    if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`;
    return `in ${Math.round(mins / (60 * 24))}d`;
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    if (!household || !user || !title.trim()) return;
    setBusy(true);
    const start = new Date(`${date}T${time}`);
    const end = new Date(
      start.getTime() + (household.default_event_duration_minutes ?? 60) * 60000,
    );
    const defaultCalendar = await supabase
      .from("calendars")
      .select("id")
      .eq("household_id", household.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .single();
    await supabase.from("events").insert({
      household_id: household.id,
      calendar_id: (defaultCalendar.data as { id: string }).id,
      category_id: categoryId || null,
      title: title.trim(),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: household.timezone,
      all_day: false,
      created_by: user.id,
      organizer_user_id: user.id,
      updated_by: user.id,
    });
    setTitle("");
    setBusy(false);
    await load();
  }

  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <aside className="drawer" aria-label="Upcoming events">
      <div className="drawer-head">
        <h3>Upcoming</h3>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close upcoming">✕</button>
      </div>
      <div className="drawer-body stack">
        {items.length === 0 && <p className="muted">Nothing coming up.</p>}
        <ul className="plain-list">
          {items.map((it) => (
            <li key={`${it.row.id}:${it.start.toISOString()}`}>
              <button
                type="button"
                className="upcoming-item"
                onClick={() => onOpen(it.row, it.isOccurrence ? it.start : null)}
              >
                <span className="upcoming-title">{it.row.title}</span>
                <span className="muted small">
                  {it.row.all_day && !it.isOccurrence
                    ? new Intl.DateTimeFormat(undefined, {
                        weekday: "short", month: "short", day: "numeric",
                      }).format(it.start) + " · all day"
                    : fmt.format(it.start)}
                  {" · "}{timeToEvent(it.start)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {canCreateEvents(role) && (
          <form onSubmit={quickAdd} className="stack quick-add">
            <h4>Quick add</h4>
            <input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="row">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={busy}>Add</button>
          </form>
        )}
      </div>
    </aside>
  );
}
