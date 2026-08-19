/**
 * Cloudflare Worker — Release 3.
 *
 * fetch:
 *   /api/health, /api/me                          — R1 shell
 *   /api/admin/setup-status                       — which provider secrets exist + exact redirect URIs
 *   /api/integrations/:provider/connect           — begin OAuth (Owner/Admin)
 *   /api/integrations/callback/:provider          — OAuth callback (state-authenticated)
 *   /api/integrations/:id/calendars               — GET remote list / POST selection
 *   /api/integrations/:id/sync|test|disconnect    — connection operations
 *   /api/integrations/conflicts/:id/resolve       — §14.2 conflict resolution
 *   /api/webhooks/microsoft                       — Graph change notifications
 *
 * scheduled (every 5 min): reminder delivery (R2) + sync job scheduling/run +
 * Microsoft subscription lifecycle maintenance.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { json, log, type Env } from "./lib/util";
import { deliverReminders } from "./reminders";
import { beginConnect, handleCallback, oauthProfileFor, redirectUriFor } from "./oauth";
import {
  ensureDueJobs,
  handleMsWebhook,
  listRemoteCalendars,
  providerFor,
  resolveConflict,
  runConnectionSync,
  runDueJobs,
  maintainSubscriptions,
  selectCalendars,
  testConnection,
  type ConnectionRow,
} from "./sync";
import { revokeConnection, storeTokens } from "./lib/tokens";
import { feedProbe } from "./adapters/icsfeed";
import { handleImageImport } from "./imageimport";
import { caldavDiscoverCalendars } from "./adapters/caldav";
import { encryptToken } from "./lib/crypto";

// ---------------------------------------------------------------------------
// §18 rate limiting — token bucket per client IP (per isolate; a lightweight
// brake on abuse, sized far above any legitimate family usage).
// ---------------------------------------------------------------------------
const rlBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request, limitPerMinute: number): boolean {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Date.now();
  const bucket = rlBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rlBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    if (rlBuckets.size > 10_000) rlBuckets.clear(); // memory backstop
    return false;
  }
  bucket.count++;
  return bucket.count > limitPerMinute;
}

// ---------------------------------------------------------------------------
// §19 retention — hourly cleanup of expired working data
// ---------------------------------------------------------------------------
async function retentionPurge(db: SupabaseClient): Promise<void> {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
  // Soft-deleted events past the undo/grace horizon are removed for good.
  await db.from("events").delete().lt("deleted_at", daysAgo(30));
  await db.from("notifications").delete().not("read_at", "is", null).lt("created_at", daysAgo(90));
  await db.from("reminder_deliveries").delete().lt("delivered_at", daysAgo(90));
  await db.from("sync_jobs").delete().in("status", ["done", "failed"]).lt("created_at", daysAgo(30));
  await db.from("oauth_states").delete().lt("created_at", daysAgo(1));
  log({ job: "retention_purge", ok: true });
}

interface AuthedUser {
  id: string;
  email?: string;
}

async function originFromOauthStates(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("oauth_states")
    .select("redirect_to")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data as { redirect_to: string | null }[] | null)?.[0];
  if (!row?.redirect_to) return null;
  try {
    return new URL(row.redirect_to).origin;
  } catch {
    return null;
  }
}

function serviceDb(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function authenticate(request: Request, env: Env): Promise<AuthedUser | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string };
  return user.id ? { id: user.id, email: user.email } : null;
}

/** API-001 — membership + role checked server-side via service role. */
async function membershipFor(
  db: SupabaseClient, userId: string,
): Promise<{ householdId: string; role: string } | null> {
  const { data } = await db
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  const m = (data as { household_id: string; role: string }[] | null)?.[0];
  return m ? { householdId: m.household_id, role: m.role } : null;
}

async function connectionForRequest(
  db: SupabaseClient, connectionId: string, householdId: string,
): Promise<ConnectionRow | null> {
  const { data } = await db
    .from("service_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("household_id", householdId) // spoofed ids die here (API-001)
    .maybeSingle();
  return (data as ConnectionRow) ?? null;
}

function isPlaceholder(v: string | undefined): boolean {
  return !v || v.includes("YOUR-") || v.includes("PASTE-");
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const path = url.pathname;

  // ---- public self-diagnostic (NEVER touches the database) ----------------
  // Booleans only — presence, not values. Open this in a browser any time
  // something seems off: it lists exactly which Worker settings are missing.
  if (path === "/api/health") {
    const config = {
      supabase_url_var: !isPlaceholder(env.SUPABASE_URL),
      supabase_anon_key_var: !isPlaceholder(env.SUPABASE_ANON_KEY),
      service_role_key_secret: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      google_secrets: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      microsoft_secrets: Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
      app_origin_var: Boolean(env.APP_ORIGIN),
      workers_ai_binding: Boolean(env.AI),
    };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
    return json({
      ok: missing.length === 0,
      service: "family-calendar",
      release: "v1.1",
      time: new Date().toISOString(),
      config,
      fix:
        missing.length === 0
          ? undefined
          : "Missing settings listed as false above. *_var entries come from wrangler.jsonc vars (edit + push); *_secret entries are added in Cloudflare -> Worker -> Settings -> Variables and Secrets.",
    });
  }

  // ---- hard guard: without these, nothing else can work -------------------
  if (isPlaceholder(env.SUPABASE_URL) || isPlaceholder(env.SUPABASE_ANON_KEY) || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(
      {
        error: "worker_not_configured",
        detail:
          "The Worker is missing SUPABASE_URL / SUPABASE_ANON_KEY vars (wrangler.jsonc) " +
          "and/or the SUPABASE_SERVICE_ROLE_KEY secret. Open /api/health for the checklist.",
      },
      503,
    );
  }

  const db = serviceDb(env);
  if (path === "/api/webhooks/microsoft") {
    return handleMsWebhook(db, request);
  }
  // OAuth callback is a top-level browser navigation; the one-time state row
  // is the credential (§18: state+PKCE validated, code exchanged server-side).
  const callbackMatch = /^\/api\/integrations\/callback\/(google|microsoft)$/.exec(path);
  if (callbackMatch && request.method === "GET") {
    return handleCallback(db, env, origin, callbackMatch[1], url);
  }

  // ---- authenticated -------------------------------------------------------
  const user = await authenticate(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const membership = await membershipFor(db, user.id);
  if (!membership) return json({ error: "no_household" }, 403);
  const admin = membership.role === "owner" || membership.role === "admin";

  if (path === "/api/me" && request.method === "GET") {
    return json({ user, membership });
  }

  // ---- v1.0: screenshot → event candidates (Owner/Admin/User) --------------
  if (path === "/api/import/image" && request.method === "POST") {
    if (membership.role === "viewer") return json({ error: "forbidden" }, 403);
    return handleImageImport(request, env.AI);
  }

  if (path === "/api/admin/setup-status" && request.method === "GET") {
    if (!admin) return json({ error: "forbidden" }, 403);
    return json({
      google: {
        configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        redirectUri: redirectUriFor(origin, "google"),
        secretNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      },
      microsoft: {
        configured: Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
        redirectUri: redirectUriFor(origin, "microsoft"),
        secretNames: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"],
      },
      webhookUrl: `${origin}/api/webhooks/microsoft`,
      serviceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }

  const connectMatch = /^\/api\/integrations\/(google|microsoft)\/connect$/.exec(path);
  if (connectMatch && request.method === "POST") {
    if (!admin) return json({ error: "forbidden" }, 403);
    return beginConnect(db, env, origin, connectMatch[1], membership.householdId, user.id);
  }

  // ---- ICS subscription feed (WP9): no OAuth, just a URL -------------------
  if (path === "/api/integrations/icsfeed/connect" && request.method === "POST") {
    if (!admin) return json({ error: "forbidden" }, 403);
    const body = (await request.json().catch(() => ({}))) as { url?: string; name?: string };
    const feedUrl = (body.url ?? "").trim();
    const name = (body.name ?? "").trim() || "Subscribed calendar";
    if (!/^https?:\/\//i.test(feedUrl)) return json({ error: "bad_url" }, 400);
    const probe = await feedProbe(feedUrl);
    if (!probe.ok) return json({ error: "feed_invalid", detail: probe.detail }, 422);

    const { data: providerRow } = await db
      .from("service_providers").select("id").eq("code", "ICS_FEED").single();
    const { data: created, error } = await db
      .from("service_connections")
      .insert({
        household_id: membership.householdId,
        provider_id: (providerRow as { id: string }).id,
        provider_code: "ICS_FEED",
        account_email: null,
        account_label: name,
        config: { url: feedUrl, name },
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return json({ error: "connection_create_failed" }, 500);
    const connId = (created as { id: string }).id;
    const { data: cal } = await db
      .from("calendars")
      .insert({
        household_id: membership.householdId,
        name,
        color: "#7a869a",
        source: "ics",
        connection_id: connId,
        remote_id: "feed",
        sync_direction: "pull",
        created_by: user.id,
      })
      .select("id")
      .single();
    await db.from("sync_state").insert({
      household_id: membership.householdId,
      connection_id: connId,
      remote_calendar_id: "feed",
      calendar_id: (cal as { id: string }).id,
    });
    await db.from("sync_jobs").insert({
      household_id: membership.householdId, connection_id: connId, kind: "pull",
    });
    ctx.waitUntil(runDueJobs(db, env, 1));
    return json({ ok: true, detail: probe.detail });
  }

  // ---- Generic CalDAV (WP9): base URL + username + app password -----------
  if (path === "/api/integrations/caldav/connect" && request.method === "POST") {
    if (!admin) return json({ error: "forbidden" }, 403);
    const body = (await request.json().catch(() => ({}))) as {
      base_url?: string; username?: string; password?: string; label?: string;
    };
    const baseUrl = (body.base_url ?? "").trim();
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!/^https:\/\//i.test(baseUrl) || !username || !password) {
      return json({ error: "missing_fields" }, 400);
    }
    // INT-006-style validation before anything is stored.
    let discovered;
    try {
      discovered = await caldavDiscoverCalendars({ baseUrl, username, password });
    } catch (e) {
      return json({
        error: "caldav_connect_failed",
        detail: String(e).includes("auth") ? "Sign-in failed — check username/app password." : "Could not reach or understand that CalDAV server.",
      }, 422);
    }
    const { data: providerRow } = await db
      .from("service_providers").select("id").eq("code", "CALDAV_GENERIC").single();
    const { data: created, error } = await db
      .from("service_connections")
      .insert({
        household_id: membership.householdId,
        provider_id: (providerRow as { id: string }).id,
        provider_code: "CALDAV_GENERIC",
        account_email: username,
        account_label: body.label?.trim() || username,
        config: { base_url: baseUrl, username },
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return json({ error: "connection_create_failed" }, 500);
    // Password stored encrypted, Worker-only (INT-003) — reuses the token vault.
    await db.from("connection_secrets").upsert({
      connection_id: (created as { id: string }).id,
      access_token_enc: await encryptToken(env.SUPABASE_SERVICE_ROLE_KEY, password),
      token_type: "Basic",
      expires_at: null,
    });
    return json({ ok: true, calendars: discovered.length });
  }

  // ---- §15 Backup & Export: household data as a JSON archive ---------------
  if (path === "/api/admin/backup" && request.method === "GET") {
    if (!admin) return json({ error: "forbidden" }, 403);
    const hh = membership.householdId;
    const grab = async (table: string, filter = "household_id") => {
      const { data } = await db.from(table).select("*").eq(filter, hh).limit(20000);
      return data ?? [];
    };
    const backup = {
      format: "family-calendar-backup",
      version: 4,
      exported_at: new Date().toISOString(),
      household: (await grab("households", "id"))[0] ?? null,
      calendars: await grab("calendars"),
      categories: await grab("categories"),
      people: await grab("people"),
      events: await grab("events"),
      event_attendees: await grab("event_attendees"),
      event_recurrence: await grab("event_recurrence"),
      event_reminders: await grab("event_reminders"),
      event_attachments_metadata: await grab("event_attachments"), // files themselves stay in Storage
      members: await grab("household_members"),
      note: "Restore strategy: see BACKUP.md in the repository. Attachment files and provider tokens are not included.",
    };
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="family-calendar-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  const conflictMatch = /^\/api\/integrations\/conflicts\/([0-9a-f-]{36})\/resolve$/.exec(path);
  if (conflictMatch && request.method === "POST") {
    if (membership.role === "viewer") return json({ error: "forbidden" }, 403);
    const body = (await request.json().catch(() => ({}))) as { choice?: string };
    if (body.choice !== "local" && body.choice !== "remote") {
      return json({ error: "bad_choice" }, 400);
    }
    const result = await resolveConflict(db, env, conflictMatch[1], body.choice, user.id);
    return json(result, result.ok ? 200 : 409);
  }

  const connMatch = /^\/api\/integrations\/([0-9a-f-]{36})\/(calendars|sync|test|disconnect)$/.exec(path);
  if (connMatch) {
    if (!admin) return json({ error: "forbidden" }, 403);
    const conn = await connectionForRequest(db, connMatch[1], membership.householdId);
    if (!conn) return json({ error: "connection_not_found" }, 404);
    const op = connMatch[2];

    try {
      if (op === "calendars" && request.method === "GET") {
        return json({ calendars: await listRemoteCalendars(db, env, conn) });
      }
      if (op === "calendars" && request.method === "POST") {
        const body = (await request.json()) as {
          picks: { remoteId: string; name: string; color: string | null; direction: string; selected: boolean }[];
        };
        await selectCalendars(db, conn, body.picks ?? []);
        await db.from("sync_jobs").insert({
          household_id: conn.household_id, connection_id: conn.id, kind: "pull",
        });
        ctx.waitUntil(runDueJobs(db, env, 1));
        return json({ ok: true });
      }
      if (op === "sync" && request.method === "POST") {
        const counters = await runConnectionSync(db, env, conn, crypto.randomUUID());
        return json({ ok: true, ...counters });
      }
      if (op === "test" && request.method === "POST") {
        return json(await testConnection(db, env, conn));
      }
      if (op === "disconnect" && request.method === "POST") {
        const provider = await providerFor(db, conn);
        await revokeConnection(db, env, conn, {
          token_url: provider.auth.token_url ?? "",
          revocation_url: provider.auth.revocation_url,
        });
        await db.from("webhook_subscriptions")
          .update({ status: "expired" }).eq("connection_id", conn.id);
        // INT-004: local calendars/events remain; sync goes inactive.
        await db.from("service_connections")
          .update({ status: "disconnected", status_detail: "disconnected_by_admin" })
          .eq("id", conn.id);
        return json({ ok: true });
      }
    } catch (e) {
      // API-002: stable code outward, detail stays in logs.
      log({ api: path, ok: false, error: String(e) });
      return json({ error: "provider_unavailable" }, 502);
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const limit = url.pathname.startsWith("/api/webhooks/") ? 300 : 120;
      if (rateLimited(request, limit)) {
        return json({ error: "rate_limited" }, 429);
      }
      return handleApi(request, env, ctx as ExecutionContext);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    if (isPlaceholder(env.SUPABASE_URL) || !env.SUPABASE_SERVICE_ROLE_KEY) {
      log({ job: "scheduled", ok: false, error: "worker_not_configured — see /api/health" });
      return;
    }
    const db = serviceDb(env);
    ctx.waitUntil(
      (async () => {
        await deliverReminders(env);
        await ensureDueJobs(db);
        await runDueJobs(db, env, 2);
        // Origin for webhook registration: APP_ORIGIN var when set, otherwise
        // recovered from the most recent OAuth flow (it stored the app origin).
        const origin = env.APP_ORIGIN ?? (await originFromOauthStates(db));
        if (origin) await maintainSubscriptions(db, env, origin);
        // Retention purge roughly once an hour (cron fires every 5 minutes).
        if (new Date().getMinutes() < 5) await retentionPurge(db);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
