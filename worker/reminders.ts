import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rrulestr, type RRule } from "rrule";
import type { Env } from "./lib/util";

// ---------------------------------------------------------------------------
// scheduled — reminder delivery
// ---------------------------------------------------------------------------

interface EventRowLite {
  id: string;
  household_id: string;
  title: string;
  start_at: string | null;
  start_date: string | null;
  all_day: boolean;
  timezone: string;
  status: string;
  deleted_at: string | null;
}

interface ReminderRow {
  id: string;
  household_id: string;
  event_id: string;
  offset_minutes: number;
  scope: "creator" | "household";
  created_by: string;
  events: EventRowLite;
}

interface RecurrenceRow {
  event_id: string;
  rrule: string;
  exdates: string[];
}

/** Grace window: slightly over the cron interval; the delivery key dedupes overlap. */
const WINDOW_MS = 15 * 60 * 1000;
/** All-day events remind relative to this local wall-clock hour. */
const ALL_DAY_HOUR = 9;

/** Convert a local wall-clock time in an IANA zone to a real UTC Date. */
function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  // What local time does our guess correspond to in the target zone?
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const got = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return new Date(guess + (guess - got));
}

/** rrule "fake UTC" mapping (matches the client's expansion semantics). */
function fakeUtcToReal(d: Date, timeZone: string): Date {
  return zonedTimeToUtc(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), timeZone,
  );
}

function occurrenceStartsFor(
  reminder: ReminderRow,
  recurrence: RecurrenceRow | undefined,
  now: number,
): Date[] {
  const event = reminder.events;
  const offsetMs = reminder.offset_minutes * 60_000;
  // Due when: occStart - offset ∈ (now - WINDOW, now]
  const dueLo = now - WINDOW_MS + offsetMs;
  const dueHi = now + offsetMs;

  if (recurrence) {
    let rule: RRule;
    try {
      rule = rrulestr(recurrence.rrule) as RRule;
    } catch {
      return [];
    }
    const ex = new Set(recurrence.exdates.map((x) => new Date(x).toISOString()));
    // Expand in fake-UTC space with a generous bracket, then map to real UTC
    // through the event's timezone and apply the precise due filter.
    const bracketLo = new Date(dueLo - 26 * 3600_000);
    const bracketHi = new Date(dueHi + 26 * 3600_000);
    return rule
      .between(bracketLo, bracketHi, true)
      .map((d) => {
        const real = fakeUtcToReal(d, event.timezone || "UTC");
        return { fake: d, real };
      })
      .filter(({ real }) => {
        const t = real.getTime();
        return t > dueLo && t <= dueHi && !ex.has(real.toISOString());
      })
      .map(({ real }) => real)
      .slice(0, 10);
  }

  let occ: Date | null = null;
  if (event.all_day && event.start_date) {
    const [y, mo, d] = event.start_date.split("-").map(Number);
    occ = zonedTimeToUtc(y, mo, d, ALL_DAY_HOUR, 0, event.timezone || "UTC");
  } else if (event.start_at) {
    occ = new Date(event.start_at);
  }
  if (!occ) return [];
  const t = occ.getTime();
  return t > dueLo && t <= dueHi ? [occ] : [];
}

export async function deliverReminders(env: Env): Promise<void> {
  const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const now = Date.now();

  const { data: reminders, error } = await db
    .from("event_reminders")
    .select("*, events!inner(id, household_id, title, start_at, start_date, all_day, timezone, status, deleted_at)")
    .is("events.deleted_at", null)
    .neq("events.status", "canceled");
  if (error || !reminders) {
    console.log(JSON.stringify({ job: "reminders", ok: false, error: error?.message }));
    return;
  }

  const eventIds = [...new Set((reminders as unknown as ReminderRow[]).map((r) => r.event_id))];
  const recurrenceByEvent = new Map<string, RecurrenceRow>();
  if (eventIds.length) {
    const { data: recs } = await db
      .from("event_recurrence")
      .select("event_id, rrule, exdates")
      .in("event_id", eventIds);
    for (const r of ((recs as RecurrenceRow[]) ?? [])) recurrenceByEvent.set(r.event_id, r);
  }

  // Household members for 'household'-scope reminders.
  const householdIds = [...new Set((reminders as unknown as ReminderRow[]).map((r) => r.household_id))];
  const membersByHousehold = new Map<string, string[]>();
  if (householdIds.length) {
    const { data: mems } = await db
      .from("household_members")
      .select("household_id, user_id")
      .in("household_id", householdIds)
      .eq("status", "active");
    for (const m of ((mems as { household_id: string; user_id: string }[]) ?? [])) {
      const list = membersByHousehold.get(m.household_id) ?? [];
      list.push(m.user_id);
      membersByHousehold.set(m.household_id, list);
    }
  }

  let delivered = 0;
  for (const reminder of reminders as unknown as ReminderRow[]) {
    const occurrences = occurrenceStartsFor(reminder, recurrenceByEvent.get(reminder.event_id), now);
    if (occurrences.length === 0) continue;

    const recipients =
      reminder.scope === "household"
        ? (membersByHousehold.get(reminder.household_id) ?? [])
        : [reminder.created_by];

    for (const occ of occurrences) {
      const occIso = occ.toISOString();
      const deliveries = recipients.map((userId) => ({
        delivery_key: `${reminder.id}:${occIso}:${userId}`,
        reminder_id: reminder.id,
        user_id: userId,
        occurrence_start: occIso,
      }));
      // REM-001: unique delivery key — only rows that actually inserted count.
      const { data: fresh } = await db
        .from("reminder_deliveries")
        .upsert(deliveries, { onConflict: "delivery_key", ignoreDuplicates: true })
        .select("delivery_key, user_id");
      const freshRows = (fresh as { delivery_key: string; user_id: string }[]) ?? [];
      if (freshRows.length === 0) continue;

      const whenText = new Intl.DateTimeFormat("en-US", {
        timeZone: reminder.events.timezone || "UTC",
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }).format(occ);

      await db.from("notifications").insert(
        freshRows.map((f) => ({
          household_id: reminder.household_id,
          user_id: f.user_id,
          kind: "reminder",
          title: `⏰ ${reminder.events.title}`,
          body: reminder.events.all_day ? `All day — ${whenText}` : `Starts ${whenText}`,
          event_id: reminder.event_id,
          occurrence_start: occIso,
        })),
      );
      delivered += freshRows.length;
    }
  }
  console.log(JSON.stringify({ job: "reminders", ok: true, delivered }));
}

