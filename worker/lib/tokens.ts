import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./util";
import { decryptToken, encryptToken } from "./crypto";

/**
 * Token vault (INT-003): access/refresh tokens live encrypted in
 * connection_secrets (no client policies) and are decrypted only here,
 * inside the Worker. Refresh happens automatically; a dead refresh token
 * flips the connection to "attention" per the §14.2 auth-expired policy.
 */

interface ProviderAuthConfig {
  token_url: string;
  revocation_url?: string;
}

export function clientCredsFor(env: Env, providerCode: string): { id: string; secret: string } | null {
  if (providerCode === "GOOGLE_CALENDAR") {
    return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
      : null;
  }
  if (providerCode === "MS_GRAPH_CALENDAR") {
    return env.MS_CLIENT_ID && env.MS_CLIENT_SECRET
      ? { id: env.MS_CLIENT_ID, secret: env.MS_CLIENT_SECRET }
      : null;
  }
  return null;
}

export class AuthExpiredError extends Error {
  constructor() {
    super("auth_expired");
  }
}

export async function storeTokens(
  db: SupabaseClient,
  env: Env,
  connectionId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    connection_id: connectionId,
    access_token_enc: await encryptToken(env.SUPABASE_SERVICE_ROLE_KEY, tokens.access_token),
    token_type: tokens.token_type ?? "Bearer",
    expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) {
    patch.refresh_token_enc = await encryptToken(env.SUPABASE_SERVICE_ROLE_KEY, tokens.refresh_token);
  }
  await db.from("connection_secrets").upsert(patch, { onConflict: "connection_id" });
}

export async function getAccessToken(
  db: SupabaseClient,
  env: Env,
  connection: { id: string; provider_code: string },
  authConfig: ProviderAuthConfig,
): Promise<string> {
  const { data } = await db
    .from("connection_secrets")
    .select("*")
    .eq("connection_id", connection.id)
    .maybeSingle();
  const secrets = data as {
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    expires_at: string | null;
  } | null;
  if (!secrets?.access_token_enc) throw new AuthExpiredError();

  const fresh =
    secrets.expires_at && new Date(secrets.expires_at).getTime() > Date.now() + 120_000;
  if (fresh) {
    return decryptToken(env.SUPABASE_SERVICE_ROLE_KEY, secrets.access_token_enc);
  }

  if (!secrets.refresh_token_enc) throw new AuthExpiredError();
  const refreshToken = await decryptToken(env.SUPABASE_SERVICE_ROLE_KEY, secrets.refresh_token_enc);
  const creds = clientCredsFor(env, connection.provider_code);
  if (!creds) throw new AuthExpiredError();

  const res = await fetch(authConfig.token_url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: creds.id,
      client_secret: creds.secret,
    }),
  });
  if (!res.ok) {
    // §14.2: authentication expired → pause sync, mark attention.
    await db
      .from("service_connections")
      .update({ status: "attention", status_detail: "reauthentication_required" })
      .eq("id", connection.id);
    throw new AuthExpiredError();
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  await storeTokens(db, env, connection.id, tokens);
  return tokens.access_token;
}

export async function revokeConnection(
  db: SupabaseClient,
  env: Env,
  connection: { id: string; provider_code: string },
  authConfig: ProviderAuthConfig,
): Promise<void> {
  try {
    if (authConfig.revocation_url) {
      const { data } = await db
        .from("connection_secrets")
        .select("refresh_token_enc, access_token_enc")
        .eq("connection_id", connection.id)
        .maybeSingle();
      const s = data as { refresh_token_enc: string | null; access_token_enc: string | null } | null;
      const enc = s?.refresh_token_enc ?? s?.access_token_enc;
      if (enc) {
        const token = await decryptToken(env.SUPABASE_SERVICE_ROLE_KEY, enc);
        await fetch(authConfig.revocation_url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      }
    }
  } catch {
    // Best effort — disconnect proceeds regardless (INT-004).
  }
  await db.from("connection_secrets").delete().eq("connection_id", connection.id);
}
