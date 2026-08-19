/**
 * Generic CalDAV adapter foundation (WP9, RFC 4791). Basic/app-password auth.
 * Discovery → calendar listing → ctag-gated pulls with etag diffing →
 * PUT/DELETE pushes where the server permits.
 *
 * XML handling is namespace-tolerant pattern extraction: CalDAV multistatus
 * responses are highly regular, and this keeps the Worker dependency-free.
 */
import type { CanonicalEvent, RemoteChange } from "../lib/canonical";
import { parseIcsToCanonical, buildVeventIcs } from "../lib/icsparse";

export interface CaldavAccount {
  baseUrl: string;   // e.g. https://dav.example.com/ or a full calendar home URL
  username: string;
  password: string;
}

function authHeader(a: CaldavAccount): string {
  return `Basic ${btoa(`${a.username}:${a.password}`)}`;
}

async function dav(
  a: CaldavAccount, method: string, url: string, depth: string | null, body: string | null,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      authorization: authHeader(a),
      "content-type": "application/xml; charset=utf-8",
      ...(depth !== null ? { depth } : {}),
      ...extraHeaders,
    },
    body,
  });
}

function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Pull out simple tag values regardless of namespace prefix. */
function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function splitResponses(xml: string): string[] {
  const re = /<(?:[A-Za-z0-9_-]+:)?response[ >][\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/gi;
  return xml.match(re) ?? [];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#13;/g, "\r").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Discovery + calendar listing
// ---------------------------------------------------------------------------

export interface CaldavCalendar {
  id: string;    // absolute collection URL
  name: string;
  color: string | null;
  readOnly: boolean;
  primary: boolean;
}

export async function caldavDiscoverCalendars(a: CaldavAccount): Promise<CaldavCalendar[]> {
  // Step 1: find the principal (fall back to the given URL itself).
  let principal = a.baseUrl;
  const p1 = await dav(a, "PROPFIND", a.baseUrl, "0",
    `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>`);
  if (p1.ok || p1.status === 207) {
    const href = tagValues(tagValues(await p1.text(), "current-user-principal").join(""), "href")[0];
    if (href) principal = absolutize(a.baseUrl, href);
  } else if (p1.status === 401) {
    throw new Error("caldav_auth_failed");
  }

  // Step 2: calendar home.
  let home = principal;
  const p2 = await dav(a, "PROPFIND", principal, "0",
    `<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><prop><c:calendar-home-set/></prop></propfind>`);
  if (p2.ok || p2.status === 207) {
    const href = tagValues(tagValues(await p2.text(), "calendar-home-set").join(""), "href")[0];
    if (href) home = absolutize(principal, href);
  }

  // Step 3: list collections; keep VEVENT-capable calendars.
  const p3 = await dav(a, "PROPFIND", home, "1",
    `<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/"><prop><resourcetype/><displayname/><cs:getctag/><c:supported-calendar-component-set/><ic:calendar-color/></prop></propfind>`);
  if (!(p3.ok || p3.status === 207)) throw new Error(`caldav_list_failed_${p3.status}`);
  const xml = await p3.text();

  const out: CaldavCalendar[] = [];
  for (const resp of splitResponses(xml)) {
    if (!/<(?:[A-Za-z0-9_-]+:)?calendar\s*\/?\s*>/i.test(resp)) continue; // resourcetype must include calendar
    const comps = resp.match(/comp\s+name="([A-Z]+)"/gi) ?? [];
    if (comps.length > 0 && !comps.some((c) => /VEVENT/i.test(c))) continue;
    const href = tagValues(resp, "href")[0];
    if (!href) continue;
    const name = decodeEntities(tagValues(resp, "displayname")[0] ?? "Calendar");
    const colorRaw = tagValues(resp, "calendar-color")[0] ?? null;
    out.push({
      id: absolutize(home, href),
      name: name || "Calendar",
      color: colorRaw ? colorRaw.slice(0, 7) : null,
      readOnly: false,
      primary: false,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull: ctag gate → etag diff → multiget changed
// ---------------------------------------------------------------------------

export async function caldavGetCtag(a: CaldavAccount, calUrl: string): Promise<string | null> {
  const res = await dav(a, "PROPFIND", calUrl, "0",
    `<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/"><prop><cs:getctag/></prop></propfind>`);
  if (!(res.ok || res.status === 207)) return null;
  return tagValues(await res.text(), "getctag")[0] ?? null;
}

export interface CaldavPullResult {
  changes: RemoteChange[];
  presentHrefs: Set<string>;
}

export async function caldavPull(
  a: CaldavAccount,
  calUrl: string,
  knownEtags: Map<string, string | null>, // href -> etag from mappings
  fallbackTz: string,
): Promise<CaldavPullResult> {
  // etag inventory
  const inv = await dav(a, "REPORT", calUrl, "1",
    `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>`);
  if (!(inv.ok || inv.status === 207)) throw new Error(`caldav_query_failed_${inv.status}`);
  const invXml = await inv.text();

  const present = new Set<string>();
  const toFetch: string[] = [];
  for (const resp of splitResponses(invXml)) {
    const href = tagValues(resp, "href")[0];
    const etag = tagValues(resp, "getetag")[0] ?? null;
    if (!href) continue;
    const abs = absolutize(calUrl, href);
    present.add(abs);
    if (!knownEtags.has(abs) || knownEtags.get(abs) !== etag) toFetch.push(href);
  }

  const changes: RemoteChange[] = [];
  // fetch changed objects in batches
  for (let i = 0; i < toFetch.length && i < 500; i += 20) {
    const batch = toFetch.slice(i, i + 20);
    const body =
      `<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>` +
      batch.map((h) => `<d:href>${h}</d:href>`).join("") +
      `</c:calendar-multiget>`;
    const res = await dav(a, "REPORT", calUrl, "1", body);
    if (!(res.ok || res.status === 207)) continue;
    const xml = await res.text();
    for (const resp of splitResponses(xml)) {
      const href = tagValues(resp, "href")[0];
      const etag = tagValues(resp, "getetag")[0] ?? null;
      const dataRaw = tagValues(resp, "calendar-data")[0];
      if (!href || !dataRaw) continue;
      const ics = decodeEntities(dataRaw);
      const parsed = parseIcsToCanonical(ics, fallbackTz);
      if (parsed.length === 0) continue;
      changes.push({
        remoteId: absolutize(calUrl, href),
        etag,
        removed: false,
        canon: parsed[0].canon, // one VEVENT per object resource (RFC 4791)
      });
    }
  }
  return { changes, presentHrefs: present };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export async function caldavCreate(
  a: CaldavAccount, calUrl: string, c: CanonicalEvent,
): Promise<{ remoteId: string; etag: string | null }> {
  const uid = crypto.randomUUID();
  const href = `${calUrl.endsWith("/") ? calUrl : calUrl + "/"}${uid}.ics`;
  const res = await fetch(href, {
    method: "PUT",
    headers: {
      authorization: authHeader(a),
      "content-type": "text/calendar; charset=utf-8",
      "if-none-match": "*",
    },
    body: buildVeventIcs(c, uid),
  });
  if (!res.ok) throw new Error(`caldav_put_failed_${res.status}`);
  return { remoteId: href, etag: res.headers.get("etag") };
}

export type CaldavPushOutcome =
  | { ok: true; etag: string | null }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; status: number };

export async function caldavUpdate(
  a: CaldavAccount, href: string, c: CanonicalEvent, etag: string | null, force: boolean,
): Promise<CaldavPushOutcome> {
  const uid = href.split("/").pop()?.replace(/\.ics$/i, "") ?? crypto.randomUUID();
  const headers: Record<string, string> = {
    authorization: authHeader(a),
    "content-type": "text/calendar; charset=utf-8",
  };
  if (etag && !force) headers["if-match"] = etag;
  const res = await fetch(href, { method: "PUT", headers, body: buildVeventIcs(c, uid) });
  if (res.status === 412) return { ok: false, conflict: true };
  if (!res.ok) return { ok: false, conflict: false, status: res.status };
  return { ok: true, etag: res.headers.get("etag") };
}

export async function caldavDelete(a: CaldavAccount, href: string): Promise<boolean> {
  const res = await fetch(href, { method: "DELETE", headers: { authorization: authHeader(a) } });
  return res.ok || res.status === 404 || res.status === 410;
}
