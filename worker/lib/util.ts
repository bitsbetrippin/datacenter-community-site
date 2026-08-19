export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** secrets — set with `wrangler secret put` or the dashboard */
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  /** optional override for webhook registration origin */
  APP_ORIGIN?: string;
  /** Workers AI binding — add  "ai": { "binding": "AI" }  to wrangler.jsonc */
  AI?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256B64url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

/** Convert a local wall-clock time in an IANA zone to a real UTC Date. */
export function zonedTimeToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const got = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return new Date(guess + (guess - got));
}

/** Local wall-clock parts of a UTC instant in a zone. */
export function utcToZonedParts(d: Date, timeZone: string): {
  y: number; mo: number; d: number; h: number; mi: number; s: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  return {
    y: Number(p.year), mo: Number(p.month), d: Number(p.day),
    h: Number(p.hour === "24" ? "0" : p.hour), mi: Number(p.minute), s: Number(p.second),
  };
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** iCal basic stamp of a Date's UTC fields (used for fake-UTC DTSTART). */
export function icalStamp(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}${pad(s)}Z`;
}

export function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify(entry));
}
