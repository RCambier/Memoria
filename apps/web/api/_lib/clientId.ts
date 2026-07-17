import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Dynamic Client Registration (`/api/oauth/register`) is stateless: instead
 * of persisting registered clients, the `client_id` we hand back *is* the
 * client's redirect URIs, base64url-encoded and HMAC-tagged with
 * `AUTH_SIGNING_SECRET`. `/api/oauth/authorize` can then validate a
 * `client_id` — and recover the redirect URIs it was registered with —
 * without a database, and reject anything whose tag doesn't check out
 * (i.e. wasn't minted by this server).
 *
 * Only two redirect URIs are ever allowed, matching claude.ai's and
 * claude.com's MCP OAuth callback exactly (string equality, not a prefix or
 * suffix match — that's what keeps a lookalike domain like
 * `claude.ai.evil.example` or `notclaude.ai` from ever registering).
 */
export const ALLOWED_REDIRECT_URIS: readonly string[] = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export function isAllowedRedirectUri(redirectUri: string): boolean {
  return ALLOWED_REDIRECT_URIS.includes(redirectUri);
}

function tag(signingSecretHex: string, payloadB64: string): string {
  return createHmac("sha256", Buffer.from(signingSecretHex, "hex")).update(payloadB64).digest("base64url");
}

/** Encodes a client's (already-allowlisted) redirect URIs into an opaque, verifiable `client_id`. */
export function encodeClientId(signingSecretHex: string, redirectUris: readonly string[]): string {
  const canonical = JSON.stringify({ redirect_uris: [...redirectUris].sort() });
  const payloadB64 = Buffer.from(canonical, "utf8").toString("base64url");
  return `${payloadB64}.${tag(signingSecretHex, payloadB64)}`;
}

export interface DecodedClientId {
  redirectUris: string[];
}

/** Validates a `client_id`'s HMAC tag and recovers the redirect URIs it encodes, or `undefined`. */
export function decodeClientId(signingSecretHex: string, clientId: string): DecodedClientId | undefined {
  const separatorIndex = clientId.indexOf(".");
  if (separatorIndex < 0) return undefined;
  const payloadB64 = clientId.slice(0, separatorIndex);
  const providedTag = clientId.slice(separatorIndex + 1);

  const expected = Buffer.from(tag(signingSecretHex, payloadB64), "base64url");
  let provided: Buffer;
  try {
    provided = Buffer.from(providedTag, "base64url");
  } catch {
    return undefined;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return undefined;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("redirect_uris" in parsed) ||
      !Array.isArray((parsed as { redirect_uris: unknown }).redirect_uris) ||
      !(parsed as { redirect_uris: unknown[] }).redirect_uris.every((uri) => typeof uri === "string")
    ) {
      return undefined;
    }
    return { redirectUris: (parsed as { redirect_uris: string[] }).redirect_uris };
  } catch {
    return undefined;
  }
}
