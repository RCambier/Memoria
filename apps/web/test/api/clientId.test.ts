import { describe, expect, it } from "vitest";
import {
  ALLOWED_REDIRECT_URIS,
  decodeClientId,
  encodeClientId,
  isAllowedRedirectUri,
} from "../../api/_lib/clientId.js";

const SECRET = "c".repeat(64);
const OTHER_SECRET = "d".repeat(64);
const CLAUDE_AI_URI = "https://claude.ai/api/mcp/auth_callback";
const CLAUDE_COM_URI = "https://claude.com/api/mcp/auth_callback";

describe("isAllowedRedirectUri", () => {
  it("allows the exact claude.ai and claude.com callback URLs", () => {
    expect(isAllowedRedirectUri(CLAUDE_AI_URI)).toBe(true);
    expect(isAllowedRedirectUri(CLAUDE_COM_URI)).toBe(true);
    expect(ALLOWED_REDIRECT_URIS).toHaveLength(2);
  });

  it("rejects lookalike domains", () => {
    expect(isAllowedRedirectUri("https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(isAllowedRedirectUri("https://notclaude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isAllowedRedirectUri("https://evil.com/claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai.attacker.com/api/mcp/auth_callback")).toBe(false);
  });

  it("rejects a same-host path or scheme variant", () => {
    expect(isAllowedRedirectUri("http://claude.ai/api/mcp/auth_callback")).toBe(false); // wrong scheme
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback/")).toBe(false); // trailing slash
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false); // query string
    expect(isAllowedRedirectUri("https://claude.ai:443/api/mcp/auth_callback")).toBe(false); // explicit port
  });
});

describe("encodeClientId / decodeClientId", () => {
  it("round-trips a single redirect URI", () => {
    const clientId = encodeClientId(SECRET, [CLAUDE_AI_URI]);
    expect(decodeClientId(SECRET, clientId)).toEqual({ redirectUris: [CLAUDE_AI_URI] });
  });

  it("round-trips multiple redirect URIs regardless of input order", () => {
    const a = encodeClientId(SECRET, [CLAUDE_AI_URI, CLAUDE_COM_URI]);
    const b = encodeClientId(SECRET, [CLAUDE_COM_URI, CLAUDE_AI_URI]);
    // Canonicalized (sorted) before encoding, so registering in either order yields the same id.
    expect(a).toBe(b);
    expect(decodeClientId(SECRET, a)?.redirectUris.sort()).toEqual([CLAUDE_AI_URI, CLAUDE_COM_URI].sort());
  });

  it("rejects a client_id encoded with a different secret", () => {
    const clientId = encodeClientId(SECRET, [CLAUDE_AI_URI]);
    expect(decodeClientId(OTHER_SECRET, clientId)).toBeUndefined();
  });

  it("rejects a client_id with a tampered payload (redirect URI substitution)", () => {
    const clientId = encodeClientId(SECRET, [CLAUDE_AI_URI]);
    const [payloadB64, tag] = clientId.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }),
    ).toString("base64url");
    expect(decodeClientId(SECRET, `${forgedPayload}.${tag}`)).toBeUndefined();
    void payloadB64;
  });

  it("rejects malformed client_ids without throwing", () => {
    expect(() => decodeClientId(SECRET, "not-a-client-id")).not.toThrow();
    expect(decodeClientId(SECRET, "not-a-client-id")).toBeUndefined();
    expect(decodeClientId(SECRET, "")).toBeUndefined();
    expect(decodeClientId(SECRET, ".")).toBeUndefined();
  });
});
