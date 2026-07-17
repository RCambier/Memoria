import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { loadConfig, unconfiguredResponse } from "./config.js";
import { DRIVE_FILE_SCOPE } from "./google.js";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). Served at two paths that resolve to this same
 * handler — `/api/oauth/protected-resource` (what `/api/mcp`'s 401 `WWW-Authenticate` header always
 * points at, so it's guaranteed reachable) and `/.well-known/oauth-protected-resource` (the
 * spec's conventional path, wired up via a `vercel.json` rewrite as a courtesy to clients that try
 * well-known discovery before making an authenticated request).
 */
export function protectedResourceMetadataGET(request: Request): Response {
  if (!loadConfig()) return unconfiguredResponse();
  const origin = getPublicOrigin(request);
  // resourceUrl is passed explicitly: the RFC 9728 resource identifier is the MCP endpoint, not
  // whichever of the two metadata paths this handler happens to be answering from.
  return protectedResourceHandler({ authServerUrls: [origin], resourceUrl: `${origin}/api/mcp` })(request);
}

export const metadataOPTIONS = metadataCorsOptionsRequestHandler();

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414). Unlike protected-resource metadata, this one
 * *must* live at the literal well-known path — compliant OAuth clients construct it themselves by
 * appending `/.well-known/oauth-authorization-server` to the issuer URL we advertise, so there's no
 * header we control that could point them elsewhere.
 */
export function authorizationServerMetadataGET(request: Request): Response {
  if (!loadConfig()) return unconfiguredResponse();
  const origin = getPublicOrigin(request);
  const metadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [DRIVE_FILE_SCOPE],
  };
  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
