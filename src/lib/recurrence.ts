import { RRule, RRuleSet, rrulestr, Weekday } from "rrule";

/**
 * Recurrence helpers (§10).
 *
 * Storage format: the iCalendar text produced by rrule's toString(), i.e.
 *   DTSTART:20260901T140000Z
 *   RRULE:FREQ=WEEKLY;BYDAY=TU
 * which round-trips to .ics import/export directly.
 *
 * DST correctness (TIME-002): rrule computes in UTC, so we expand using the
 * "fake UTC" technique — local wall-clock components are written into a UTC
 * date before expansion and read back out after. A 3:30pm Tuesday practice
 * stays 3:30pm local across DST transitions.
 */

/** Build a Date whose UTC fields equal the local wall-clock fields of d. */
export function localToFakeUtc(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds(),
    ),
  );
}

/** Inverse of localToFakeUtc. */
export function fakeUtcToLocal(d: Date): Date {
  return new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  );
}

export type RecurrenceFreq =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "yearly";

export interface RecurrenceForm {
  freq: RecurrenceFreq;
  interval: number;
  /** 0=Mon … 6=Sun (rrule convention) — used when freq is weekly */
  byweekday: number[];
  ends: "never" | "count" | "until";
  count: number;
  until: string; // YYYY-MM-DD
}

export const DEFAULT_RECURRENCE: RecurrenceForm = {
  freq: "none",
  interval: 1,
  byweekday: [],
  ends: "never",
  count: 10,
  until: "",
};

const FREQ_MAP = {
  daily: RRule.DAILY,
  weekdays: RRule.WEEKLY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
} as const;

/** Build the stored rrule text from the form + the event's local start. */
export function buildRuleText(form: RecurrenceForm, localStart: Date): string | null {
  if (form.freq === "none") return null;
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: FREQ_MAP[form.freq],
    interval: Math.max(1, form.interval),
    dtstart: localToFakeUtc(localStart),
  };
  if (form.freq === "weekdays") {
    options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  } else if (form.freq === "weekly" && form.byweekday.length > 0) {
    options.byweekday = form.byweekday.map((n) => new Weekday(n));
  }
  if (form.ends === "count") options.count = Math.max(1, form.count);
  if (form.ends === "until" && form.until) {
    options.until = localToFakeUtc(new Date(`${form.until}T23:59:59`));
  }
  return new RRule(options).toString();
}

/** Parse stored rrule text back into the editor form (best effort). */
export function parseRuleText(text: string): RecurrenceForm {
  const rule = rrulestr(text) as RRule;
  const o = rule.origOptions;
  const form: RecurrenceForm = { ...DEFAULT_RECURRENCE };
  const bydays = Array.isArray(o.byweekday)
    ? o.byweekday.map((w) => (w instanceof Weekday ? w.weekday : Number(w)))
    : o.byweekday != null
      ? [o.byweekday instanceof Weekday ? o.byweekday.weekday : Number(o.byweekday)]
      : [];
  if (o.freq === RRule.DAILY) form.freq = "daily";
  else if (o.freq === RRule.WEEKLY) {
    form.freq =
      bydays.length === 5 && [0, 1, 2, 3, 4].every((d) => bydays.includes(d))
        ? "weekdays"
        : "weekly";
    form.byweekday = bydays;
  } else if (o.freq === RRule.MONTHLY) form.freq = "monthly";
  else if (o.freq === RRule.YEARLY) form.freq = "yearly";
  form.interval = o.interval ?? 1;
  if (o.count) {
    form.ends = "count";
    form.count = o.count;
  } else if (o.until) {
    form.ends = "until";
    const u = fakeUtcToLocal(o.until);
    form.until = `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`;
  }
  return form;
}

/** Human description, e.g. "every week on Tuesday". */
export function describeRule(text: string): string {
  try {
    return (rrulestr(text) as RRule).toText();
  } catch {
    return "repeats";
  }
}

export function ruleHasCount(text: string): boolean {
  try {
    return Boolean((rrulestr(text) as RRule).origOptions.count);
  } catch {
    return false;
  }
}

/**
 * Expand occurrence start times (as real local Dates) within [rangeStart,
 * rangeEnd), excluding exdates.
 */
export function expandOccurrences(
  ruleText: string,
  exdates: string[],
  rangeStart: Date,
  rangeEnd: Date,
  limit = 400,
): Date[] {
  let rule: RRule | RRuleSet;
  try {
    rule = rrulestr(ruleText, { forceset: false });
  } catch {
    return [];
  }
  const ex = new Set(
    exdates.map((d) => localToFakeUtc(new Date(d)).getTime()),
  );
  const between = rule.between(
    localToFakeUtc(rangeStart),
    localToFakeUtc(rangeEnd),
    true,
  );
  return between
    .filter((d) => !ex.has(d.getTime()))
    .slice(0, limit)
    .map(fakeUtcToLocal);
}

/** Next occurrence at/after `from`, or null. */
export function nextOccurrence(
  ruleText: string,
  exdates: string[],
  from: Date,
): Date | null {
  try {
    const rule = rrulestr(ruleText) as RRule;
    const ex = new Set(exdates.map((d) => localToFakeUtc(new Date(d)).getTime()));
    let probe = localToFakeUtc(from);
    for (let i = 0; i < 100; i++) {
      const next = rule.after(probe, true);
      if (!next) return null;
      if (!ex.has(next.getTime())) return fakeUtcToLocal(next);
      probe = new Date(next.getTime() + 1000);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Rewrite a rule so it ends just before `cutLocal` (used by "this and future
 * occurrences": the old series is truncated, a new series starts at the cut).
 */
export function truncateRuleBefore(ruleText: string, cutLocal: Date): string {
  const rule = rrulestr(ruleText) as RRule;
  const options = { ...rule.origOptions };
  delete options.count;
  options.until = new Date(localToFakeUtc(cutLocal).getTime() - 1000);
  return new RRule(options).toString();
}

/** Re-anchor a rule's DTSTART to a new local start (for the new split series). */
export function reanchorRule(ruleText: string, newLocalStart: Date): string {
  const rule = rrulestr(ruleText) as RRule;
  const options = { ...rule.origOptions };
  options.dtstart = localToFakeUtc(newLocalStart);
  return new RRule(options).toString();
}

/** Extract just the RRULE:... line for .ics export. */
export function rrulePropertyLine(ruleText: string): string | null {
  const line = ruleText
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("RRULE:"));
  return line ?? null;
}
