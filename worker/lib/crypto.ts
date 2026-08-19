/**
 * Provider-token encryption at rest (§18 "Token encryption").
 *
 * AES-256-GCM with a key derived (HKDF-SHA256) from the service-role secret,
 * which exists only as a Worker secret. Nothing extra to provision, the key
 * never appears in the database, and rows in connection_secrets are opaque
 * without it. Rotating the service-role key invalidates stored tokens, which
 * simply forces a re-connect — an acceptable failure mode for a household.
 */

const SALT = "family-calendar/token-encryption/v1";

async function deriveKey(secret: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(SALT),
      info: new TextEncoder().encode("aes-gcm-256"),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(secret: string, plaintext: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptToken(secret: string, encoded: string): Promise<string> {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const key = await deriveKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12),
  );
  return new TextDecoder().decode(pt);
}
