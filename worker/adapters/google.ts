/**
 * Google Calendar adapter (WP7). REST + OAuth2; incremental sync via
 * syncToken; masters + exceptions with singleEvents=false.
 * Outbound writes use sendUpdates=none so the family's pushes never spam
 * external attendees with Google invite emails.
 */

import type { CanonicalEvent, RemoteChange } from "../lib/canonical";
import { icalStamp, pad, utcToZonedParts, zonedTimeToUtc } from "../lib/util";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface RemoteCalendar {
  id: string;
  name: string;
  color: string | null;
  readOnly: boolean;
  primary: boolean;
}

interface GEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GEvent {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GEventDate;
  end?: GEventDate;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GEventDate;
  updated?: string;
}

class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gfetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function googleListCalendars(token: string): Promise<RemoteCalendar[]> {
  const out: RemoteCalendar[] = [];
  let pageToken = "";
  do {
    const res = await gfetch(token, `/users/me/calendarList?maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    if (!res.ok) throw new GoogleApiError(res.status, "calendar_list_failed");
    const body = (await res.json()) as {
      items?: { id: string; summary: string; backgroundColor?: string; accessRole?: string; primary?: boolean }[];
      nextPageToken?: string;
    };
    for (const it of body.items ?? []) {
      out.push({
        id: it.id,
        name: it.summary,
        color: it.backgroundColor ?? null,
        readOnly: it.accessRole === "reader" || it.accessRole === "freeBusyReader",
        primary: Boolean(it.primary),
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

function toCanonical(e: GEvent, fallbackTz: string): CanonicalEvent {
  const tz = e.start?.timeZone ?? fallbackTz;
  const allDay = Boolean(e.start?.date);
  let rrule: string | null = null;
  const exdates: string[] = [];
  if (e.recurrence && e.recurrence.length > 0) {
    const rruleLine = e.recurrence.find((l) => l.startsWith("RRULE:"));
    if (rruleLine && e.start) {
      // Compose our stored form: DTSTART in fake-UTC of the event's local
      // wall-clock (matches the client's expansion semantics).
      let dtstart: string;
      if (allDay) {
        const [y, mo, d] = e.start.date!.split("-").map(Number);
        dtstart = `DTSTART:${icalStamp(y, mo, d, 0, 0, 0)}`;
      } else {
        const p = utcToZonedParts(new Date(e.start.dateTime!), tz);
        dtstart = `DTSTART:${icalStamp(p.y, p.mo, p.d, p.h, p.mi, 0)}`;
      }
      rrule = `${dtstart}\n${rruleLine}`;
    }
    for (const line of e.recurrence.filter((l) => l.startsWith("EXDATE"))) {
      // EXDATE;TZID=America/Chicago:20260901T153000 (comma-separated allowed)
      const tzidMatch = /TZID=([^:;]+)/.exec(line);
      const exTz = tzidMatch?.[1] ?? tz;
      const values = line.split(":").pop() ?? "";
      for (const v of values.split(",")) {
        const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/.exec(v.trim());
        if (m) {
          const real = m[7] === "Z"
            ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
            : zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), exTz);
          exdates.push(real.toISOString());
        }
      }
    }
  }
  return {
    title: e.summary ?? "(untitled)",
    description: e.description ?? null,
    location: e.location ?? null,
    all_day: allDay,
    start_at: allDay ? null : (e.start?.dateTime ? new Date(e.start.dateTime).toISOString() : null),
    end_at: allDay ? null : (e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : null),
    start_date: allDay ? (e.start?.date ?? null) : null,
    end_date_exclusive: allDay ? (e.end?.date ?? e.start?.date ?? null) : null, // Google end.date is exclusive — matches ours
    timezone: tz,
    status: e.status === "cancelled" ? "canceled" : e.status === "tentative" ? "tentative" : "confirmed",
    rrule,
    exdates,
  };
}

export interface PullResult {
  changes: RemoteChange[];
  nextCursor: string | null;
  fullResyncNeeded: boolean;
}

export async function googlePullEvents(
  token: string,
  calendarId: string,
  cursor: string | null,
  fallbackTz: string,
  horizonDays: number,
): Promise<PullResult> {
  const changes: RemoteChange[] = [];
  let pageToken = "";
  let syncToken: string | null = null;
  let pages = 0;

  do {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    else if (cursor) params.set("syncToken", cursor);
    else {
      // timeMin bounds by event END, so ongoing recurring series are included.
      params.set("timeMin", new Date(Date.now() - horizonDays * 86400_000).toISOString());
      params.set("showDeleted", "true");
    }
    const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    if (res.status === 410) return { changes: [], nextCursor: null, fullResyncNeeded: true };
    if (!res.ok) throw new GoogleApiError(res.status, `events_list_failed_${res.status}`);
    const body = (await res.json()) as {
      items?: GEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const e of body.items ?? []) {
      if (e.recurringEventId) {
        // exception / cancelled single occurrence of a series
        const orig = e.originalStartTime;
        const originalStartAt = orig?.dateTime
          ? new Date(orig.dateTime).toISOString()
          : orig?.date
            ? new Date(`${orig.date}T00:00:00`).toISOString()
            : undefined;
        changes.push({
          remoteId: e.id,
          etag: e.etag ?? null,
          removed: false,
          parentRemoteId: e.recurringEventId,
          originalStartAt,
          occurrenceCancelled: e.status === "cancelled",
          canon: e.status === "cancelled" ? undefined : toCanonical(e, fallbackTz),
        });
      } else if (e.status === "cancelled") {
        changes.push({ remoteId: e.id, etag: e.etag ?? null, removed: true });
      } else {
        changes.push({
          remoteId: e.id,
          etag: e.etag ?? null,
          removed: false,
          canon: toCanonical(e, fallbackTz),
        });
      }
    }
    pageToken = body.nextPageToken ?? "";
    syncToken = body.nextSyncToken ?? syncToken;
    pages++;
  } while (pageToken && pages < 40);

  return { changes, nextCursor: syncToken, fullResyncNeeded: false };
}

function fromCanonical(c: CanonicalEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    summary: c.title,
    description: c.description ?? undefined,
    location: c.location ?? undefined,
    status: c.status === "canceled" ? "cancelled" : c.status,
  };
  if (c.all_day) {
    payload.start = { date: c.start_date };
    payload.end = { date: c.end_date_exclusive };
  } else {
    payload.start = { dateTime: c.start_at, timeZone: c.timezone };
    payload.end = { dateTime: c.end_at, timeZone: c.timezone };
  }
  if (c.rrule) {
    const rruleLine = c.rrule.split("\n").find((l) => l.trim().startsWith("RRULE:"));
    const lines: string[] = rruleLine ? [rruleLine.trim()] : [];
    if (c.exdates.length && !c.all_day) {
      // EXDATE values in the event's zone, matching DTSTART semantics.
      const stamps = c.exdates.map((x) => {
        const p = utcToZonedParts(new Date(x), "UTC");
        return `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}00Z`;
      });
      lines.push(`EXDATE:${stamps.join(",")}`);
    }
    if (lines.length) payload.recurrence = lines;
  }
  return payload;
}

export async function googleCreateEvent(
  token: string, calendarId: string, c: CanonicalEvent,
): Promise<{ remoteId: string; etag: string | null }> {
  const res = await gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(fromCanonical(c)) },
  );
  if (!res.ok) throw new GoogleApiError(res.status, `create_failed_${res.status}`);
  const body = (await res.json()) as { id: string; etag?: string };
  return { remoteId: body.id, etag: body.etag ?? null };
}

export type PushOutcome =
  | { ok: true; etag: string | null }
  | { ok: false; conflict: true; remote: GEvent | null }
  | { ok: false; conflict: false; status: number };

export async function googleUpdateEvent(
  token: string, calendarId: string, remoteId: string, c: CanonicalEvent,
  etag: string | null, force: boolean,
): Promise<PushOutcome> {
  const headers: Record<string, string> = {};
  if (etag && !force) headers["If-Match"] = etag;
  const res = await gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteId)}?sendUpdates=none`,
    { method: "PATCH", body: JSON.stringify(fromCanonical(c)), headers },
  );
  if (res.status === 412 || res.status === 409) {
    const cur = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteId)}`);
    return { ok: false, conflict: true, remote: cur.ok ? ((await cur.json()) as GEvent) : null };
  }
  if (!res.ok) return { ok: false, conflict: false, status: res.status };
  const body = (await res.json()) as { etag?: string };
  return { ok: true, etag: body.etag ?? null };
}

export async function googleDeleteEvent(
  token: string, calendarId: string, remoteId: string,
): Promise<boolean> {
  const res = await gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteId)}?sendUpdates=none`,
    { method: "DELETE" },
  );
  return res.ok || res.status === 404 || res.status === 410;
}

export function googleEventToCanonical(e: unknown, fallbackTz: string): CanonicalEvent {
  return toCanonical(e as GEvent, fallbackTz);
}
