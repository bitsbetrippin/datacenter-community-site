import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import multiMonthPlugin from "@fullcalendar/multimonth";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, canCreateEvents, isAdmin } from "../context/HouseholdContext";
import type { EventRecurrence, EventRow } from "../lib/types";
import { readableForeground, toDateInputValue } from "../lib/eventUtils";
import { expandOccurrences, ruleHasCount, truncateRuleBefore } from "../lib/recurrence";
import { EventModal, type EventModalProps } from "../components/EventModal";
import { EventDetail } from "../components/EventDetail";
import { FilterBar, type FilterState } from "../components/FilterBar";
import { UpcomingPanel } from "../components/UpcomingPanel";
import { IcsMenu } from "../components/IcsMenu";
import { ScopeDialog, type EditScope } from "../components/ScopeDialog";

interface Range {
  start: Date;
  end: Date;
}

interface Selection {
  row: EventRow;
  occurrence: { start: Date; end: Date } | null;
  synthetic?: boolean;
}

type ModalState =
  | { kind: "closed" }
  | {
      kind: "open";
      mode: EventModalProps["mode"];
      base: EventRow | null;
      scope?: EditScope;
      occurrence?: { start: Date; end: Date } | null;
      seriesRule?: EventRecurrence | null;
      prefillStart: Date | null;
      prefillAllDay: boolean;
    };

interface ScopeAsk {
  verb: "edit" | "delete";
  selection: Selection;
  seriesRule: EventRecurrence;
}

interface UndoState {
  label: string;
  revert: () => Promise<void>;
}

export function CalendarPage() {
  const { household, role, categories, people, calendars } = useHousehold();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<Range | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [recurrences, setRecurrences] = useState<(EventRecurrence & { events: EventRow })[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [scopeAsk, setScopeAsk] = useState<ScopeAsk | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hour12, setHour12] = useState(true);
  const calendarRef = useRef<FullCalendar>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();

  const filters: FilterState = useMemo(
    () => ({
      categoryIds: params.get("cats")?.split(",").filter(Boolean) ?? [],
      calendarIds: params.get("cals")?.split(",").filter(Boolean) ?? [],
      person: params.get("person"),
    }),
    [params],
  );

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const setFilters = useCallback(
    (next: FilterState) => {
      const p = new URLSearchParams(params);
      next.categoryIds.length ? p.set("cats", next.categoryIds.join(",")) : p.delete("cats");
      next.calendarIds.length ? p.set("cals", next.calendarIds.join(",")) : p.delete("cals");
      next.person ? p.set("person", next.person) : p.delete("person");
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  // ---- user preference: 12/24h ------------------------------------------
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("user_preferences")
      .select("time_format")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.time_format) setHour12(data.time_format !== "24h");
      });
  }, [user]);

  // ---- data loading ------------------------------------------------------
  const loadEvents = useCallback(async () => {
    if (!household || !range) return;
    const startISO = range.start.toISOString();
    const endISO = range.end.toISOString();
    const startDate = toDateInputValue(range.start);
    const endDate = toDateInputValue(range.end);

    // Person filter → the set of event ids that person attends (PPL-002).
    let personEventIds: string[] | null = null;
    if (filters.person) {
      const [kind, id] = filters.person.split(":");
      const q = supabase
        .from("event_attendees")
        .select("event_id")
        .eq("household_id", household.id);
      const { data } = await (kind === "m"
        ? q.eq("member_user_id", id)
        : q.eq("person_id", id));
      personEventIds = ((data as { event_id: string }[]) ?? []).map((r) => r.event_id);
    }

    let q = supabase
      .from("events")
      .select("*")
      .eq("household_id", household.id)
      .is("deleted_at", null)
      .or(
        `and(all_day.eq.false,start_at.lt.${endISO},end_at.gt.${startISO}),` +
          `and(all_day.eq.true,start_date.lt.${endDate},end_date_exclusive.gt.${startDate})`,
      );
    if (filters.categoryIds.length) q = q.in("category_id", filters.categoryIds);
    if (filters.calendarIds.length) q = q.in("calendar_id", filters.calendarIds);
    if (personEventIds) q = q.in("id", personEventIds.length ? personEventIds : ["00000000-0000-0000-0000-000000000000"]);

    let rq = supabase
      .from("event_recurrence")
      .select("*, events!inner(*)")
      .eq("household_id", household.id)
      .is("events.deleted_at", null);
    if (filters.categoryIds.length) rq = rq.in("events.category_id", filters.categoryIds);
    if (filters.calendarIds.length) rq = rq.in("events.calendar_id", filters.calendarIds);
    if (personEventIds) rq = rq.in("event_id", personEventIds.length ? personEventIds : ["00000000-0000-0000-0000-000000000000"]);

    const [plain, rec] = await Promise.all([q.limit(2000), rq]);
    if (!plain.error) setRows((plain.data as EventRow[]) ?? []);
    if (!rec.error) {
      setRecurrences(
        ((rec.data as unknown as (EventRecurrence & { events: EventRow })[]) ?? []),
      );
    }
  }, [household, range, filters]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // ---- realtime refresh (§4 optional Realtime) ---------------------------
  useEffect(() => {
    if (!household) return;
    const channel = supabase
      .channel("events-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `household_id=eq.${household.id}` },
        () => {
          void loadEvents();
          setRefreshKey((k) => k + 1);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [household, loadEvents]);

  // ---- deep link (?event=…&date=…) from search ---------------------------
  useEffect(() => {
    const eventId = params.get("event");
    const date = params.get("date");
    if (!household || (!eventId && !date)) return;
    if (date) calendarRef.current?.getApi().gotoDate(date);
    if (eventId) {
      void supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSelected({ row: data as EventRow, occurrence: null });
        });
    }
    const p = new URLSearchParams(params);
    p.delete("event");
    p.delete("date");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, params]);

  // ---- display events -----------------------------------------------------
  const recurringMasterIds = useMemo(
    () => new Set(recurrences.map((r) => r.event_id)),
    [recurrences],
  );

  const displayEvents = useMemo(() => {
    if (!range) return [] as EventInput[];
    const out: EventInput[] = [];
    const calById = new Map(calendars.map((c) => [c.id, c]));
    const editableRow = (row: EventRow) => {
      const cal = calById.get(row.calendar_id);
      // EVT-002: pull-only provider calendars are read-only in the UI.
      if (cal && cal.source !== "local" && cal.sync_direction === "pull") return false;
      return canCreateEvents(role) && (isAdmin(role) || row.created_by === user?.id);
    };

    const styleFor = (row: EventRow) => {
      const category = row.category_id ? categoriesById.get(row.category_id) : undefined;
      const color = category?.color ?? "#64748b";
      const text = category?.foreground ?? readableForeground(color);
      const classNames = ["evt"];
      if (row.status === "canceled") classNames.push("evt-canceled");
      if (row.status === "tentative") classNames.push("evt-tentative");
      if (row.visibility === "private") classNames.push("evt-private");
      // v1.0 import review: red outline until time/category confirmed
      if (row.needs_attention) classNames.push("evt-attention");
      return { color, text, classNames };
    };

    for (const row of rows) {
      if (recurringMasterIds.has(row.id)) continue; // masters render via expansion
      const s = styleFor(row);
      out.push({
        id: row.id,
        title: row.title,
        start: row.all_day ? row.start_date! : row.start_at!,
        end: row.all_day ? row.end_date_exclusive! : row.end_at!,
        allDay: row.all_day,
        backgroundColor: s.color,
        borderColor: s.color,
        textColor: s.text,
        classNames: row.recurrence_series_id ? [...s.classNames, "evt-recurring"] : s.classNames,
        editable: editableRow(row),
        extendedProps: { row },
      });
    }

    for (const rec of recurrences) {
      const master = rec.events;
      const s = styleFor(master);
      const durationMs = master.all_day
        ? (new Date(`${master.end_date_exclusive}T00:00:00`).getTime() -
           new Date(`${master.start_date}T00:00:00`).getTime())
        : new Date(master.end_at!).getTime() - new Date(master.start_at!).getTime();
      const occurrences = expandOccurrences(rec.rrule, rec.exdates, range.start, range.end);
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + durationMs);
        out.push({
          id: `${master.id}@${occStart.toISOString()}`,
          title: master.title,
          start: master.all_day ? toDateInputValue(occStart) : occStart.toISOString(),
          end: master.all_day ? toDateInputValue(occEnd) : occEnd.toISOString(),
          allDay: master.all_day,
          backgroundColor: s.color,
          borderColor: s.color,
          textColor: s.text,
          classNames: [...s.classNames, "evt-recurring"],
          editable: false, // reschedule occurrences through the edit dialog
          extendedProps: { row: master, occStart, occEnd, seriesRule: rec },
        });
      }
    }

    // Birthdays & anniversaries (PPL-003) — synthesized, not stored as events.
    if (household?.show_birthdays) {
      const bdayCat = categories.find((c) => c.slug === "birthday");
      const annivCat = categories.find((c) => c.slug === "anniversary");
      const years = new Set([range.start.getFullYear(), range.end.getFullYear()]);
      for (const p of people) {
        for (const [field, cat, emoji] of [
          ["birthday", bdayCat, "🎂"],
          ["anniversary", annivCat, "💞"],
        ] as const) {
          const dateStr = p[field];
          if (!dateStr) continue;
          const [, mm, dd] = dateStr.split("-");
          for (const year of years) {
            const d = `${year}-${mm}-${dd}`;
            const dt = new Date(`${d}T00:00:00`);
            if (dt < range.start || dt >= range.end) continue;
            const color = cat?.color ?? "#c5598f";
            out.push({
              id: `synth:${field}:${p.id}:${year}`,
              title: `${emoji} ${p.display_name}${field === "birthday" ? "'s birthday" : " — anniversary"}`,
              start: d,
              allDay: true,
              backgroundColor: color,
              borderColor: color,
              textColor: readableForeground(color),
              classNames: ["evt", "evt-synth"],
              editable: false,
              extendedProps: { synthetic: true, person: p, field, date: d, catId: cat?.id ?? null },
            });
          }
        }
      }
    }

    return out;
  }, [rows, recurrences, recurringMasterIds, categoriesById, range, role, user, household, categories, people, calendars]);

  const canCreate = canCreateEvents(role);

  // ---- interactions --------------------------------------------------------
  const openCreate = useCallback(
    (prefillStart: Date | null = null, prefillAllDay = false) => {
      if (!canCreate) return;
      setModal({ kind: "open", mode: "create", base: null, prefillStart, prefillAllDay });
    },
    [canCreate],
  );

  function onDateClick(arg: DateClickArg) {
    if (arg.view.type === "dayGridMonth" || arg.view.type === "multiMonthYear") {
      const d = new Date(arg.date);
      d.setHours(9, 0, 0, 0);
      openCreate(d, false);
    } else {
      openCreate(arg.date, arg.allDay);
    }
  }

  function onEventClick(arg: EventClickArg) {
    const xp = arg.event.extendedProps as {
      row?: EventRow;
      occStart?: Date;
      occEnd?: Date;
      synthetic?: boolean;
      person?: { display_name: string };
      field?: string;
      date?: string;
      catId?: string | null;
    };
    if (xp.synthetic && xp.person && xp.date) {
      // read-only synthetic detail
      const pseudo: EventRow = {
        id: arg.event.id,
        household_id: household!.id,
        calendar_id: "",
        category_id: xp.catId ?? null,
        organizer_user_id: null,
        title: arg.event.title,
        description: null,
        start_at: null,
        end_at: null,
        start_date: xp.date,
        end_date_exclusive: xp.date,
        timezone: household!.timezone,
        all_day: true,
        location_text: null,
        status: "confirmed",
        visibility: "household",
        recurrence_series_id: null,
        original_occurrence_at: null,
        needs_attention: false,
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      setSelected({ row: pseudo, occurrence: null, synthetic: true });
      return;
    }
    if (!xp.row) return;
    setSelected({
      row: xp.row,
      occurrence: xp.occStart && xp.occEnd ? { start: xp.occStart, end: xp.occEnd } : null,
    });
  }

  function onDatesSet(arg: DatesSetArg) {
    setRange({ start: arg.start, end: arg.end });
  }

  // CAL-004 — drag & drop move/resize persists immediately.
  async function persistMove(arg: EventDropArg | EventResizeDoneArg) {
    const row = (arg.event.extendedProps as { row?: EventRow }).row;
    if (!row) return arg.revert();
    const patch = arg.event.allDay
      ? {
          start_date: toDateInputValue(arg.event.start!),
          end_date_exclusive: toDateInputValue(
            arg.event.end ?? new Date(arg.event.start!.getTime() + 86400_000),
          ),
          start_at: null,
          end_at: null,
          all_day: true,
          updated_by: user?.id,
        }
      : {
          start_at: arg.event.start!.toISOString(),
          end_at: (arg.event.end ?? new Date(arg.event.start!.getTime() + 3600_000)).toISOString(),
          start_date: null,
          end_date_exclusive: null,
          all_day: false,
          updated_by: user?.id,
        };
    const { error } = await supabase.from("events").update(patch).eq("id", row.id);
    if (error) arg.revert();
    else void loadEvents();
  }

  const afterMutation = useCallback(() => {
    setModal({ kind: "closed" });
    setSelected(null);
    setScopeAsk(null);
    setRefreshKey((k) => k + 1);
    void loadEvents();
  }, [loadEvents]);

  function showUndo(label: string, revert: () => Promise<void>) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ label, revert });
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  }

  // ---- edit / delete entry points (with recurring scope prompts) ----------
  function seriesRuleFor(sel: Selection): EventRecurrence | null {
    const direct = recurrences.find((r) => r.event_id === sel.row.id);
    return direct ?? null;
  }

  function requestEdit(sel: Selection) {
    const rule = seriesRuleFor(sel);
    if (rule && sel.occurrence) {
      setScopeAsk({ verb: "edit", selection: sel, seriesRule: rule });
    } else {
      setModal({
        kind: "open",
        mode: "edit",
        base: sel.row,
        seriesRule: rule,
        scope: rule ? "series" : undefined,
        occurrence: null,
        prefillStart: null,
        prefillAllDay: false,
      });
    }
  }

  function requestDuplicate(sel: Selection) {
    setModal({
      kind: "open",
      mode: "create",
      base: sel.row,
      prefillStart: null,
      prefillAllDay: false,
    });
  }

  async function softDelete(row: EventRow, label: string) {
    await supabase
      .from("events")
      .update({ deleted_at: new Date().toISOString(), updated_by: user?.id })
      .eq("id", row.id);
    showUndo(label, async () => {
      await supabase.from("events").update({ deleted_at: null }).eq("id", row.id);
    });
    afterMutation();
  }

  async function requestDelete(sel: Selection) {
    const rule = seriesRuleFor(sel);
    if (rule && sel.occurrence) {
      setScopeAsk({ verb: "delete", selection: sel, seriesRule: rule });
      return;
    }
    if (!window.confirm(`Delete "${sel.row.title}"?`)) return;
    await softDelete(sel.row, `Deleted "${sel.row.title}"`);
  }

  async function onScopePicked(scope: EditScope) {
    if (!scopeAsk) return;
    const { verb, selection, seriesRule } = scopeAsk;
    const occ = selection.occurrence!;
    if (verb === "edit") {
      setScopeAsk(null);
      setModal({
        kind: "open",
        mode: "edit",
        base: selection.row,
        scope,
        occurrence: occ,
        seriesRule,
        prefillStart: null,
        prefillAllDay: false,
      });
      return;
    }
    // delete flows
    if (scope === "occurrence") {
      const before = seriesRule.exdates;
      await supabase
        .from("event_recurrence")
        .update({ exdates: [...before, occ.start.toISOString()] })
        .eq("series_id", seriesRule.series_id);
      showUndo("Occurrence deleted", async () => {
        await supabase
          .from("event_recurrence")
          .update({ exdates: before })
          .eq("series_id", seriesRule.series_id);
      });
      afterMutation();
    } else if (scope === "future") {
      const beforeRule = seriesRule.rrule;
      await supabase
        .from("event_recurrence")
        .update({ rrule: truncateRuleBefore(beforeRule, occ.start) })
        .eq("series_id", seriesRule.series_id);
      showUndo("Future occurrences removed", async () => {
        await supabase
          .from("event_recurrence")
          .update({ rrule: beforeRule })
          .eq("series_id", seriesRule.series_id);
      });
      afterMutation();
    } else {
      await softDelete(selection.row, `Deleted series "${selection.row.title}"`);
    }
  }

  // ---- keyboard shortcuts (§12 Should) ------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        modal.kind === "open" ||
        scopeAsk ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        if (e.key === "Escape") (target as HTMLInputElement).blur?.();
        return;
      }
      const api = calendarRef.current?.getApi();
      if (!api) return;
      switch (e.key) {
        case "n": if (canCreate) { e.preventDefault(); openCreate(); } break;
        case "t": api.today(); break;
        case "1": api.changeView("dayGridMonth"); break;
        case "2": api.changeView("timeGridWeek"); break;
        case "3": api.changeView("timeGridDay"); break;
        case "4": api.changeView("listMonth"); break;
        case "5": api.changeView("multiMonthYear"); break;
        case "/": {
          e.preventDefault();
          document.getElementById("global-search")?.focus();
          break;
        }
        case "Escape": setSelected(null); setShowUpcoming(false); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.kind, scopeAsk, canCreate, openCreate]);

  if (!household) return null;

  const timeFmt = {
    hour: "numeric" as const,
    minute: "2-digit" as const,
    hour12,
    meridiem: hour12 ? ("short" as const) : false as const,
  };

  return (
    <div className="calendar-page">
      <div className="calendar-toolbar-row no-print">
        <FilterBar value={filters} onChange={setFilters} />
        <div className="toolbar-actions">
          <IcsMenu onImported={afterMutation} />
          <button
            className={`btn ${showUpcoming ? "btn-primary" : ""}`}
            onClick={() => { setShowUpcoming((v) => !v); setSelected(null); }}
          >
            Upcoming
          </button>
          {canCreate && (
            <button className="btn btn-primary add-event" onClick={() => openCreate()}>
              ＋ Add Event
            </button>
          )}
        </div>
      </div>

      <div className={`calendar-holder ${selected || showUpcoming ? "with-drawer" : ""}`}>
        <div className="calendar-main">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin]}
            initialView={household.default_view || "dayGridMonth"}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth,multiMonthYear",
            }}
            buttonText={{
              today: "Today", dayGridMonth: "Month", timeGridWeek: "Week",
              timeGridDay: "Day", listMonth: "Agenda", multiMonthYear: "Year",
            }}
            firstDay={household.week_start}
            timeZone="local"
            height="100%"
            expandRows
            nowIndicator
            navLinks
            dayMaxEventRows={4}
            eventTimeFormat={timeFmt}
            slotLabelFormat={timeFmt}
            events={displayEvents}
            dateClick={canCreate ? onDateClick : undefined}
            eventClick={onEventClick}
            datesSet={onDatesSet}
            eventDrop={(arg) => void persistMove(arg)}
            eventResize={(arg) => void persistMove(arg)}
          />
        </div>

        {selected && (
          <EventDetail
            event={selected.row}
            occurrence={selected.occurrence}
            seriesRule={selected.synthetic ? null : seriesRuleFor(selected)}
            synthetic={selected.synthetic}
            onClose={() => setSelected(null)}
            onEdit={() => requestEdit(selected)}
            onDuplicate={() => requestDuplicate(selected)}
            onDelete={() => void requestDelete(selected)}
          />
        )}

        {!selected && showUpcoming && (
          <UpcomingPanel
            refreshKey={refreshKey}
            onClose={() => setShowUpcoming(false)}
            onOpen={(row, occStart) => {
              setSelected({
                row,
                occurrence: occStart
                  ? {
                      start: occStart,
                      end: new Date(
                        occStart.getTime() +
                          (row.all_day
                            ? 86400_000
                            : new Date(row.end_at!).getTime() - new Date(row.start_at!).getTime()),
                      ),
                    }
                  : null,
              });
            }}
          />
        )}
      </div>

      {canCreate && (
        <button className="fab no-print" aria-label="Add event" onClick={() => openCreate()}>
          ＋
        </button>
      )}

      {undo && (
        <div className="undo-toast no-print" role="status">
          {undo.label}
          <button
            className="btn btn-ghost undo-btn"
            onClick={() => {
              void undo.revert().then(() => {
                setUndo(null);
                afterMutation();
              });
            }}
          >
            Undo
          </button>
        </div>
      )}

      {scopeAsk && (
        <ScopeDialog
          title={scopeAsk.selection.row.title}
          verb={scopeAsk.verb}
          allowFuture={!ruleHasCount(scopeAsk.seriesRule.rrule)}
          onPick={(s) => void onScopePicked(s)}
          onCancel={() => setScopeAsk(null)}
        />
      )}

      {modal.kind === "open" && (
        <EventModal
          mode={modal.mode}
          base={modal.base}
          scope={modal.scope}
          occurrence={modal.occurrence}
          seriesRule={modal.seriesRule}
          prefillStart={modal.prefillStart}
          prefillAllDay={modal.prefillAllDay}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={afterMutation}
        />
      )}
    </div>
  );
}
