import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Sealed, authenticated blobs used to carry OAuth state across redirects
 * without a database: the `state` param on the trip to Google, and our own
 * "authorization code" on the way back. AES-256-GCM via `node:crypto` —
 * tamper or truncate the blob and it fails to open; there is nothing to
 * forge without `AUTH_SIGNING_SECRET`.
 *
 * The key is derived per-`purpose` (HMAC-SHA256 of the secret keyed by the
 * purpose string) rather than reusing one key everywhere. That's what makes
 * a `oauth-state` blob unopenable as a `oauth-code` blob and vice versa —
 * cheap insurance against a token-confusion bug elsewhere in the flow.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** How long a sealed blob (OAuth state or our authorization code) stays valid. */
export const BLOB_TTL_MS = 10 * 60 * 1000;

function deriveKey(signingSecretHex: string, purpose: string): Buffer {
  return createHmac("sha256", Buffer.from(signingSecretHex, "hex")).update(purpose).digest();
}

/** Seals `payload` (anything JSON-serializable) into an opaque, tamper-evident, base64url string. */
export function sealBlob(signingSecretHex: string, purpose: string, payload: unknown): string {
  const key = deriveKey(signingSecretHex, purpose);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

/**
 * Opens a blob sealed with `sealBlob` under the same `purpose`. Returns
 * `undefined` for anything malformed, tampered, or sealed under a different
 * purpose or secret — callers can't distinguish "tampered" from "expired"
 * from this alone, which is intentional (no oracle for attackers); check
 * the payload's own timestamp against `BLOB_TTL_MS` separately.
 */
export function openBlob<T>(signingSecretHex: string, purpose: string, blob: string): T | undefined {
  let raw: Buffer;
  try {
    raw = Buffer.from(blob, "base64url");
  } catch {
    return undefined;
  }
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) return undefined;

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const key = deriveKey(signingSecretHex, purpose);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    // Wrong key/purpose, truncated ciphertext, bad auth tag, or invalid JSON — all the same
    // "not a valid blob" outcome to the caller.
    return undefined;
  }
}

/** True if a sealed blob's embedded `issuedAt` (ms epoch) is still within `BLOB_TTL_MS`. */
export function isFresh(issuedAt: number, now: number = Date.now()): boolean {
  return now - issuedAt >= 0 && now - issuedAt <= BLOB_TTL_MS;
}
