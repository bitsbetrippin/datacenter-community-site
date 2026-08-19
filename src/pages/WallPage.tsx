import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import { supabase } from "../lib/supabase";
import { useHousehold } from "../context/HouseholdContext";
import type { EventInput } from "@fullcalendar/core";
import type { EventRecurrence, EventRow } from "../lib/types";
import { readableForeground, toDateInputValue } from "../lib/eventUtils";
import { expandOccurrences } from "../lib/recurrence";

/**
 * UI-004 — wall display mode: enlarged typography, no navigation chrome,
 * current time, weather slot placeholder, automatic refresh. Runs happily on
 * a mounted tablet or 1080p display signed in with a Viewer account.
 * Press Escape (or tap the hidden corner button) to exit.
 */
export function WallPage() {
  const { household, categories } = useHousehold();
  const [now, setNow] = useState(new Date());
  const [events, setEvents] = useState<EventInput[]>([]);
  const calendarRef = useRef<FullCalendar>(null);
  const navigate = useNavigate();

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Escape exits wall mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && navigate("/");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const load = useCallback(async () => {
    if (!household) return;
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const [plain, rec] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("household_id", household.id)
        .is("deleted_at", null)
        .or(
          `and(all_day.eq.false,start_at.lt.${end.toISOString()},end_at.gt.${start.toISOString()}),` +
            `and(all_day.eq.true,start_date.lt.${toDateInputValue(end)},end_date_exclusive.gt.${toDateInputValue(start)})`,
        )
        .limit(1000),
      supabase
        .from("event_recurrence")
        .select("*, events!inner(*)")
        .eq("household_id", household.id)
        .is("events.deleted_at", null),
    ]);
    const recRows = ((rec.data as unknown as (EventRecurrence & { events: EventRow })[]) ?? []);
    const masterIds = new Set(recRows.map((r) => r.event_id));
    const out: EventInput[] = [];
    const style = (row: EventRow) => {
      const cat = row.category_id ? categoriesById.get(row.category_id) : undefined;
      const color = cat?.color ?? "#64748b";
      return { color, text: cat?.foreground ?? readableForeground(color) };
    };
    for (const row of ((plain.data as EventRow[]) ?? [])) {
      if (masterIds.has(row.id)) continue;
      const s = style(row);
      out.push({
        id: row.id,
        title: row.title,
        start: row.all_day ? row.start_date! : row.start_at!,
        end: row.all_day ? row.end_date_exclusive! : row.end_at!,
        allDay: row.all_day,
        backgroundColor: s.color,
        borderColor: s.color,
        textColor: s.text,
        classNames: ["evt"],
      });
    }
    for (const r of recRows) {
      const master = r.events;
      const s = style(master);
      const durMs = master.all_day
        ? new Date(`${master.end_date_exclusive}T00:00:00`).getTime() -
          new Date(`${master.start_date}T00:00:00`).getTime()
        : new Date(master.end_at!).getTime() - new Date(master.start_at!).getTime();
      for (const occ of expandOccurrences(r.rrule, r.exdates, start, end)) {
        const occEnd = new Date(occ.getTime() + durMs);
        out.push({
          id: `${master.id}@${occ.toISOString()}`,
          title: master.title,
          start: master.all_day ? toDateInputValue(occ) : occ.toISOString(),
          end: master.all_day ? toDateInputValue(occEnd) : occEnd.toISOString(),
          allDay: master.all_day,
          backgroundColor: s.color,
          borderColor: s.color,
          textColor: s.text,
          classNames: ["evt"],
        });
      }
    }
    setEvents(out);
  }, [household, categoriesById, now]);

  useEffect(() => {
    void load();
    // automatic refresh: realtime + a 10-minute safety reload
    const interval = setInterval(() => void load(), 600_000);
    if (!household) return () => clearInterval(interval);
    const channel = supabase
      .channel("wall-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `household_id=eq.${household.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [load, household]);

  if (!household) return null;

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="wall">
      <header className="wall-head">
        <div>
          <div className="wall-date">{dateFmt.format(now)}</div>
          <div className="wall-household">{household.name}</div>
        </div>
        <div className="wall-right">
          <div className="wall-clock" aria-live="off">{timeFmt.format(now)}</div>
          {/* weather slot placeholder per UI-004 */}
          <div className="wall-weather muted" title="Weather (coming later)">⛅ —°</div>
        </div>
      </header>
      <div className="wall-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          firstDay={household.week_start}
          height="100%"
          expandRows
          dayMaxEventRows={5}
          events={events}
          nowIndicator
        />
      </div>
      <button
        className="wall-exit"
        aria-label="Exit wall display"
        onClick={() => navigate("/")}
      >
        ✕
      </button>
    </div>
  );
}
