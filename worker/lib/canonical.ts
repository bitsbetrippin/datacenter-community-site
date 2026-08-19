import { sha256Hex } from "./util";

/**
 * The canonical event shape the sync engine reasons about (§1 design
 * principle: the local model is the source of truth; providers map into and
 * out of it).
 */
export interface CanonicalEvent {
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  start_at: string | null;            // ISO for timed
  end_at: string | null;
  start_date: string | null;          // YYYY-MM-DD for all-day
  end_date_exclusive: string | null;
  timezone: string;
  status: "confirmed" | "tentative" | "canceled";
  rrule: string | null;               // stored DTSTART+RRULE text, or null
  exdates: string[];
}

/** A change pulled from a provider. */
export interface RemoteChange {
  remoteId: string;
  etag: string | null;               // etag (Google) or changeKey (Microsoft)
  removed: boolean;
  /** present unless removed */
  canon?: CanonicalEvent;
  /** set for provider exception instances: parent remote id + original start */
  parentRemoteId?: string;
  originalStartAt?: string;
  /** provider marked this single occurrence cancelled */
  occurrenceCancelled?: boolean;
}

/**
 * SYNC-003 — deterministic snapshot hash. If the local event's hash equals
 * the mapping's last_synced_hash, the local side hasn't really changed and
 * no outbound write happens; a remote-sourced apply updates the hash so it
 * never echoes back out.
 */
export async function snapshotHash(c: CanonicalEvent): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      c.title, c.description ?? "", c.location ?? "", c.all_day,
      c.start_at ?? "", c.end_at ?? "", c.start_date ?? "", c.end_date_exclusive ?? "",
      c.status, c.rrule ?? "", [...c.exdates].sort(),
    ]),
  );
}

export interface DbEventRow {
  id: string;
  household_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location_text: string | null;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date_exclusive: string | null;
  timezone: string;
  status: string;
  updated_at: string;
  deleted_at: string | null;
  recurrence_series_id: string | null;
  original_occurrence_at: string | null;
}

export function rowToCanonical(
  row: DbEventRow,
  rrule: string | null,
  exdates: string[],
): CanonicalEvent {
  return {
    title: row.title,
    description: row.description,
    location: row.location_text,
    all_day: row.all_day,
    start_at: row.start_at,
    end_at: row.end_at,
    start_date: row.start_date,
    end_date_exclusive: row.end_date_exclusive,
    timezone: row.timezone,
    status: (row.status as CanonicalEvent["status"]) ?? "confirmed",
    rrule,
    exdates,
  };
}

/** Fields written back to the events table when applying a remote change. */
export function canonicalToRowPatch(c: CanonicalEvent): Record<string, unknown> {
  return {
    title: c.title.slice(0, 200) || "(untitled)",
    description: c.description,
    location_text: c.location,
    all_day: c.all_day,
    start_at: c.start_at,
    end_at: c.end_at,
    start_date: c.start_date,
    end_date_exclusive: c.end_date_exclusive,
    timezone: c.timezone,
    status: c.status,
    updated_by: null, // remote-sourced writes carry no local actor
  };
}
