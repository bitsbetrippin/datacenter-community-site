import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import type {
  EventAttendee,
  EventRecurrence,
  EventReminder,
  EventRow,
  EventStatus,
  EventVisibility,
} from "../lib/types";
import {
  COMMON_TIMEZONES,
  addDays,
  toDateInputValue,
  toTimeInputValue,
  validateRange,
} from "../lib/eventUtils";
import {
  DEFAULT_RECURRENCE,
  buildRuleText,
  parseRuleText,
  truncateRuleBefore,
  type RecurrenceForm,
} from "../lib/recurrence";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { AttendeeEditor, attendeeKey, type AttendeeDraft } from "./AttendeeEditor";
import { ReminderEditor, type ReminderDraft } from "./ReminderEditor";
import type { EditScope } from "./ScopeDialog";

export interface EventModalProps {
  mode: "create" | "edit";
  /** Row being edited, or the row being duplicated (in create mode). */
  base?: EventRow | null;
  /** Recurring edit scope (EVT-003). Undefined for non-recurring events. */
  scope?: EditScope;
  /** The clicked occurrence, when editing a repeating event. */
  occurrence?: { start: Date; end: Date } | null;
  /** The series rule for base, when it repeats. */
  seriesRule?: EventRecurrence | null;
  /** Prefill from a clicked slot/date (UI-003). */
  prefillStart?: Date | null;
  prefillAllDay?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EventModal(props: EventModalProps) {
  const {
    mode, base, scope, occurrence, seriesRule,
    prefillStart, prefillAllDay, onClose, onSaved,
  } = props;
  const { user } = useAuth();
  const { household, calendars, categories, refresh } = useHousehold();

  const defaults = useMemo(() => {
    const durationMin = household?.default_event_duration_minutes ?? 60;
    // Editing a specific occurrence (or splitting the series there): use the
    // occurrence's own times, not the series master's.
    if (base && occurrence && (scope === "occurrence" || scope === "future")) {
      return {
        allDay: base.all_day,
        startDate: toDateInputValue(occurrence.start),
        startTime: toTimeInputValue(occurrence.start),
        endDate: toDateInputValue(occurrence.end),
        endTime: toTimeInputValue(occurrence.end),
      };
    }
    if (base) {
      if (base.all_day) {
        return {
          allDay: true,
          startDate: base.start_date ?? toDateInputValue(new Date()),
          startTime: "09:00",
          endDate: base.end_date_exclusive
            ? addDays(base.end_date_exclusive, -1)
            : (base.start_date ?? toDateInputValue(new Date())),
          endTime: "10:00",
        };
      }
      const s = new Date(base.start_at!);
      const e = new Date(base.end_at!);
      return {
        allDay: false,
        startDate: toDateInputValue(s),
        startTime: toTimeInputValue(s),
        endDate: toDateInputValue(e),
        endTime: toTimeInputValue(e),
      };
    }
    const start = prefillStart ?? (() => {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + 1);
      return d;
    })();
    const end = new Date(start.getTime() + durationMin * 60_000);
    return {
      allDay: prefillAllDay ?? false,
      startDate: toDateInputValue(start),
      startTime: toTimeInputValue(start),
      endDate: toDateInputValue(end),
      endTime: toTimeInputValue(end),
    };
  }, [base, occurrence, scope, prefillStart, prefillAllDay, household]);

  const defaultCalendar =
    base?.calendar_id ??
    calendars.find((c) => c.is_default)?.id ??
    calendars[0]?.id ??
    "";

  const [title, setTitle] = useState(base?.title ?? "");
  const [allDay, setAllDay] = useState(defaults.allDay);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [timezone, setTimezone] = useState(
    base?.timezone ?? household?.timezone ?? "America/Chicago",
  );
  const [calendarId, setCalendarId] = useState(defaultCalendar);
  const [categoryId, setCategoryId] = useState(
    // CAT-003 — new events preselect the household default (still overridable)
    base?.category_id ?? household?.default_category_id ?? "",
  );
  const [location, setLocation] = useState(base?.location_text ?? "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [status, setStatus] = useState<EventStatus>(base?.status ?? "confirmed");
  const [visibility, setVisibility] = useState<EventVisibility>(
    base?.visibility ?? "household",
  );
  const [recurrence, setRecurrence] = useState<RecurrenceForm>(
    seriesRule ? parseRuleText(seriesRule.rrule) : DEFAULT_RECURRENCE,
  );
  const [attendees, setAttendees] = useState<AttendeeDraft[]>([]);
  const [initialAttendees, setInitialAttendees] = useState<EventAttendee[]>([]);
  const [reminders, setReminders] = useState<ReminderDraft[]>([]);
  const [initialReminders, setInitialReminders] = useState<EventReminder[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load existing attendees + my reminders when editing or duplicating.
  useEffect(() => {
    if (!base?.id || !user) return;
    let cancelled = false;
    void (async () => {
      const [att, rem] = await Promise.all([
        supabase.from("event_attendees").select("*").eq("event_id", base.id),
        supabase
          .from("event_reminders")
          .select("*")
          .eq("event_id", base.id)
          .eq("created_by", user.id),
      ]);
      if (cancelled) return;
      const attRows = (att.data as EventAttendee[]) ?? [];
      const remRows = (rem.data as EventReminder[]) ?? [];
      const editingSameRow = mode === "edit" && scope !== "occurrence" && scope !== "future";
      setInitialAttendees(editingSameRow ? attRows : []);
      setInitialReminders(editingSameRow ? remRows : []);
      setAttendees(
        attRows.map((a) => ({
          id: editingSameRow ? a.id : undefined,
          member_user_id: a.member_user_id,
          person_id: a.person_id,
          display_name: a.display_name,
          email: a.email,
          attendee_type: a.attendee_type,
          rsvp: a.rsvp,
        })),
      );
      setReminders(
        remRows.map((r) => ({
          id: editingSameRow ? r.id : undefined,
          offset_minutes: r.offset_minutes,
          scope: r.scope,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [base?.id, user, mode, scope]);

  useEffect(() => {
    if (endDate < startDate) setEndDate(startDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  // Escape closes the dialog (accessibility, §19).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof categories>();
    for (const c of categories) {
      const key = c.group_name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [categories]);

  /** Create household contacts for new external attendees; returns drafts with person ids. */
  async function materializeExternals(drafts: AttendeeDraft[]): Promise<AttendeeDraft[]> {
    const out: AttendeeDraft[] = [];
    for (const d of drafts) {
      if (d.isNewExternal && household) {
        const { data } = await supabase
          .from("people")
          .insert({
            household_id: household.id,
            display_name: d.display_name,
            email: d.email,
            created_by: user?.id,
          })
          .select("id")
          .single();
        out.push({ ...d, person_id: (data as { id: string } | null)?.id ?? null, isNewExternal: false });
      } else {
        out.push(d);
      }
    }
    return out;
  }

  async function insertAttendees(eventId: string, drafts: AttendeeDraft[]) {
    if (!household || drafts.length === 0) return;
    await supabase.from("event_attendees").insert(
      drafts.map((d) => ({
        household_id: household.id,
        event_id: eventId,
        member_user_id: d.member_user_id,
        person_id: d.person_id,
        display_name: d.display_name,
        email: d.email,
        attendee_type: d.attendee_type,
      })),
    );
  }

  async function syncAttendees(eventId: string, drafts: AttendeeDraft[]) {
    const currentKeys = new Set(drafts.map(attendeeKey));
    const removed = initialAttendees.filter((a) => !currentKeys.has(attendeeKey(a)));
    if (removed.length > 0) {
      await supabase
        .from("event_attendees")
        .delete()
        .in("id", removed.map((r) => r.id));
    }
    const fresh = drafts.filter((d) => !d.id);
    await insertAttendees(eventId, fresh);
    for (const d of drafts.filter((x) => x.id)) {
      const before = initialAttendees.find((a) => a.id === d.id);
      if (before && before.attendee_type !== d.attendee_type) {
        await supabase
          .from("event_attendees")
          .update({ attendee_type: d.attendee_type })
          .eq("id", d.id);
      }
    }
  }

  async function insertReminders(eventId: string, drafts: ReminderDraft[]) {
    if (!household || !user || drafts.length === 0) return;
    await supabase.from("event_reminders").insert(
      drafts.map((r) => ({
        household_id: household.id,
        event_id: eventId,
        offset_minutes: r.offset_minutes,
        scope: r.scope,
        created_by: user.id,
      })),
    );
  }

  async function syncReminders(eventId: string, drafts: ReminderDraft[]) {
    const keep = new Set(drafts.filter((d) => d.id).map((d) => d.id));
    const removed = initialReminders.filter((r) => !keep.has(r.id));
    if (removed.length > 0) {
      await supabase
        .from("event_reminders")
        .delete()
        .in("id", removed.map((r) => r.id));
    }
    // Changed rows: delete + reinsert (simplest correct diff for 0-5 rows).
    const changed = drafts.filter((d) => {
      if (!d.id) return false;
      const before = initialReminders.find((r) => r.id === d.id);
      return before && (before.offset_minutes !== d.offset_minutes || before.scope !== d.scope);
    });
    if (changed.length > 0) {
      await supabase
        .from("event_reminders")
        .delete()
        .in("id", changed.map((c) => c.id!));
    }
    await insertReminders(eventId, [
      ...drafts.filter((d) => !d.id),
      ...changed.map((c) => ({ offset_minutes: c.offset_minutes, scope: c.scope })),
    ]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!household || !user) return;

    const rangeError = validateRange({ allDay, startDate, startTime, endDate, endTime });
    if (rangeError) return setError(rangeError);
    if (!calendarId) return setError("Pick a calendar.");
    if (recurrence.freq === "weekly" && recurrence.byweekday.length === 0) {
      return setError("Pick at least one weekday for the repeat pattern.");
    }

    setBusy(true);
    setError(null);

    const localStart = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}`);

    const shared = {
      title: title.trim(),
      description: description.trim() || null,
      location_text: location.trim() || null,
      calendar_id: calendarId,
      category_id: categoryId || null,
      timezone,
      all_day: allDay,
      status,
      visibility,
      // Import review rule: saving with a category assigned counts as
      // reviewed — the red outline clears. Without a category it stays.
      needs_attention: base?.needs_attention ? !categoryId : false,
      updated_by: user.id,
      ...(allDay
        ? {
            start_date: startDate,
            end_date_exclusive: addDays(endDate, 1),
            start_at: null,
            end_at: null,
          }
        : {
            start_at: new Date(`${startDate}T${startTime}`).toISOString(),
            end_at: new Date(`${endDate}T${endTime}`).toISOString(),
            start_date: null,
            end_date_exclusive: null,
          }),
    };

    try {
      const drafts = await materializeExternals(attendees);

      if (mode === "edit" && base && scope === "occurrence" && seriesRule && occurrence) {
        // ---- Exception: new concrete row + EXDATE on the series ----------
        const { data, error: err } = await supabase
          .from("events")
          .insert({
            ...shared,
            household_id: household.id,
            created_by: user.id,
            organizer_user_id: base.organizer_user_id ?? user.id,
            recurrence_series_id: seriesRule.series_id,
            original_occurrence_at: occurrence.start.toISOString(),
          })
          .select("id")
          .single();
        if (err) throw err;
        await supabase
          .from("event_recurrence")
          .update({
            exdates: [...seriesRule.exdates, occurrence.start.toISOString()],
          })
          .eq("series_id", seriesRule.series_id);
        await insertAttendees((data as { id: string }).id, drafts.map((d) => ({ ...d, id: undefined })));
        await insertReminders((data as { id: string }).id, reminders.map((r) => ({ ...r, id: undefined })));
      } else if (mode === "edit" && base && scope === "future" && seriesRule && occurrence) {
        // ---- Split: truncate old series, start a new master here ---------
        const { error: e1 } = await supabase
          .from("event_recurrence")
          .update({ rrule: truncateRuleBefore(seriesRule.rrule, occurrence.start) })
          .eq("series_id", seriesRule.series_id);
        if (e1) throw e1;
        const { data, error: e2 } = await supabase
          .from("events")
          .insert({
            ...shared,
            household_id: household.id,
            created_by: user.id,
            organizer_user_id: base.organizer_user_id ?? user.id,
          })
          .select("id")
          .single();
        if (e2) throw e2;
        const newId = (data as { id: string }).id;
        const newRule = buildRuleText(recurrence, localStart);
        if (newRule) {
          await supabase.from("event_recurrence").insert({
            household_id: household.id,
            event_id: newId,
            rrule: newRule,
          });
        }
        await insertAttendees(newId, drafts.map((d) => ({ ...d, id: undefined })));
        await insertReminders(newId, reminders.map((r) => ({ ...r, id: undefined })));
      } else if (mode === "edit" && base) {
        // ---- Plain edit, or whole-series edit -----------------------------
        const { error: err } = await supabase.from("events").update(shared).eq("id", base.id);
        if (err) throw err;
        const ruleText = buildRuleText(recurrence, localStart);
        if (seriesRule && !ruleText) {
          await supabase.from("event_recurrence").delete().eq("series_id", seriesRule.series_id);
        } else if (seriesRule && ruleText && ruleText !== seriesRule.rrule) {
          await supabase
            .from("event_recurrence")
            .update({ rrule: ruleText })
            .eq("series_id", seriesRule.series_id);
        } else if (!seriesRule && ruleText) {
          await supabase.from("event_recurrence").insert({
            household_id: household.id,
            event_id: base.id,
            rrule: ruleText,
          });
        }
        await syncAttendees(base.id, drafts);
        await syncReminders(base.id, reminders);
      } else {
        // ---- Create (including duplicate) ---------------------------------
        const { data, error: err } = await supabase
          .from("events")
          .insert({
            ...shared,
            household_id: household.id,
            created_by: user.id,
            organizer_user_id: user.id,
          })
          .select("id")
          .single();
        if (err) throw err;
        const newId = (data as { id: string }).id;
        const ruleText = buildRuleText(recurrence, localStart);
        if (ruleText) {
          await supabase.from("event_recurrence").insert({
            household_id: household.id,
            event_id: newId,
            rrule: ruleText,
          });
        }
        await insertAttendees(newId, drafts.map((d) => ({ ...d, id: undefined })));
        await insertReminders(newId, reminders.map((r) => ({ ...r, id: undefined })));
      }

      await refresh(); // pick up any new contacts for future pickers
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("chk_timed_shape")
          ? "The end must be after the start."
          : "Could not save the event. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const scopeBanner =
    scope === "occurrence"
      ? "Editing this occurrence only — it becomes independent of the series pattern."
      : scope === "future"
        ? "Editing this and all future occurrences — earlier ones keep the old details."
        : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Event editor">
        <div className="modal-head">
          <h2>{mode === "edit" ? "Edit event" : "New event"}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {scopeBanner && <p className="scope-banner">{scopeBanner}</p>}
        {base?.needs_attention && mode === "edit" && (
          <p className="attention-banner">
            🔎 Imported event — confirm the <strong>time</strong> (or keep it
            all-day) and pick a <strong>category</strong>, then save to clear
            the red outline.
          </p>
        )}
        <form onSubmit={onSubmit} className="stack">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="What's happening?"
              required
              autoFocus
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>

          <div className="row">
            <label>
              Start date
              <input type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            {!allDay && (
              <label>
                Start time
                <input type="time" value={startTime}
                  onChange={(e) => setStartTime(e.target.value)} required />
              </label>
            )}
          </div>
          <div className="row">
            <label>
              End date
              <input type="date" value={endDate} min={startDate}
                onChange={(e) => setEndDate(e.target.value)} required />
            </label>
            {!allDay && (
              <label>
                End time
                <input type="time" value={endTime}
                  onChange={(e) => setEndTime(e.target.value)} required />
              </label>
            )}
          </div>

          <div className="row">
            <label>
              Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— none —</option>
                {[...grouped.entries()].map(([group, cats]) => (
                  <optgroup key={group} label={group}>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Calendar
              <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} required>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          {scope !== "occurrence" && (
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
          )}

          <fieldset className="modal-fieldset">
            <legend>People</legend>
            <AttendeeEditor value={attendees} onChange={setAttendees} />
          </fieldset>

          <fieldset className="modal-fieldset">
            <legend>Reminders</legend>
            <ReminderEditor value={reminders} onChange={setReminders} />
          </fieldset>

          <button
            type="button"
            className="btn btn-ghost more-toggle"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? "Hide details" : "More details…"}
          </button>

          {showMore && (
            <>
              <label>
                Location
                <input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where?" />
              </label>
              <label>
                Description
                <textarea value={description}
                  onChange={(e) => setDescription(e.target.value)} rows={3} />
              </label>
              <div className="row">
                <label>
                  Status
                  <select value={status}
                    onChange={(e) => setStatus(e.target.value as EventStatus)}>
                    <option value="confirmed">Confirmed</option>
                    <option value="tentative">Tentative</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </label>
                <label>
                  Visibility
                  <select value={visibility}
                    onChange={(e) => setVisibility(e.target.value as EventVisibility)}>
                    <option value="household">Household</option>
                    <option value="private">Private (only me)</option>
                  </select>
                </label>
              </div>
              <label>
                Timezone
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
