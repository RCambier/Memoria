import { createHash, timingSafeEqual } from "node:crypto";

/** Verifies a PKCE `code_verifier` against the `code_challenge` captured at `/authorize` time (S256 only). */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const computed = Buffer.from(createHash("sha256").update(codeVerifier).digest("base64url"));
  const expected = Buffer.from(codeChallenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
