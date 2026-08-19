import type { Category, EventRow } from "./types";

/**
 * CAL-003 — pick a readable foreground for a category color automatically
 * (unless the category defines an explicit override).
 */
export function readableForeground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1b1f27";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // WCAG-ish relative luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#1b1f27" : "#ffffff";
}

/** EVT-001 — end must follow start. Returns an error message or null. */
export function validateRange(input: {
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}): string | null {
  if (!input.startDate) return "A start date is required.";
  if (!input.endDate) return "An end date is required.";
  if (input.allDay) {
    if (input.endDate < input.startDate) {
      return "The end date must be on or after the start date.";
    }
    return null;
  }
  if (!input.startTime) return "A start time is required (or mark the event All day).";
  if (!input.endTime) return "An end time is required (or mark the event All day).";
  const start = new Date(`${input.startDate}T${input.startTime}`);
  const end = new Date(`${input.endDate}T${input.endTime}`);
  if (!(end.getTime() > start.getTime())) {
    return "The end must be after the start.";
  }
  return null;
}

/** Add days to a YYYY-MM-DD string (all-day end dates are exclusive). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface CalendarDisplayEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  classNames: string[];
  extendedProps: { row: EventRow };
}

/**
 * Map a canonical event row to a FullCalendar event, applying the category
 * color bubble and the distinct visual states required by CAL-005.
 */
export function toDisplayEvent(
  row: EventRow,
  categoriesById: Map<string, Category>,
): CalendarDisplayEvent {
  const category = row.category_id ? categoriesById.get(row.category_id) : undefined;
  const color = category?.color ?? "#64748b";
  const text = category?.foreground ?? readableForeground(color);

  const classNames: string[] = ["evt"];
  if (row.status === "canceled") classNames.push("evt-canceled");
  if (row.status === "tentative") classNames.push("evt-tentative");
  if (row.visibility === "private") classNames.push("evt-private");

  return {
    id: row.id,
    title: row.title,
    start: row.all_day ? row.start_date! : row.start_at!,
    end: row.all_day ? row.end_date_exclusive! : row.end_at!,
    allDay: row.all_day,
    backgroundColor: color,
    borderColor: color,
    textColor: text,
    classNames,
    extendedProps: { row },
  };
}

/** A small curated IANA list for the R1 timezone picker (§10, TIME-001). */
export const COMMON_TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];
