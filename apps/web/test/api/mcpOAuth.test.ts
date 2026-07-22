import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeClientId } from "../../api/_lib/clientId.js";
import { GET as authorize } from "../../api/oauth/authorize.js";
import { GET as callback } from "../../api/oauth/callback.js";
import { POST as register } from "../../api/oauth/register.js";

const ORIGIN = "https://todos.example";
const SECRET = "a".repeat(64);
const CODEX_CALLBACK = "http://127.0.0.1:49152/callback/memoria-client";

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("AUTH_SIGNING_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function registrationRequest(redirectUri: string): Request {
  return new Request(`${ORIGIN}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirectUri] }),
  });
}

describe("native MCP OAuth", () => {
  it("registers, authorizes, and redirects back to a Codex loopback callback", async () => {
    const registration = await register(registrationRequest(CODEX_CALLBACK));
    expect(registration.status).toBe(201);

    const { client_id: clientId } = (await registration.json()) as { client_id: string };
    expect(decodeClientId(SECRET, clientId)).toEqual({ redirectUris: [CODEX_CALLBACK] });

    const authorizeUrl = new URL(`${ORIGIN}/api/oauth/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: CODEX_CALLBACK,
      state: "codex-state",
      code_challenge: "pkce-challenge",
      code_challenge_method: "S256",
    }).toString();

    const authorization = authorize(new Request(authorizeUrl));
    expect(authorization.status).toBe(302);

    const googleUrl = new URL(authorization.headers.get("location")!);
    expect(googleUrl.origin).toBe("https://accounts.google.com");
    expect(googleUrl.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/oauth/callback`);

    const googleCallbackUrl = new URL(`${ORIGIN}/api/oauth/callback`);
    googleCallbackUrl.search = new URLSearchParams({
      code: "google-authorization-code",
      state: googleUrl.searchParams.get("state")!,
    }).toString();

    const completed = callback(new Request(googleCallbackUrl));
    expect(completed.status).toBe(302);

    const clientCallbackUrl = new URL(completed.headers.get("location")!);
    expect(clientCallbackUrl.origin + clientCallbackUrl.pathname).toBe(CODEX_CALLBACK);
    expect(clientCallbackUrl.searchParams.get("state")).toBe("codex-state");
    expect(clientCallbackUrl.searchParams.get("code")).toBeTruthy();
    expect(clientCallbackUrl.searchParams.get("code")).not.toContain("google-authorization-code");
  });

  it("rejects a non-numeric localhost callback during registration", async () => {
    const registration = await register(
      registrationRequest("http://localhost:49152/callback/memoria-client"),
    );

    expect(registration.status).toBe(400);
    expect(await registration.json()).toMatchObject({
      error: "invalid_redirect_uri",
      error_description: expect.stringContaining("numeric loopback address"),
    });
  });
});
