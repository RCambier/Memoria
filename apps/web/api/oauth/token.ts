import { getPublicOrigin } from "mcp-handler";
import { loadConfig, unconfiguredResponse } from "../_lib/config.js";
import { isFresh, openBlob } from "../_lib/blob.js";
import { decodeClientId } from "../_lib/clientId.js";
import { verifyPkceS256 } from "../_lib/pkce.js";
import { exchangeGoogleAuthCode, GoogleTokenError, refreshGoogleToken } from "../_lib/google.js";

/**
 * Third leg: exchange our authorization code (`authorization_code` grant) or proxy a refresh
 * (`refresh_token` grant) to Google using our own client credentials, and return Google's token
 * response as-is. Never logs a code, token, or secret — errors surface Google's `error`/
 * `error_description` fields only.
 */

interface CodePayload {
  googleCode: string;
  codeChallenge: string;
  redirectUri: string;
  issuedAt: number;
}

function tokenError(status: number, error: string, description?: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenSuccess(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** The token endpoint accepts standard `application/x-www-form-urlencoded`, per RFC 6749 §4.1.3. */
async function readParams(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const entries: [string, string][] = Object.entries(body).map(([k, v]) => [k, String(v)]);
    return new URLSearchParams(entries);
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: Request): Promise<Response> {
  const config = loadConfig();
  if (!config) return unconfiguredResponse();

  const params = await readParams(request);
  const grantType = params.get("grant_type");

  const clientId = params.get("client_id");
  if (!clientId || !decodeClientId(config.authSigningSecret, clientId)) {
    return tokenError(400, "invalid_client", "Unknown or invalid client_id.");
  }

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const codeVerifier = params.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) {
      return tokenError(400, "invalid_request", "code, redirect_uri, and code_verifier are all required.");
    }

    const payload = openBlob<CodePayload>(config.authSigningSecret, "oauth-code", code);
    if (!payload || !isFresh(payload.issuedAt)) {
      return tokenError(400, "invalid_grant", "This authorization code is invalid or has expired.");
    }
    if (payload.redirectUri !== redirectUri) {
      return tokenError(
        400,
        "invalid_grant",
        "redirect_uri does not match the one used to obtain this code.",
      );
    }
    if (!verifyPkceS256(codeVerifier, payload.codeChallenge)) {
      return tokenError(400, "invalid_grant", "code_verifier does not match the original code_challenge.");
    }

    try {
      const googleTokens = await exchangeGoogleAuthCode({
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
        code: payload.googleCode,
        redirectUri: `${getPublicOrigin(request)}/api/oauth/callback`,
      });
      return tokenSuccess(googleTokens);
    } catch (err) {
      if (err instanceof GoogleTokenError) return tokenError(400, err.code, err.message);
      return tokenError(502, "server_error", "Could not reach Google's token endpoint.");
    }
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return tokenError(400, "invalid_request", "refresh_token is required.");

    try {
      const googleTokens = await refreshGoogleToken({
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
        refreshToken,
      });
      return tokenSuccess(googleTokens);
    } catch (err) {
      if (err instanceof GoogleTokenError) return tokenError(400, err.code, err.message);
      return tokenError(502, "server_error", "Could not reach Google's token endpoint.");
    }
  }

  return tokenError(400, "unsupported_grant_type", `grant_type "${String(grantType)}" is not supported.`);
}
