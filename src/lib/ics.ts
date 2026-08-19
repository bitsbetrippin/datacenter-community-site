import ICAL from "ical.js";
import type { EventRecurrence, EventRow } from "./types";
import { addDays } from "./eventUtils";
import { rrulePropertyLine } from "./recurrence";

/**
 * ICS import/export (§12 Must; WP9 file profile).
 * Runs client-side: parsing happens in the browser and inserts go through the
 * user's own session, so RLS applies to imported rows exactly like manual ones.
 */

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toUtcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateStamp(d: string): string {
  return d.replace(/-/g, "");
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines longer than 75 octets should be folded.
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function buildIcs(
  events: EventRow[],
  recurrenceByEventId: Map<string, EventRecurrence>,
  calendarName: string,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Calendar//R2//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@family-calendar`);
    lines.push(`DTSTAMP:${toUtcStamp(e.updated_at ?? e.created_at)}`);
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(e.start_date!)}`);
      lines.push(`DTEND;VALUE=DATE:${dateStamp(e.end_date_exclusive!)}`);
    } else {
      lines.push(`DTSTART:${toUtcStamp(e.start_at!)}`);
      lines.push(`DTEND:${toUtcStamp(e.end_at!)}`);
    }
    const rec = recurrenceByEventId.get(e.id);
    if (rec) {
      const rr = rrulePropertyLine(rec.rrule);
      if (rr) lines.push(rr);
      for (const ex of rec.exdates) lines.push(`EXDATE:${toUtcStamp(ex)}`);
    }
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location_text) lines.push(`LOCATION:${icsEscape(e.location_text)}`);
    lines.push(`STATUS:${e.status === "canceled" ? "CANCELLED" : e.status.toUpperCase()}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportedEvent {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startAt: string | null;   // ISO for timed
  endAt: string | null;
  startDate: string | null; // YYYY-MM-DD for all-day
  endDateExclusive: string | null;
  rrule: string | null;     // full "DTSTART…\nRRULE:…" text, storage-ready
  uid: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseIcs(text: string): ImportedEvent[] {
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const out: ImportedEvent[] = [];
  for (const v of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    if (!ev.startDate) continue;
    const isAllDay = ev.startDate.isDate;
    const start = ev.startDate.toJSDate();
    const end = ev.endDate
      ? ev.endDate.toJSDate()
      : new Date(start.getTime() + (isAllDay ? 86400_000 : 3600_000));

    let rruleText: string | null = null;
    const rruleProp = v.getFirstPropertyValue("rrule");
    if (rruleProp) {
      const dt = isAllDay
        ? `DTSTART;VALUE=DATE:${dateStamp(
            `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
          )}`
        : `DTSTART:${toUtcStamp(start.toISOString())}`;
      rruleText = `${dt}\nRRULE:${String(rruleProp)}`;
    }

    if (isAllDay) {
      const s = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      let e = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
      if (e <= s) e = addDays(s, 1);
      out.push({
        title: ev.summary || "(untitled)",
        description: ev.description || null,
        location: ev.location || null,
        allDay: true,
        startAt: null,
        endAt: null,
        startDate: s,
        endDateExclusive: e,
        rrule: rruleText,
        uid: ev.uid || null,
      });
    } else {
      out.push({
        title: ev.summary || "(untitled)",
        description: ev.description || null,
        location: ev.location || null,
        allDay: false,
        startAt: start.toISOString(),
        endAt: end > start ? end.toISOString() : new Date(start.getTime() + 3600_000).toISOString(),
        startDate: null,
        endDateExclusive: null,
        rrule: rruleText,
        uid: ev.uid || null,
      });
    }
  }
  return out;
}
