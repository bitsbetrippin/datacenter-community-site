import type { ImportedEvent } from "./ics";
import { addDays } from "./eventUtils";

/**
 * CSV calendar import (v1.0) — handles the standard exports:
 *   * Outlook desktop: File → Open & Export → Import/Export → "Export to a
 *     file" → CSV ("Subject","Start Date","Start Time",…)
 *   * Google Calendar CSV and most other apps using the same column names.
 */

/** Minimal RFC-4180-ish parser: quotes, escaped quotes, CR/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  "subject": "title",
  "title": "title",
  "summary": "title",
  "event name": "title",
  "start date": "startDate",
  "start_date": "startDate",
  "date": "startDate",
  "start time": "startTime",
  "start_time": "startTime",
  "end date": "endDate",
  "end_date": "endDate",
  "end time": "endTime",
  "end_time": "endTime",
  "all day event": "allDay",
  "all_day_event": "allDay",
  "all day": "allDay",
  "description": "description",
  "notes": "description",
  "location": "location",
};

function parseDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const s = dateStr.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); // ISO
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s); // US M/D/Y (Outlook default)
  if (m) {
    const year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return { y: year, m: +m[1], d: +m[2] };
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  return null;
}

function parseTime(timeStr: string): { h: number; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(timeStr.trim());
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  const mer = m[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return { h, min };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function csvToEvents(text: string): { events: ImportedEvent[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { events: [], skipped: 0 };

  const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!header.includes("title") || !header.includes("startDate")) {
    return { events: [], skipped: rows.length - 1 };
  }
  const col = (name: string) => header.indexOf(name);

  const events: ImportedEvent[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const get = (name: string) => {
      const i = col(name);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const title = get("title");
    const sd = parseDateParts(get("startDate"));
    if (!title || !sd) {
      skipped++;
      continue;
    }
    const st = parseTime(get("startTime"));
    const ed = parseDateParts(get("endDate")) ?? sd;
    const et = parseTime(get("endTime"));
    const allDayFlag = /^true$/i.test(get("allDay")) || (!st && !et);

    const startDateStr = `${sd.y}-${pad(sd.m)}-${pad(sd.d)}`;
    const endDateStr = `${ed.y}-${pad(ed.m)}-${pad(ed.d)}`;

    if (allDayFlag) {
      const endEx = endDateStr >= startDateStr ? addDays(endDateStr, 1) : addDays(startDateStr, 1);
      events.push({
        title, description: get("description") || null, location: get("location") || null,
        allDay: true, startAt: null, endAt: null,
        startDate: startDateStr, endDateExclusive: endEx,
        rrule: null, uid: null,
      });
    } else {
      const start = new Date(sd.y, sd.m - 1, sd.d, st?.h ?? 9, st?.min ?? 0);
      let end = new Date(ed.y, ed.m - 1, ed.d, et?.h ?? (st?.h ?? 9) + 1, et?.min ?? st?.min ?? 0);
      if (end <= start) end = new Date(start.getTime() + 3600_000);
      events.push({
        title, description: get("description") || null, location: get("location") || null,
        allDay: false, startAt: start.toISOString(), endAt: end.toISOString(),
        startDate: null, endDateExclusive: null,
        rrule: null, uid: null,
      });
    }
    if (events.length >= 1000) break;
  }
  return { events, skipped };
}

/** Downscale an image file to a Workers-AI-friendly JPEG data URL. */
export function imageToDataUrl(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load"));
    };
    img.src = url;
  });
}
