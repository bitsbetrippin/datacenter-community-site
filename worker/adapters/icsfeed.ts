/**
 * ICS subscription feed adapter (WP9): scheduled read-only refresh with
 * ETag / Last-Modified support (Appendix B ICS_FEED profile).
 *
 * Feeds are full-state snapshots: each refresh yields the complete event set,
 * so removals are detected by comparing UIDs against existing mappings.
 */
import type { RemoteChange } from "../lib/canonical";
import { snapshotHash } from "../lib/canonical";
import { parseIcsToCanonical } from "../lib/icsparse";

export interface FeedCursor {
  etag: string | null;
  lastModified: string | null;
}

export interface FeedPullResult {
  notModified: boolean;
  changes: RemoteChange[];
  presentUids: Set<string>;
  nextCursor: FeedCursor;
}

export async function feedPull(
  url: string,
  cursor: FeedCursor | null,
  fallbackTz: string,
): Promise<FeedPullResult> {
  const headers: Record<string, string> = { "user-agent": "family-calendar/r4" };
  if (cursor?.etag) headers["if-none-match"] = cursor.etag;
  if (cursor?.lastModified) headers["if-modified-since"] = cursor.lastModified;

  const res = await fetch(url, { headers, redirect: "follow" });
  if (res.status === 304) {
    return {
      notModified: true,
      changes: [],
      presentUids: new Set(),
      nextCursor: cursor ?? { etag: null, lastModified: null },
    };
  }
  if (!res.ok) throw new Error(`feed_fetch_failed_${res.status}`);

  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("feed_not_icalendar");

  const parsed = parseIcsToCanonical(text, fallbackTz);
  const changes: RemoteChange[] = [];
  const present = new Set<string>();
  for (const p of parsed.slice(0, 2000)) {
    present.add(p.uid);
    changes.push({
      remoteId: p.uid,
      // content hash doubles as the change marker — stable content, no churn
      etag: await snapshotHash(p.canon),
      removed: false,
      canon: p.canon,
    });
  }
  return {
    notModified: false,
    changes,
    presentUids: present,
    nextCursor: {
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    },
  };
}

/** Validate a feed URL at connect time: fetch and count events. */
export async function feedProbe(url: string): Promise<{ ok: boolean; count: number; detail: string }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "family-calendar/r4" },
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, count: 0, detail: `The feed returned HTTP ${res.status}.` };
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { ok: false, count: 0, detail: "That URL is not an iCalendar (.ics) feed." };
    }
    const count = parseIcsToCanonical(text, "UTC").length;
    return { ok: true, count, detail: `Feed OK — ${count} event(s) found.` };
  } catch {
    return { ok: false, count: 0, detail: "Could not reach that URL." };
  }
}
