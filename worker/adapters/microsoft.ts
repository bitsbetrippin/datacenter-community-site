/**
 * Microsoft 365 / Outlook adapter (WP8). Graph REST + OAuth2; delta sync;
 * change notifications (subscriptions) with lifecycle renewal.
 * Recurrence: patternedRecurrence ↔ RRULE for the common household patterns
 * (daily, weekly, monthly-by-day, yearly, nth-weekday monthly).
 */

import type { CanonicalEvent, RemoteChange } from "../lib/canonical";
import { icalStamp, utcToZonedParts } from "../lib/util";

const BASE = "https://graph.microsoft.com/v1.0";

export interface RemoteCalendar {
  id: string;
  name: string;
  color: string | null;
  readOnly: boolean;
  primary: boolean;
}

class GraphApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function mfetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function msListCalendars(token: string): Promise<RemoteCalendar[]> {
  const out: RemoteCalendar[] = [];
  let url: string | null = "/me/calendars?$top=50";
  while (url) {
    const res = await mfetch(token, url);
    if (!res.ok) throw new GraphApiError(res.status, "calendar_list_failed");
    const body = (await res.json()) as {
      value?: { id: string; name: string; canEdit?: boolean; isDefaultCalendar?: boolean; hexColor?: string }[];
      "@odata.nextLink"?: string;
    };
    for (const it of body.value ?? []) {
      out.push({
        id: it.id,
        name: it.name,
        color: it.hexColor && it.hexColor !== "" ? it.hexColor : null,
        readOnly: it.canEdit === false,
        primary: Boolean(it.isDefaultCalendar),
      });
    }
    url = body["@odata.nextLink"] ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recurrence conversion
// ---------------------------------------------------------------------------

const DOW = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DOW_ICAL = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const INDEX_NAMES = ["first", "second", "third", "fourth", "last"];
const INDEX_NUM: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

interface MsRecurrence {
  pattern: {
    type: string;
    interval: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    month?: number;
    index?: string;
  };
  range: {
    type: string;
    startDate: string;
    endDate?: string;
    numberOfOccurrences?: number;
  };
}

/** Graph recurrence → our stored DTSTART+RRULE text. Null when unsupported. */
export function msRecurrenceToRule(
  rec: MsRecurrence, startLocal: { y: number; mo: number; d: number; h: number; mi: number },
): string | null {
  const p = rec.pattern;
  const parts: string[] = [];
  const interval = Math.max(1, p.interval || 1);
  switch (p.type) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly": {
      parts.push("FREQ=WEEKLY");
      const days = (p.daysOfWeek ?? [])
        .map((d) => DOW_ICAL[DOW.indexOf(d.toLowerCase())])
        .filter(Boolean);
      if (days.length) parts.push(`BYDAY=${days.join(",")}`);
      break;
    }
    case "absoluteMonthly":
      parts.push("FREQ=MONTHLY");
      if (p.dayOfMonth) parts.push(`BYMONTHDAY=${p.dayOfMonth}`);
      break;
    case "relativeMonthly": {
      parts.push("FREQ=MONTHLY");
      const day = (p.daysOfWeek ?? [])[0];
      const idx = INDEX_NUM[(p.index ?? "first").toLowerCase()];
      if (!day || idx === undefined) return null;
      parts.push(`BYDAY=${idx}${DOW_ICAL[DOW.indexOf(day.toLowerCase())]}`);
      break;
    }
    case "absoluteYearly":
      parts.push("FREQ=YEARLY");
      if (p.month) parts.push(`BYMONTH=${p.month}`);
      if (p.dayOfMonth) parts.push(`BYMONTHDAY=${p.dayOfMonth}`);
      break;
    default:
      return null; // relativeYearly and exotic patterns → unsupported in R3
  }
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (rec.range.type === "numbered" && rec.range.numberOfOccurrences) {
    parts.push(`COUNT=${rec.range.numberOfOccurrences}`);
  } else if (rec.range.type === "endDate" && rec.range.endDate) {
    const [y, mo, d] = rec.range.endDate.split("-").map(Number);
    parts.push(`UNTIL=${icalStamp(y, mo, d, 23, 59, 59)}`);
  }
  const s = startLocal;
  return `DTSTART:${icalStamp(s.y, s.mo, s.d, s.h, s.mi, 0)}\nRRULE:${parts.join(";")}`;
}

/** Our RRULE text → Graph recurrence. Null when the rule doesn't map. */
export function ruleToMsRecurrence(ruleText: string, startDate: string, tz: string): MsRecurrence | null {
  const rr = ruleText.split("\n").find((l) => l.trim().startsWith("RRULE:"));
  if (!rr) return null;
  const opts = Object.fromEntries(
    rr.trim().slice(6).split(";").map((kv) => kv.split("=") as [string, string]),
  );
  const interval = Number(opts.INTERVAL ?? "1");
  let pattern: MsRecurrence["pattern"] | null = null;

  const parseByday = (v: string) =>
    v.split(",").map((tok) => {
      const m = /^(-?\d)?([A-Z]{2})$/.exec(tok.trim());
      return m ? { idx: m[1] ? Number(m[1]) : null, day: DOW[DOW_ICAL.indexOf(m[2])] } : null;
    });

  switch (opts.FREQ) {
    case "DAILY":
      pattern = { type: "daily", interval };
      break;
    case "WEEKLY": {
      const days = opts.BYDAY
        ? (parseByday(opts.BYDAY).filter(Boolean) as { day: string }[]).map((x) => x.day)
        : [DOW[(new Date(`${startDate}T00:00:00`).getDay() + 6) % 7]];
      pattern = { type: "weekly", interval, daysOfWeek: days };
      break;
    }
    case "MONTHLY": {
      if (opts.BYDAY) {
        const tok = parseByday(opts.BYDAY)[0];
        if (!tok || tok.idx === null) return null;
        pattern = {
          type: "relativeMonthly", interval,
          daysOfWeek: [tok.day],
          index: INDEX_NAMES[tok.idx === -1 ? 4 : tok.idx - 1],
        };
      } else {
        pattern = {
          type: "absoluteMonthly", interval,
          dayOfMonth: Number(opts.BYMONTHDAY ?? startDate.slice(8, 10)),
        };
      }
      break;
    }
    case "YEARLY":
      pattern = {
        type: "absoluteYearly", interval,
        month: Number(opts.BYMONTH ?? startDate.slice(5, 7)),
        dayOfMonth: Number(opts.BYMONTHDAY ?? startDate.slice(8, 10)),
      };
      break;
    default:
      return null;
  }

  const range: MsRecurrence["range"] = { type: "noEnd", startDate };
  if (opts.COUNT) {
    range.type = "numbered";
    range.numberOfOccurrences = Number(opts.COUNT);
  } else if (opts.UNTIL) {
    range.type = "endDate";
    const u = opts.UNTIL;
    range.endDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
  }
  // Graph requires recurrenceTimeZone on some tenants; harmless to include.
  (range as Record<string, unknown>).recurrenceTimeZone = tz;
  return { pattern, range };
}

// ---------------------------------------------------------------------------
// Events (delta pull + push)
// ---------------------------------------------------------------------------

interface MsEvent {
  id: string;
  "@odata.etag"?: string;
  "@removed"?: { reason: string };
  type?: string; // singleInstance | seriesMaster | occurrence | exception
  subject?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  originalStartTimeZone?: string;
  recurrence?: MsRecurrence | null;
  seriesMasterId?: string;
  originalStart?: string;
  lastModifiedDateTime?: string;
}

function graphDateToIso(v: { dateTime: string; timeZone: string } | undefined): string | null {
  if (!v) return null;
  // Delta returns UTC; be defensive about the marker.
  const dt = v.dateTime.replace(/\.\d+$/, "");
  if (v.timeZone === "UTC" || v.timeZone === "tzone://Microsoft/UTC") {
    return new Date(`${dt}Z`).toISOString();
  }
  return new Date(`${dt}Z`).toISOString(); // non-UTC unexpected under delta; treat as UTC
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+\n/g, "\n").trim();
}

function toCanonical(e: MsEvent, fallbackTz: string): CanonicalEvent {
  const tz = e.originalStartTimeZone && e.originalStartTimeZone !== "UTC"
    ? e.originalStartTimeZone
    : fallbackTz;
  const allDay = Boolean(e.isAllDay);
  const startIso = graphDateToIso(e.start);
  const endIso = graphDateToIso(e.end);

  let rrule: string | null = null;
  if (e.recurrence && startIso) {
    const startLocal = utcToZonedParts(new Date(startIso), tz);
    rrule = msRecurrenceToRule(e.recurrence, startLocal);
  }
  const rawBody =
    e.body?.contentType === "html"
      ? stripHtml(e.body.content ?? "")
      : (e.body?.content ?? e.bodyPreview ?? "");

  return {
    title: e.subject ?? "(untitled)",
    description: rawBody.trim() ? rawBody.trim().slice(0, 4000) : null,
    location: e.location?.displayName || null,
    all_day: allDay,
    start_at: allDay ? null : startIso,
    end_at: allDay ? null : endIso,
    start_date: allDay && startIso ? startIso.slice(0, 10) : null,
    end_date_exclusive: allDay && endIso ? endIso.slice(0, 10) : null, // Graph all-day end is exclusive — matches
    timezone: tz,
    status: e.isCancelled ? "canceled" : e.showAs === "tentative" ? "tentative" : "confirmed",
    rrule,
    exdates: [],
  };
}

export interface PullResult {
  changes: RemoteChange[];
  nextCursor: string | null;
  fullResyncNeeded: boolean;
}

export async function msPullEvents(
  token: string,
  calendarId: string,
  cursor: string | null,
  fallbackTz: string,
): Promise<PullResult> {
  const changes: RemoteChange[] = [];
  let url = cursor ?? `/me/calendars/${encodeURIComponent(calendarId)}/events/delta`;
  let next: string | null = null;
  let pages = 0;

  while (url && pages < 40) {
    const res = await mfetch(token, url, {
      headers: { Prefer: 'odata.maxpagesize=50, outlook.body-content-type="text"' },
    });
    if (res.status === 410) return { changes: [], nextCursor: null, fullResyncNeeded: true };
    if (!res.ok) throw new GraphApiError(res.status, `delta_failed_${res.status}`);
    const body = (await res.json()) as {
      value?: MsEvent[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };
    for (const e of body.value ?? []) {
      if (e["@removed"]) {
        changes.push({ remoteId: e.id, etag: null, removed: true });
        continue;
      }
      if (e.type === "occurrence") continue; // generated instances — masters carry the truth
      if (e.type === "exception") {
        changes.push({
          remoteId: e.id,
          etag: e["@odata.etag"] ?? null,
          removed: false,
          parentRemoteId: e.seriesMasterId,
          originalStartAt: e.originalStart ? new Date(e.originalStart).toISOString() : undefined,
          occurrenceCancelled: Boolean(e.isCancelled),
          canon: e.isCancelled ? undefined : toCanonical(e, fallbackTz),
        });
        continue;
      }
      changes.push({
        remoteId: e.id,
        etag: e["@odata.etag"] ?? null,
        removed: false,
        canon: toCanonical(e, fallbackTz),
      });
    }
    next = body["@odata.deltaLink"] ?? null;
    url = body["@odata.nextLink"] ?? "";
    pages++;
  }
  return { changes, nextCursor: next, fullResyncNeeded: false };
}

function fromCanonical(c: CanonicalEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    subject: c.title,
    body: { contentType: "text", content: c.description ?? "" },
    location: { displayName: c.location ?? "" },
    isAllDay: c.all_day,
    showAs: c.status === "tentative" ? "tentative" : "busy",
  };
  if (c.all_day) {
    payload.start = { dateTime: `${c.start_date}T00:00:00`, timeZone: c.timezone };
    payload.end = { dateTime: `${c.end_date_exclusive}T00:00:00`, timeZone: c.timezone };
  } else {
    payload.start = { dateTime: c.start_at!.replace("Z", ""), timeZone: "UTC" };
    payload.end = { dateTime: c.end_at!.replace("Z", ""), timeZone: "UTC" };
  }
  if (c.rrule) {
    const startDate = c.all_day ? c.start_date! : c.start_at!.slice(0, 10);
    const rec = ruleToMsRecurrence(c.rrule, startDate, c.timezone);
    if (rec) payload.recurrence = rec;
  }
  return payload;
}

export async function msCreateEvent(
  token: string, calendarId: string, c: CanonicalEvent,
): Promise<{ remoteId: string; etag: string | null }> {
  const res = await mfetch(token, `/me/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(fromCanonical(c)),
  });
  if (!res.ok) throw new GraphApiError(res.status, `create_failed_${res.status}`);
  const body = (await res.json()) as { id: string; "@odata.etag"?: string };
  return { remoteId: body.id, etag: body["@odata.etag"] ?? null };
}

export type PushOutcome =
  | { ok: true; etag: string | null }
  | { ok: false; conflict: true; remote: unknown | null }
  | { ok: false; conflict: false; status: number };

export async function msUpdateEvent(
  token: string, remoteId: string, c: CanonicalEvent, etag: string | null, force: boolean,
): Promise<PushOutcome> {
  const headers: Record<string, string> = {};
  if (etag && !force) headers["If-Match"] = etag;
  const res = await mfetch(token, `/me/events/${encodeURIComponent(remoteId)}`, {
    method: "PATCH",
    body: JSON.stringify(fromCanonical(c)),
    headers,
  });
  if (res.status === 412 || res.status === 409) {
    const cur = await mfetch(token, `/me/events/${encodeURIComponent(remoteId)}`, {
      headers: { Prefer: 'outlook.body-content-type="text"' },
    });
    return { ok: false, conflict: true, remote: cur.ok ? await cur.json() : null };
  }
  if (!res.ok) return { ok: false, conflict: false, status: res.status };
  const body = (await res.json()) as { "@odata.etag"?: string };
  return { ok: true, etag: body["@odata.etag"] ?? null };
}

export async function msDeleteEvent(token: string, remoteId: string): Promise<boolean> {
  const res = await mfetch(token, `/me/events/${encodeURIComponent(remoteId)}`, { method: "DELETE" });
  return res.ok || res.status === 404 || res.status === 410;
}

export function msEventToCanonical(e: unknown, fallbackTz: string): CanonicalEvent {
  return toCanonical(e as MsEvent, fallbackTz);
}

// ---------------------------------------------------------------------------
// Change notifications (SYNC-004)
// ---------------------------------------------------------------------------

export async function msCreateSubscription(
  token: string, calendarId: string, notificationUrl: string, clientState: string,
): Promise<{ id: string; expiresAt: string } | null> {
  const res = await mfetch(token, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl,
      resource: `/me/calendars/${calendarId}/events`,
      expirationDateTime: new Date(Date.now() + 4000 * 60_000).toISOString(), // ≈2.8 days
      clientState,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id: string; expirationDateTime: string };
  return { id: body.id, expiresAt: body.expirationDateTime };
}

export async function msRenewSubscription(
  token: string, subscriptionId: string,
): Promise<string | null> {
  const res = await mfetch(token, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      expirationDateTime: new Date(Date.now() + 4000 * 60_000).toISOString(),
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { expirationDateTime: string };
  return body.expirationDateTime;
}
