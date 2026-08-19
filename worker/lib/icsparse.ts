/**
 * iCalendar text → canonical events (Worker-side; used by the ICS feed and
 * CalDAV adapters). Mirrors the client importer's semantics, including the
 * fake-UTC DTSTART composition that keeps recurring wall-clock times stable.
 */
import ICAL from "ical.js";
import type { CanonicalEvent } from "./canonical";
import { icalStamp, pad, utcToZonedParts } from "./util";

export interface ParsedVevent {
  uid: string;
  canon: CanonicalEvent;
}

function localDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseIcsToCanonical(text: string, fallbackTz: string): ParsedVevent[] {
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch {
    return [];
  }
  const out: ParsedVevent[] = [];
  for (const v of comp.getAllSubcomponents("vevent")) {
    try {
      const ev = new ICAL.Event(v);
      if (!ev.startDate || !ev.uid) continue;
      // R4 feeds: recurrence exceptions (RECURRENCE-ID) are skipped; the
      // master's RRULE + EXDATEs carry the series.
      if (v.getFirstProperty("recurrence-id")) continue;

      const isAllDay = ev.startDate.isDate;
      const startJs = ev.startDate.toJSDate(); // real UTC instant
      const endJs = ev.endDate
        ? ev.endDate.toJSDate()
        : new Date(startJs.getTime() + (isAllDay ? 86400_000 : 3600_000));
      const startAny = ev.startDate as unknown as { timezone?: string; zone?: { tzid?: string } };
      const tzid = startAny.timezone ?? startAny.zone?.tzid ?? fallbackTz;
      const tz = !tzid || tzid === "Z" || tzid === "floating" || tzid === "UTC" ? fallbackTz : tzid;

      let rrule: string | null = null;
      const exdates: string[] = [];
      const rruleProp = v.getFirstPropertyValue("rrule");
      if (rruleProp) {
        let dtstartLine: string;
        if (isAllDay) {
          const s = localDateStr(new Date(Date.UTC(
            startJs.getUTCFullYear(), startJs.getUTCMonth(), startJs.getUTCDate())));
          dtstartLine = `DTSTART:${s.replace(/-/g, "")}T000000Z`;
        } else {
          let p;
          try {
            p = utcToZonedParts(startJs, tz);
          } catch {
            p = utcToZonedParts(startJs, "UTC");
          }
          dtstartLine = `DTSTART:${icalStamp(p.y, p.mo, p.d, p.h, p.mi, 0)}`;
        }
        rrule = `${dtstartLine}\nRRULE:${String(rruleProp)}`;
        for (const exProp of v.getAllProperties("exdate")) {
          for (const val of exProp.getValues() as ICAL.Time[]) {
            try {
              exdates.push(val.toJSDate().toISOString());
            } catch {
              /* skip malformed */
            }
          }
        }
      }

      const status = String(v.getFirstPropertyValue("status") ?? "").toUpperCase();

      if (isAllDay) {
        const startStr = String(ev.startDate);
        const endStr = ev.endDate ? String(ev.endDate) : startStr;
        const s = startStr.slice(0, 10);
        let e = endStr.slice(0, 10);
        if (e <= s) {
          const d = new Date(`${s}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          e = localDateStr(d);
        }
        out.push({
          uid: ev.uid,
          canon: {
            title: ev.summary || "(untitled)",
            description: ev.description || null,
            location: ev.location || null,
            all_day: true,
            start_at: null,
            end_at: null,
            start_date: s,
            end_date_exclusive: e,
            timezone: tz,
            status: status === "CANCELLED" ? "canceled" : status === "TENTATIVE" ? "tentative" : "confirmed",
            rrule,
            exdates,
          },
        });
      } else {
        out.push({
          uid: ev.uid,
          canon: {
            title: ev.summary || "(untitled)",
            description: ev.description || null,
            location: ev.location || null,
            all_day: false,
            start_at: startJs.toISOString(),
            end_at: (endJs > startJs ? endJs : new Date(startJs.getTime() + 3600_000)).toISOString(),
            start_date: null,
            end_date_exclusive: null,
            timezone: tz,
            status: status === "CANCELLED" ? "canceled" : status === "TENTATIVE" ? "tentative" : "confirmed",
            rrule,
            exdates,
          },
        });
      }
    } catch {
      continue; // one bad VEVENT never kills the whole feed
    }
  }
  return out;
}

/** Canonical event → a VCALENDAR/VEVENT document for CalDAV PUT. */
export function buildVeventIcs(c: CanonicalEvent, uid: string): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const utcStamp = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Calendar//R4//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `SUMMARY:${esc(c.title)}`,
  ];
  if (c.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${c.start_date!.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${c.end_date_exclusive!.replace(/-/g, "")}`);
  } else {
    lines.push(`DTSTART:${utcStamp(c.start_at!)}`);
    lines.push(`DTEND:${utcStamp(c.end_at!)}`);
  }
  if (c.rrule) {
    const rr = c.rrule.split("\n").find((l) => l.trim().startsWith("RRULE:"));
    if (rr) lines.push(rr.trim());
    for (const ex of c.exdates) lines.push(`EXDATE:${utcStamp(ex)}`);
  }
  if (c.description) lines.push(`DESCRIPTION:${esc(c.description)}`);
  if (c.location) lines.push(`LOCATION:${esc(c.location)}`);
  lines.push(`STATUS:${c.status === "canceled" ? "CANCELLED" : c.status.toUpperCase()}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
