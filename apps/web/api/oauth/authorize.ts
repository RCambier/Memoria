import { getPublicOrigin } from "mcp-handler";
import { loadConfig, unconfiguredResponse } from "../_lib/config.js";
import { decodeClientId, isAllowedRedirectUri } from "../_lib/clientId.js";
import { sealBlob } from "../_lib/blob.js";
import { buildGoogleAuthorizeUrl } from "../_lib/google.js";

/**
 * First leg of the proxy: validate the client's request, then hand off to Google. Nothing here is
 * trusted to come back unmodified — `code_challenge`, the client's `redirect_uri`, and its `state`
 * are packed into an encrypted, authenticated blob (`_lib/blob.ts`) and passed as *our* `state` to
 * Google, so `/api/oauth/callback` can recover them without a database and without trusting
 * whatever Google's redirect happens to carry.
 */

function requestError(message: string): Response {
  return new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function GET(request: Request): Response {
  const config = loadConfig();
  if (!config) return unconfiguredResponse();

  const params = new URL(request.url).searchParams;
  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const clientState = params.get("state") ?? "";
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  if (responseType !== "code") return requestError("Only response_type=code is supported.");
  if (!clientId) return requestError("Missing client_id.");
  if (!redirectUri) return requestError("Missing redirect_uri.");
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return requestError("PKCE is required and only code_challenge_method=S256 is supported.");
  }

  const decoded = decodeClientId(config.authSigningSecret, clientId);
  if (!decoded) return requestError("Unknown or invalid client_id.");
  if (!isAllowedRedirectUri(redirectUri) || !decoded.redirectUris.includes(redirectUri)) {
    return requestError("redirect_uri does not match this client's registration.");
  }

  const sealedState = sealBlob(config.authSigningSecret, "oauth-state", {
    redirectUri,
    clientState,
    codeChallenge,
    issuedAt: Date.now(),
  });

  const googleAuthorizeUrl = buildGoogleAuthorizeUrl({
    googleClientId: config.googleClientId,
    redirectUri: `${getPublicOrigin(request)}/api/oauth/callback`,
    state: sealedState,
  });

  return Response.redirect(googleAuthorizeUrl, 302);
}
