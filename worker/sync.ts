import type { SupabaseClient } from "@supabase/supabase-js";
import { log, randomToken, type Env } from "./lib/util";
import {
  canonicalToRowPatch,
  rowToCanonical,
  snapshotHash,
  type CanonicalEvent,
  type DbEventRow,
  type RemoteChange,
} from "./lib/canonical";
import { AuthExpiredError, getAccessToken } from "./lib/tokens";
import { decryptToken } from "./lib/crypto";
import * as g from "./adapters/google";
import * as ms from "./adapters/microsoft";
import * as feed from "./adapters/icsfeed";
import * as dav from "./adapters/caldav";

/**
 * Synchronization engine (§14). One "pull" job = full cycle for a connection:
 * pull remote changes per selected calendar, apply with conflict detection,
 * then push local changes outward. Jobs are idempotent (SYNC-001): pulls are
 * cursor-based and applies compare hashes; pushes compare snapshot hashes and
 * use If-Match, so re-running a page never duplicates anything.
 */

export interface ConnectionRow {
  id: string;
  household_id: string;
  provider_id: string;
  provider_code: string;
  account_email: string | null;
  status: string;
  created_by: string | null;
  config?: { url?: string; base_url?: string; username?: string; name?: string } | null;
}

export type ProviderKind = "google" | "microsoft" | "icsfeed" | "caldav";

export function providerKind(conn: ConnectionRow): ProviderKind {
  switch (conn.provider_code) {
    case "GOOGLE_CALENDAR": return "google";
    case "MS_GRAPH_CALENDAR": return "microsoft";
    case "ICS_FEED": return "icsfeed";
    case "CALDAV_GENERIC": return "caldav";
    default: return "icsfeed";
  }
}

const SOURCE_BY_KIND: Record<ProviderKind, string> = {
  google: "google", microsoft: "microsoft", icsfeed: "ics", caldav: "caldav",
};

export async function caldavAccountFor(
  db: SupabaseClient, env: Env, conn: ConnectionRow,
): Promise<dav.CaldavAccount> {
  const { data } = await db
    .from("connection_secrets")
    .select("access_token_enc")
    .eq("connection_id", conn.id)
    .maybeSingle();
  const enc = (data as { access_token_enc: string | null } | null)?.access_token_enc;
  if (!enc || !conn.config?.base_url || !conn.config.username) throw new AuthExpiredError();
  return {
    baseUrl: conn.config.base_url,
    username: conn.config.username,
    password: await decryptToken(env.SUPABASE_SERVICE_ROLE_KEY, enc),
  };
}

interface ProviderRow {
  id: string;
  code: string;
  active: boolean;
  auth: { token_url?: string; revocation_url?: string };
  sync: { poll_seconds?: number; full_sync_horizon_days?: number };
  webhook: { mode?: string; renew_before_hours?: number };
}

interface CalendarRow {
  id: string;
  household_id: string;
  name: string;
  connection_id: string | null;
  remote_id: string | null;
  sync_direction: "twoway" | "pull" | "push";
  source: string;
}

interface MappingRow {
  id: string;
  event_id: string;
  connection_id: string;
  remote_calendar_id: string;
  remote_event_id: string;
  etag: string | null;
  last_synced_hash: string | null;
  deleted_remote: boolean;
}

export async function providerFor(db: SupabaseClient, conn: ConnectionRow): Promise<ProviderRow> {
  const { data } = await db
    .from("service_providers")
    .select("id, code, active, auth, sync, webhook")
    .eq("id", conn.provider_id)
    .single();
  return data as ProviderRow;
}

async function tokenFor(db: SupabaseClient, env: Env, conn: ConnectionRow, provider: ProviderRow) {
  return getAccessToken(db, env, conn, { token_url: provider.auth.token_url ?? "" });
}

function isGoogle(conn: ConnectionRow): boolean {
  return conn.provider_code === "GOOGLE_CALENDAR";
}

// ---------------------------------------------------------------------------
// Remote calendar listing + selection
// ---------------------------------------------------------------------------

export async function listRemoteCalendars(
  db: SupabaseClient, env: Env, conn: ConnectionRow,
): Promise<(g.RemoteCalendar & { selected: boolean; direction: string })[]> {
  const kind = providerKind(conn);
  let remote: g.RemoteCalendar[];
  if (kind === "caldav") {
    remote = await dav.caldavDiscoverCalendars(await caldavAccountFor(db, env, conn));
  } else if (kind === "icsfeed") {
    remote = []; // feeds are single-calendar; created at connect time
  } else {
    const provider = await providerFor(db, conn);
    const token = await tokenFor(db, env, conn, provider);
    remote = isGoogle(conn)
      ? await g.googleListCalendars(token)
      : await ms.msListCalendars(token);
  }
  const { data: existing } = await db
    .from("calendars")
    .select("remote_id, sync_direction")
    .eq("connection_id", conn.id);
  const byRemote = new Map(
    ((existing as { remote_id: string; sync_direction: string }[]) ?? []).map((c) => [c.remote_id, c]),
  );
  return remote.map((r) => ({
    ...r,
    selected: byRemote.has(r.id),
    direction: byRemote.get(r.id)?.sync_direction ?? (r.readOnly ? "pull" : "twoway"),
  }));
}

export async function selectCalendars(
  db: SupabaseClient,
  conn: ConnectionRow,
  picks: { remoteId: string; name: string; color: string | null; direction: string; selected: boolean }[],
): Promise<void> {
  const source = SOURCE_BY_KIND[providerKind(conn)];
  const { data: existing } = await db
    .from("calendars")
    .select("id, remote_id")
    .eq("connection_id", conn.id);
  const byRemote = new Map(
    ((existing as { id: string; remote_id: string }[]) ?? []).map((c) => [c.remote_id, c.id]),
  );

  for (const p of picks) {
    const direction = ["twoway", "pull", "push"].includes(p.direction) ? p.direction : "pull";
    if (p.selected) {
      if (byRemote.has(p.remoteId)) {
        await db
          .from("calendars")
          .update({ name: p.name, sync_direction: direction })
          .eq("id", byRemote.get(p.remoteId)!);
      } else {
        const { data: cal } = await db
          .from("calendars")
          .insert({
            household_id: conn.household_id,
            name: p.name,
            color: p.color ?? "#5b7fd6",
            source,
            connection_id: conn.id,
            remote_id: p.remoteId,
            sync_direction: direction,
            created_by: conn.created_by,
          })
          .select("id")
          .single();
        byRemote.set(p.remoteId, (cal as { id: string }).id);
      }
      await db.from("sync_state").upsert(
        {
          household_id: conn.household_id,
          connection_id: conn.id,
          remote_calendar_id: p.remoteId,
          calendar_id: byRemote.get(p.remoteId),
        },
        { onConflict: "connection_id,remote_calendar_id", ignoreDuplicates: true },
      );
    } else if (byRemote.has(p.remoteId)) {
      // Deselect: stop syncing but preserve local history (INT-004).
      await db.from("sync_state").delete()
        .eq("connection_id", conn.id).eq("remote_calendar_id", p.remoteId);
      await db.from("calendars")
        .update({ connection_id: null, sync_direction: "pull" })
        .eq("id", byRemote.get(p.remoteId)!);
    }
  }
}

// ---------------------------------------------------------------------------
// Pull application
// ---------------------------------------------------------------------------

async function localCanonical(
  db: SupabaseClient, event: DbEventRow,
): Promise<{ canon: CanonicalEvent; seriesId: string | null }> {
  const { data: rec } = await db
    .from("event_recurrence")
    .select("series_id, rrule, exdates")
    .eq("event_id", event.id)
    .maybeSingle();
  const r = rec as { series_id: string; rrule: string; exdates: string[] } | null;
  return {
    canon: rowToCanonical(event, r?.rrule ?? null, r?.exdates ?? []),
    seriesId: r?.series_id ?? null,
  };
}

async function upsertRecurrence(
  db: SupabaseClient, householdId: string, eventId: string, canon: CanonicalEvent,
): Promise<void> {
  const { data: rec } = await db
    .from("event_recurrence")
    .select("series_id, rrule, exdates")
    .eq("event_id", eventId)
    .maybeSingle();
  if (canon.rrule) {
    if (rec) {
      await db
        .from("event_recurrence")
        .update({ rrule: canon.rrule, exdates: canon.exdates })
        .eq("series_id", (rec as { series_id: string }).series_id);
    } else {
      await db.from("event_recurrence").insert({
        household_id: householdId,
        event_id: eventId,
        rrule: canon.rrule,
        exdates: canon.exdates,
      });
    }
  } else if (rec) {
    await db.from("event_recurrence").delete()
      .eq("series_id", (rec as { series_id: string }).series_id);
  }
}

async function applyChange(
  db: SupabaseClient,
  conn: ConnectionRow,
  calendar: CalendarRow,
  change: RemoteChange,
  counters: { applied: number; conflicts: number; created: number; deleted: number },
): Promise<void> {
  const { data: mapData } = await db
    .from("event_provider_mappings")
    .select("*")
    .eq("connection_id", conn.id)
    .eq("remote_event_id", change.remoteId)
    .maybeSingle();
  const mapping = mapData as MappingRow | null;

  // ---- removed remotely -> tombstone locally (§14.2) ----------------------
  if (change.removed) {
    if (mapping && !mapping.deleted_remote) {
      await db.from("events")
        .update({ deleted_at: new Date().toISOString(), updated_by: null })
        .eq("id", mapping.event_id)
        .is("deleted_at", null);
      await db.from("event_provider_mappings")
        .update({ deleted_remote: true, last_synced_at: new Date().toISOString() })
        .eq("id", mapping.id);
      counters.deleted++;
    }
    return;
  }

  // ---- provider exception instances ---------------------------------------
  if (change.parentRemoteId) {
    const { data: parentMap } = await db
      .from("event_provider_mappings")
      .select("event_id")
      .eq("connection_id", conn.id)
      .eq("remote_event_id", change.parentRemoteId)
      .maybeSingle();
    if (!parentMap) return; // parent not imported (yet) — next full pass catches it
    const parentEventId = (parentMap as { event_id: string }).event_id;
    const { data: recData } = await db
      .from("event_recurrence")
      .select("series_id, exdates")
      .eq("event_id", parentEventId)
      .maybeSingle();
    const rec = recData as { series_id: string; exdates: string[] } | null;

    if (change.occurrenceCancelled) {
      if (rec && change.originalStartAt && !rec.exdates.includes(change.originalStartAt)) {
        await db.from("event_recurrence")
          .update({ exdates: [...rec.exdates, change.originalStartAt] })
          .eq("series_id", rec.series_id);
        counters.applied++;
      }
      // If a concrete exception row existed for this occurrence, remove it too.
      if (mapping) {
        await db.from("events")
          .update({ deleted_at: new Date().toISOString(), updated_by: null })
          .eq("id", mapping.event_id).is("deleted_at", null);
        await db.from("event_provider_mappings")
          .update({ deleted_remote: true }).eq("id", mapping.id);
      }
      return;
    }

    if (!change.canon) return;
    const exCanon = { ...change.canon, rrule: null, exdates: [] };
    const hash = await snapshotHash(exCanon);
    if (!mapping) {
      // Materialize the exception locally; keep the slot excluded on the series.
      const { data: created } = await db
        .from("events")
        .insert({
          household_id: conn.household_id,
          calendar_id: calendar.id,
          ...canonicalToRowPatch(exCanon),
          recurrence_series_id: rec?.series_id ?? null,
          original_occurrence_at: change.originalStartAt ?? null,
          created_by: conn.created_by,
        })
        .select("id")
        .single();
      if (rec && change.originalStartAt && !rec.exdates.includes(change.originalStartAt)) {
        await db.from("event_recurrence")
          .update({ exdates: [...rec.exdates, change.originalStartAt] })
          .eq("series_id", rec.series_id);
      }
      await db.from("event_provider_mappings").insert({
        household_id: conn.household_id,
        event_id: (created as { id: string }).id,
        connection_id: conn.id,
        remote_calendar_id: calendar.remote_id!,
        remote_event_id: change.remoteId,
        etag: change.etag,
        last_synced_hash: hash,
        last_synced_at: new Date().toISOString(),
      });
      counters.created++;
      return;
    }
    // fall through to the generic update path with the exception canon
    change = { ...change, canon: exCanon };
  }

  if (!change.canon) return;
  const remoteCanon = change.canon;
  const remoteHash = await snapshotHash(remoteCanon);

  // ---- brand new remote event ---------------------------------------------
  if (!mapping) {
    const { data: created, error } = await db
      .from("events")
      .insert({
        household_id: conn.household_id,
        calendar_id: calendar.id,
        ...canonicalToRowPatch(remoteCanon),
        created_by: conn.created_by,
      })
      .select("id")
      .single();
    if (error || !created) return;
    const newId = (created as { id: string }).id;
    await upsertRecurrence(db, conn.household_id, newId, remoteCanon);
    await db.from("event_provider_mappings").insert({
      household_id: conn.household_id,
      event_id: newId,
      connection_id: conn.id,
      remote_calendar_id: calendar.remote_id!,
      remote_event_id: change.remoteId,
      etag: change.etag,
      last_synced_hash: remoteHash,
      last_synced_at: new Date().toISOString(),
    });
    counters.created++;
    return;
  }

  // ---- existing mapping: compare three-way ---------------------------------
  const { data: evData } = await db
    .from("events").select("*").eq("id", mapping.event_id).maybeSingle();
  if (!evData) return;
  const event = evData as DbEventRow;
  const { canon: localCanon } = await localCanonical(db, event);
  const localHash = await snapshotHash(localCanon);

  const remoteChanged = change.etag !== mapping.etag || remoteHash !== mapping.last_synced_hash;
  const localChanged = localHash !== mapping.last_synced_hash && event.deleted_at === null;

  if (!remoteChanged) return;

  if (localChanged && remoteHash !== localHash) {
    // §14.2 both-changed → conflict record; never silently discard.
    const { data: open } = await db
      .from("conflicts")
      .select("id")
      .eq("event_id", event.id)
      .eq("state", "open")
      .maybeSingle();
    if (!open) {
      await db.from("conflicts").insert({
        household_id: conn.household_id,
        event_id: event.id,
        connection_id: conn.id,
        local_snapshot: { canon: localCanon, etag: mapping.etag },
        remote_snapshot: { canon: remoteCanon, etag: change.etag },
      });
      counters.conflicts++;
    }
    return;
  }

  // remote wins cleanly (local unchanged, or identical content)
  await db.from("events")
    .update({ ...canonicalToRowPatch(remoteCanon), deleted_at: null })
    .eq("id", event.id);
  await upsertRecurrence(db, conn.household_id, event.id, remoteCanon);
  await db.from("event_provider_mappings")
    .update({
      etag: change.etag,
      last_synced_hash: remoteHash,
      last_synced_at: new Date().toISOString(),
      remote_updated_at: new Date().toISOString(),
      deleted_remote: false,
    })
    .eq("id", mapping.id);
  counters.applied++;
}

// ---------------------------------------------------------------------------
// Push sweep
// ---------------------------------------------------------------------------

/** Provider-neutral outbound operations, built per connection kind. */
interface PushOps {
  create(calRemoteId: string, c: import("./lib/canonical").CanonicalEvent): Promise<{ remoteId: string; etag: string | null }>;
  update(calRemoteId: string, remoteId: string, c: import("./lib/canonical").CanonicalEvent, etag: string | null, force: boolean):
    Promise<{ ok: true; etag: string | null } | { ok: false; conflict: true; remote: unknown | null } | { ok: false; conflict: false; status: number }>;
  remove(calRemoteId: string, remoteId: string): Promise<boolean>;
  toCanonical(remote: unknown, tz: string): CanonicalEvent | null;
}

function buildPushOps(
  kind: ProviderKind, token: string | null, account: dav.CaldavAccount | null,
): PushOps | null {
  if (kind === "google" && token) {
    return {
      create: (cal, c) => g.googleCreateEvent(token, cal, c),
      update: (cal, id, c, etag, force) => g.googleUpdateEvent(token, cal, id, c, etag, force),
      remove: (cal, id) => g.googleDeleteEvent(token, cal, id),
      toCanonical: (r, tz) => (r ? g.googleEventToCanonical(r, tz) : null),
    };
  }
  if (kind === "microsoft" && token) {
    return {
      create: (cal, c) => ms.msCreateEvent(token, cal, c),
      update: (_cal, id, c, etag, force) => ms.msUpdateEvent(token, id, c, etag, force),
      remove: (_cal, id) => ms.msDeleteEvent(token, id),
      toCanonical: (r, tz) => (r ? ms.msEventToCanonical(r, tz) : null),
    };
  }
  if (kind === "caldav" && account) {
    return {
      create: (cal, c) => dav.caldavCreate(account, cal, c),
      update: async (_cal, id, c, etag, force) => {
        const o = await dav.caldavUpdate(account, id, c, etag, force);
        return o.ok ? o : o.conflict ? { ok: false, conflict: true, remote: null } : o;
      },
      remove: (_cal, id) => dav.caldavDelete(account, id),
      toCanonical: () => null, // 412 without body — conflict shows local vs last-known
    };
  }
  return null; // icsfeed: read-only
}

async function pushCalendar(
  db: SupabaseClient,
  env: Env,
  conn: ConnectionRow,
  calendar: CalendarRow,
  ops: PushOps,
  state: { id: string; last_outbound_at: string | null },
  counters: { pushed: number; conflicts: number; remoteDeleted: number; skipped: number },
): Promise<void> {
  if (calendar.sync_direction === "pull") return;
  const sweepStart = new Date().toISOString();
  const since = state.last_outbound_at ?? "1970-01-01T00:00:00Z";

  const { data: rows } = await db
    .from("events")
    .select("*")
    .eq("calendar_id", calendar.id)
    .gt("updated_at", since)
    .limit(300);

  for (const raw of ((rows as DbEventRow[]) ?? [])) {
    const event = raw;
    const { data: mapData } = await db
      .from("event_provider_mappings")
      .select("*")
      .eq("connection_id", conn.id)
      .eq("event_id", event.id)
      .maybeSingle();
    const mapping = mapData as MappingRow | null;

    // Local deletion → remote delete (tombstone) ---------------------------
    if (event.deleted_at) {
      if (mapping && !mapping.deleted_remote) {
        const ok = await ops.remove(calendar.remote_id!, mapping.remote_event_id);
        if (ok) {
          await db.from("event_provider_mappings")
            .update({ deleted_remote: true, last_synced_at: new Date().toISOString() })
            .eq("id", mapping.id);
          counters.remoteDeleted++;
        }
      }
      continue;
    }

    // Exception rows: occurrence-level outbound push is out of R3 scope.
    if (event.original_occurrence_at && !mapping) {
      counters.skipped++;
      continue;
    }

    const { canon } = await localCanonical(db, event);
    const hash = await snapshotHash(canon);

    if (!mapping) {
      try {
        const created = await ops.create(calendar.remote_id!, canon);
        await db.from("event_provider_mappings").insert({
          household_id: conn.household_id,
          event_id: event.id,
          connection_id: conn.id,
          remote_calendar_id: calendar.remote_id!,
          remote_event_id: created.remoteId,
          etag: created.etag,
          last_synced_hash: hash,
          last_synced_at: new Date().toISOString(),
        });
        counters.pushed++;
      } catch (e) {
        log({ push: "create_failed", event: event.id, error: String(e) });
      }
      continue;
    }

    if (mapping.deleted_remote) continue;           // §14.2 remote deletion won
    if (hash === mapping.last_synced_hash) continue; // SYNC-003 echo prevention

    const outcome = await ops.update(
      calendar.remote_id!, mapping.remote_event_id, canon, mapping.etag, false,
    );

    if (outcome.ok) {
      await db.from("event_provider_mappings")
        .update({ etag: outcome.etag, last_synced_hash: hash, last_synced_at: new Date().toISOString() })
        .eq("id", mapping.id);
      counters.pushed++;
    } else if (outcome.conflict) {
      const remoteCanon = ops.toCanonical(outcome.remote, canon.timezone);
      const { data: open } = await db
        .from("conflicts").select("id").eq("event_id", event.id).eq("state", "open").maybeSingle();
      if (!open && remoteCanon) {
        await db.from("conflicts").insert({
          household_id: conn.household_id,
          event_id: event.id,
          connection_id: conn.id,
          local_snapshot: { canon, etag: mapping.etag },
          remote_snapshot: { canon: remoteCanon, etag: null },
        });
        counters.conflicts++;
      }
    } else {
      log({ push: "update_failed", event: event.id, status: outcome.status });
    }
  }

  await db.from("sync_state").update({ last_outbound_at: sweepStart }).eq("id", state.id);
}

// ---------------------------------------------------------------------------
// Full connection cycle
// ---------------------------------------------------------------------------

/** Tombstone mappings whose remote objects vanished (full-state providers). */
async function applyAbsentRemovals(
  db: SupabaseClient,
  conn: ConnectionRow,
  calendar: CalendarRow,
  present: Set<string>,
  counters: { applied: number; conflicts: number; created: number; deleted: number },
): Promise<void> {
  const { data } = await db
    .from("event_provider_mappings")
    .select("remote_event_id")
    .eq("connection_id", conn.id)
    .eq("remote_calendar_id", calendar.remote_id!)
    .eq("deleted_remote", false);
  for (const row of ((data as { remote_event_id: string }[]) ?? [])) {
    if (!present.has(row.remote_event_id)) {
      await applyChange(db, conn, calendar,
        { remoteId: row.remote_event_id, etag: null, removed: true }, counters);
    }
  }
}

export async function runConnectionSync(
  db: SupabaseClient, env: Env, conn: ConnectionRow, correlationId: string,
): Promise<Record<string, number>> {
  const kind = providerKind(conn);
  const provider = await providerFor(db, conn);
  const horizon = provider.sync.full_sync_horizon_days ?? 365;
  const token = kind === "google" || kind === "microsoft"
    ? await tokenFor(db, env, conn, provider)
    : null;
  const account = kind === "caldav" ? await caldavAccountFor(db, env, conn) : null;
  const ops = buildPushOps(kind, token, account);

  const { data: calData } = await db
    .from("calendars")
    .select("id, household_id, name, connection_id, remote_id, sync_direction, source")
    .eq("connection_id", conn.id);
  const calendars = (calData as CalendarRow[]) ?? [];

  const counters = {
    applied: 0, conflicts: 0, created: 0, deleted: 0,
    pushed: 0, remoteDeleted: 0, skipped: 0,
  };

  for (const calendar of calendars) {
    if (!calendar.remote_id) continue;
    const { data: stData } = await db
      .from("sync_state")
      .select("id, cursor, last_outbound_at")
      .eq("connection_id", conn.id)
      .eq("remote_calendar_id", calendar.remote_id)
      .maybeSingle();
    if (!stData) continue;
    const state = stData as { id: string; cursor: string | null; last_outbound_at: string | null };

    await db.from("sync_state")
      .update({ last_attempt_at: new Date().toISOString() }).eq("id", state.id);

    // ---- pull ------------------------------------------------------------
    if (calendar.sync_direction !== "push") {
      let nextCursor: string | null | undefined;

      if (kind === "icsfeed") {
        const url = conn.config?.url;
        if (!url) continue;
        let cursor: feed.FeedCursor | null = null;
        try {
          cursor = state.cursor ? (JSON.parse(state.cursor) as feed.FeedCursor) : null;
        } catch { /* fresh */ }
        const pull = await feed.feedPull(url, cursor, "UTC");
        if (!pull.notModified) {
          for (const change of pull.changes) {
            await applyChange(db, conn, calendar, change, counters);
          }
          await applyAbsentRemovals(db, conn, calendar, pull.presentUids, counters);
        }
        nextCursor = JSON.stringify(pull.nextCursor);
      } else if (kind === "caldav") {
        const ctag = await dav.caldavGetCtag(account!, calendar.remote_id);
        if (!ctag || ctag !== state.cursor) {
          const { data: maps } = await db
            .from("event_provider_mappings")
            .select("remote_event_id, etag")
            .eq("connection_id", conn.id)
            .eq("remote_calendar_id", calendar.remote_id);
          const known = new Map(
            ((maps as { remote_event_id: string; etag: string | null }[]) ?? [])
              .map((m) => [m.remote_event_id, m.etag]),
          );
          const pull = await dav.caldavPull(account!, calendar.remote_id, known, "UTC");
          for (const change of pull.changes) {
            await applyChange(db, conn, calendar, change, counters);
          }
          await applyAbsentRemovals(db, conn, calendar, pull.presentHrefs, counters);
          nextCursor = ctag;
        }
      } else {
        let pull = kind === "google"
          ? await g.googlePullEvents(token!, calendar.remote_id, state.cursor, "UTC", horizon)
          : await ms.msPullEvents(token!, calendar.remote_id, state.cursor, "UTC");
        if (pull.fullResyncNeeded) {
          pull = kind === "google"
            ? await g.googlePullEvents(token!, calendar.remote_id, null, "UTC", horizon)
            : await ms.msPullEvents(token!, calendar.remote_id, null, "UTC");
        }
        // parents before exceptions so exception changes find their series
        const ordered = [
          ...pull.changes.filter((c) => !c.parentRemoteId),
          ...pull.changes.filter((c) => c.parentRemoteId),
        ];
        for (const change of ordered) {
          await applyChange(db, conn, calendar, change, counters);
        }
        nextCursor = pull.nextCursor ?? state.cursor;
      }

      await db.from("sync_state")
        .update({
          cursor: nextCursor === undefined ? state.cursor : nextCursor,
          last_success_at: new Date().toISOString(),
          last_error: null,
          full_synced_at: state.cursor ? undefined : new Date().toISOString(),
        })
        .eq("id", state.id);
    }

    // ---- push ------------------------------------------------------------
    if (ops) {
      await pushCalendar(db, env, conn, calendar, ops, state, counters);
    }
  }

  await db.from("service_connections")
    .update({ status: "connected", status_detail: null, last_success_at: new Date().toISOString(), last_error: null })
    .eq("id", conn.id);

  log({ job: "sync", correlationId, connection: conn.id, provider: conn.provider_code, ...counters });
  return counters;
}

// ---------------------------------------------------------------------------
// Job queue (SYNC-001/002) + scheduling
// ---------------------------------------------------------------------------

export async function ensureDueJobs(db: SupabaseClient): Promise<void> {
  const { data } = await db
    .from("service_connections")
    .select("id, household_id, provider_id, provider_code, status, created_by, account_email")
    .eq("status", "connected");
  for (const conn of ((data as ConnectionRow[]) ?? [])) {
    const provider = await providerFor(db, conn);
    if (!provider.active) continue;
    const poll = (provider.sync.poll_seconds ?? 300) * 1000;
    const { data: last } = await db
      .from("sync_jobs")
      .select("id, status, created_at")
      .eq("connection_id", conn.id)
      .eq("kind", "pull")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastJob = (last as { id: string; status: string; created_at: string }[] | null)?.[0];
    const busy = lastJob && (lastJob.status === "queued" || lastJob.status === "running");
    const due = !lastJob || Date.now() - new Date(lastJob.created_at).getTime() > poll;
    if (!busy && due) {
      await db.from("sync_jobs").insert({
        household_id: conn.household_id,
        connection_id: conn.id,
        kind: "pull",
      });
    }
  }
}

export async function runDueJobs(db: SupabaseClient, env: Env, maxJobs = 2): Promise<void> {
  const { data } = await db
    .from("sync_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("created_at")
    .limit(maxJobs);

  for (const jobRaw of ((data as {
    id: string; connection_id: string | null; kind: string; attempts: number; correlation_id: string;
  }[]) ?? [])) {
    // optimistic claim — a second runner sees zero updated rows and moves on
    const { data: claimed } = await db
      .from("sync_jobs")
      .update({ status: "running", attempts: jobRaw.attempts + 1 })
      .eq("id", jobRaw.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed || (claimed as unknown[]).length === 0) continue;

    try {
      if (jobRaw.kind === "pull" && jobRaw.connection_id) {
        const { data: connData } = await db
          .from("service_connections").select("*").eq("id", jobRaw.connection_id).single();
        const conn = connData as ConnectionRow;
        if (conn.status === "connected") {
          await runConnectionSync(db, env, conn, jobRaw.correlation_id);
        }
      }
      await db.from("sync_jobs")
        .update({ status: "done", finished_at: new Date().toISOString(), error: null })
        .eq("id", jobRaw.id);
    } catch (e) {
      const isAuth = e instanceof AuthExpiredError;
      const attempts = jobRaw.attempts + 1;
      const giveUp = isAuth || attempts >= 5;
      await db.from("sync_jobs")
        .update({
          status: giveUp ? "failed" : "queued",
          run_after: new Date(Date.now() + Math.min(2 ** attempts * 30_000, 3_600_000)).toISOString(),
          error: String(e).slice(0, 500),
          finished_at: giveUp ? new Date().toISOString() : null,
        })
        .eq("id", jobRaw.id);
      if (!isAuth && jobRaw.connection_id) {
        await db.from("service_connections")
          .update({ last_error: String(e).slice(0, 300), ...(giveUp ? { status: "failed" } : {}) })
          .eq("id", jobRaw.connection_id);
      }
      log({ job: "sync", correlationId: jobRaw.correlation_id, ok: false, error: String(e) });
    }
  }
}

// ---------------------------------------------------------------------------
// Microsoft change-notification subscriptions (SYNC-004)
// ---------------------------------------------------------------------------

export async function maintainSubscriptions(
  db: SupabaseClient, env: Env, origin: string,
): Promise<void> {
  const { data } = await db
    .from("service_connections")
    .select("*")
    .eq("provider_code", "MS_GRAPH_CALENDAR")
    .eq("status", "connected");
  for (const conn of ((data as ConnectionRow[]) ?? [])) {
    try {
      const provider = await providerFor(db, conn);
      const token = await tokenFor(db, env, conn, provider);
      const { data: cals } = await db
        .from("calendars").select("remote_id").eq("connection_id", conn.id);
      for (const cal of ((cals as { remote_id: string }[]) ?? [])) {
        const { data: subData } = await db
          .from("webhook_subscriptions")
          .select("*")
          .eq("connection_id", conn.id)
          .eq("resource", `/me/calendars/${cal.remote_id}/events`)
          .eq("status", "active")
          .maybeSingle();
        const sub = subData as {
          id: string; subscription_id: string; expires_at: string | null;
        } | null;
        const renewBefore = (provider.webhook.renew_before_hours ?? 24) * 3600_000;

        if (!sub) {
          const clientState = randomToken(24);
          const created = await ms.msCreateSubscription(
            token, cal.remote_id, `${origin}/api/webhooks/microsoft`, clientState,
          );
          if (created) {
            await db.from("webhook_subscriptions").insert({
              household_id: conn.household_id,
              connection_id: conn.id,
              provider_code: "MS_GRAPH_CALENDAR",
              subscription_id: created.id,
              resource: `/me/calendars/${cal.remote_id}/events`,
              client_state: clientState,
              expires_at: created.expiresAt,
            });
          }
        } else if (
          sub.expires_at && new Date(sub.expires_at).getTime() - Date.now() < renewBefore
        ) {
          const renewed = await ms.msRenewSubscription(token, sub.subscription_id);
          await db.from("webhook_subscriptions")
            .update(renewed ? { expires_at: renewed } : { status: "error" })
            .eq("id", sub.id);
          if (!renewed) {
            // Surfaced per release checklist: subscription lifecycle failure.
            await db.from("service_connections")
              .update({ status_detail: "webhook_renewal_failed" }).eq("id", conn.id);
          }
        }
      }
    } catch (e) {
      log({ job: "subscriptions", connection: conn.id, ok: false, error: String(e) });
    }
  }
}

/** POST /api/webhooks/microsoft — ACK fast, enqueue work (API-003). */
export async function handleMsWebhook(db: SupabaseClient, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "content-type": "text/plain" } });
  }
  let body: { value?: { subscriptionId: string; clientState?: string }[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(null, { status: 202 });
  }
  const seen = new Set<string>();
  for (const n of body.value ?? []) {
    if (seen.has(n.subscriptionId)) continue;
    seen.add(n.subscriptionId);
    const { data } = await db
      .from("webhook_subscriptions")
      .select("connection_id, household_id, client_state")
      .eq("provider_code", "MS_GRAPH_CALENDAR")
      .eq("subscription_id", n.subscriptionId)
      .maybeSingle();
    const sub = data as { connection_id: string; household_id: string; client_state: string } | null;
    if (!sub || sub.client_state !== n.clientState) continue; // §18 webhook validation
    const { data: queued } = await db
      .from("sync_jobs")
      .select("id")
      .eq("connection_id", sub.connection_id)
      .eq("status", "queued")
      .limit(1);
    if (!queued || (queued as unknown[]).length === 0) {
      await db.from("sync_jobs").insert({
        household_id: sub.household_id,
        connection_id: sub.connection_id,
        kind: "pull",
        payload: { trigger: "webhook" },
      });
    }
  }
  return new Response(null, { status: 202 });
}

// ---------------------------------------------------------------------------
// Test connection (INT-006) + conflict resolution (§14.2)
// ---------------------------------------------------------------------------

export async function testConnection(
  db: SupabaseClient, env: Env, conn: ConnectionRow,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const kind = providerKind(conn);
    let detail: string;
    if (kind === "icsfeed") {
      const probe = await feed.feedProbe(conn.config?.url ?? "");
      if (!probe.ok) throw new Error(probe.detail);
      detail = probe.detail;
    } else if (kind === "caldav") {
      const cals = await dav.caldavDiscoverCalendars(await caldavAccountFor(db, env, conn));
      detail = `Authenticated. ${cals.length} calendar(s) discovered.`;
    } else {
      const provider = await providerFor(db, conn);
      const token = await tokenFor(db, env, conn, provider);
      const calendars = kind === "google"
        ? await g.googleListCalendars(token)
        : await ms.msListCalendars(token);
      detail = `Authenticated. ${calendars.length} calendar(s) visible.`;
    }
    await db.from("service_connections")
      .update({ status: "connected", status_detail: null, last_success_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);
    return { ok: true, detail };
  } catch (e) {
    const detail = e instanceof AuthExpiredError
      ? "Authentication expired — reconnect the account."
      : `Connection test failed: ${String(e).slice(0, 200)}`;
    await db.from("service_connections")
      .update({ status: "attention", status_detail: detail })
      .eq("id", conn.id);
    return { ok: false, detail };
  }
}

export async function resolveConflict(
  db: SupabaseClient, env: Env, conflictId: string, choice: "local" | "remote", userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await db.from("conflicts").select("*").eq("id", conflictId).eq("state", "open").maybeSingle();
  if (!data) return { ok: false, error: "conflict_not_found" };
  const conflict = data as {
    id: string; event_id: string; connection_id: string | null; household_id: string;
    local_snapshot: { canon: CanonicalEvent }; remote_snapshot: { canon: CanonicalEvent; etag: string | null };
  };
  const { data: mapData } = await db
    .from("event_provider_mappings")
    .select("*")
    .eq("event_id", conflict.event_id)
    .eq("connection_id", conflict.connection_id ?? "")
    .maybeSingle();
  const mapping = mapData as MappingRow | null;

  if (choice === "remote") {
    const canon = conflict.remote_snapshot.canon;
    await db.from("events")
      .update(canonicalToRowPatch(canon))
      .eq("id", conflict.event_id);
    await upsertRecurrence(db, conflict.household_id, conflict.event_id, canon);
    if (mapping) {
      await db.from("event_provider_mappings")
        .update({
          etag: conflict.remote_snapshot.etag ?? mapping.etag,
          last_synced_hash: await snapshotHash(canon),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", mapping.id);
    }
  } else if (mapping && conflict.connection_id) {
    // Keep mine → force-push local over remote (explicit user decision).
    const { data: connData } = await db
      .from("service_connections").select("*").eq("id", conflict.connection_id).single();
    const conn = connData as ConnectionRow;
    const kind = providerKind(conn);
    const provider = await providerFor(db, conn);
    const token = kind === "google" || kind === "microsoft"
      ? await tokenFor(db, env, conn, provider) : null;
    const account = kind === "caldav" ? await caldavAccountFor(db, env, conn) : null;
    const ops = buildPushOps(kind, token, account);
    if (!ops) return { ok: false, error: "read_only_source" }; // feeds: remote is authoritative
    const canon = conflict.local_snapshot.canon;
    const outcome = await ops.update(
      mapping.remote_calendar_id, mapping.remote_event_id, canon, null, true,
    );
    if (!outcome.ok) return { ok: false, error: "push_failed" };
    await db.from("event_provider_mappings")
      .update({
        etag: outcome.etag,
        last_synced_hash: await snapshotHash(canon),
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", mapping.id);
  }

  await db.from("conflicts")
    .update({
      state: "resolved",
      resolution: choice,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conflict.id);
  return { ok: true };
}
