import type { SupabaseClient } from "@supabase/supabase-js";
import { json, randomToken, sha256B64url, type Env } from "./lib/util";
import { clientCredsFor, storeTokens } from "./lib/tokens";

/**
 * OAuth connect + callback (§17, SEC/CSRF requirements):
 *   - state + PKCE (S256) on both providers (§18 CSRF/OAuth)
 *   - authorization code exchanged server-side only (INT-003)
 *   - redirect URI is derived from the request origin, so the exact value to
 *     register in each provider console is shown in the app's setup card.
 */

interface ProviderOauth {
  code: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams: Record<string, string>;
}

export function oauthProfileFor(providerCode: string): ProviderOauth | null {
  if (providerCode === "google") {
    return {
      code: "GOOGLE_CALENDAR",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar", "openid", "email"],
      extraAuthParams: { access_type: "offline", prompt: "consent" },
    };
  }
  if (providerCode === "microsoft") {
    return {
      code: "MS_GRAPH_CALENDAR",
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["offline_access", "User.Read", "Calendars.ReadWrite"],
      extraAuthParams: { response_mode: "query" },
    };
  }
  return null;
}

export function redirectUriFor(origin: string, provider: string): string {
  return `${origin}/api/integrations/callback/${provider}`;
}

/** POST /api/integrations/:provider/connect  (Owner/Admin, JWT already checked) */
export async function beginConnect(
  db: SupabaseClient,
  env: Env,
  origin: string,
  provider: string,
  householdId: string,
  userId: string,
): Promise<Response> {
  const profile = oauthProfileFor(provider);
  if (!profile) return json({ error: "unknown_provider" }, 404);
  const creds = clientCredsFor(env, profile.code);
  if (!creds) return json({ error: "provider_not_configured" }, 409);

  const state = randomToken(24);
  const verifier = randomToken(48);
  await db.from("oauth_states").insert({
    state,
    household_id: householdId,
    user_id: userId,
    provider_code: profile.code,
    pkce_verifier: verifier,
    redirect_to: `${origin}/settings/integrations`,
  });

  const params = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: redirectUriFor(origin, provider),
    response_type: "code",
    scope: profile.scopes.join(" "),
    state,
    code_challenge: await sha256B64url(verifier),
    code_challenge_method: "S256",
    ...profile.extraAuthParams,
  });
  return json({ url: `${profile.authUrl}?${params}` });
}

/** GET /api/integrations/callback/:provider — top-level navigation, state is the auth. */
export async function handleCallback(
  db: SupabaseClient,
  env: Env,
  origin: string,
  provider: string,
  url: URL,
): Promise<Response> {
  const back = (q: string) =>
    Response.redirect(`${origin}/settings/integrations?${q}`, 302);

  const profile = oauthProfileFor(provider);
  if (!profile) return back("error=unknown_provider");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error=denied");

  const { data: stateRow } = await db
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("used", false)
    .maybeSingle();
  const st = stateRow as {
    household_id: string; user_id: string; provider_code: string; pkce_verifier: string;
    created_at: string;
  } | null;
  if (!st || st.provider_code !== profile.code) return back("error=state_mismatch");
  if (Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back("error=state_expired");
  await db.from("oauth_states").update({ used: true }).eq("state", state);

  const creds = clientCredsFor(env, profile.code)!;
  const tokenRes = await fetch(profile.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: creds.id,
      client_secret: creds.secret,
      redirect_uri: redirectUriFor(origin, provider),
      code_verifier: st.pkce_verifier,
    }),
  });
  if (!tokenRes.ok) return back("error=token_exchange_failed");
  const tokens = (await tokenRes.json()) as {
    access_token: string; refresh_token?: string; expires_in?: number; token_type?: string;
  };

  // Identify the account for the connection label.
  let accountEmail: string | null = null;
  try {
    if (provider === "google") {
      const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (res.ok) accountEmail = ((await res.json()) as { email?: string }).email ?? null;
    } else {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (res.ok) {
        const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
        accountEmail = me.mail ?? me.userPrincipalName ?? null;
      }
    }
  } catch {
    /* label only */
  }

  const { data: providerRow } = await db
    .from("service_providers")
    .select("id")
    .eq("code", profile.code)
    .single();

  // One connection per (household, provider, account) — reconnect updates it.
  const { data: existing } = await db
    .from("service_connections")
    .select("id")
    .eq("household_id", st.household_id)
    .eq("provider_code", profile.code)
    .eq("account_email", accountEmail)
    .neq("status", "disconnected")
    .maybeSingle();

  let connectionId: string;
  if (existing) {
    connectionId = (existing as { id: string }).id;
    await db
      .from("service_connections")
      .update({ status: "connected", status_detail: null, last_error: null })
      .eq("id", connectionId);
  } else {
    const { data: created, error } = await db
      .from("service_connections")
      .insert({
        household_id: st.household_id,
        provider_id: (providerRow as { id: string }).id,
        provider_code: profile.code,
        account_email: accountEmail,
        account_label: accountEmail,
        scopes: profile.scopes,
        created_by: st.user_id,
      })
      .select("id")
      .single();
    if (error || !created) return back("error=connection_create_failed");
    connectionId = (created as { id: string }).id;
  }

  await storeTokens(db, env, connectionId, tokens);
  return back(`connected=${provider}`);
}
