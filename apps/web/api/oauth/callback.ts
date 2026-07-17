import { loadConfig, unconfiguredResponse } from "../_lib/config.js";
import { isFresh, openBlob, sealBlob } from "../_lib/blob.js";

/**
 * Second leg: Google redirects here with its own authorization code. We don't hand that code to
 * the client directly — we wrap it in a fresh sealed blob (our own "authorization code") alongside
 * the PKCE challenge and redirect URI captured at `/authorize` time, then send the client on to
 * *its* redirect URI. `/api/oauth/token` is the only place that ever exchanges the real Google code.
 */

interface StatePayload {
  redirectUri: string;
  clientState: string;
  codeChallenge: string;
  issuedAt: number;
}

function plainTextError(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function GET(request: Request): Response {
  const config = loadConfig();
  if (!config) return unconfiguredResponse();

  const params = new URL(request.url).searchParams;
  const stateParam = params.get("state");
  if (!stateParam) return plainTextError(400, "Missing state parameter.");

  const state = openBlob<StatePayload>(config.authSigningSecret, "oauth-state", stateParam);
  if (!state || !isFresh(state.issuedAt)) {
    return plainTextError(
      400,
      "This sign-in link is invalid or has expired. Go back to claude.ai and add the connector again.",
    );
  }

  const redirectToClient = (extra: Record<string, string>): Response => {
    const target = new URL(state.redirectUri);
    for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value);
    return Response.redirect(target.toString(), 302);
  };

  const googleError = params.get("error");
  if (googleError) return redirectToClient({ error: googleError, state: state.clientState });

  const googleCode = params.get("code");
  if (!googleCode) return redirectToClient({ error: "server_error", state: state.clientState });

  const ourCode = sealBlob(config.authSigningSecret, "oauth-code", {
    googleCode,
    codeChallenge: state.codeChallenge,
    redirectUri: state.redirectUri,
    issuedAt: Date.now(),
  });

  return redirectToClient({ code: ourCode, state: state.clientState });
}
