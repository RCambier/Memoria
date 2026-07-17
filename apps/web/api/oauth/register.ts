import { z } from "zod";
import { loadConfig, unconfiguredResponse } from "../_lib/config.js";
import { encodeClientId, isAllowedRedirectUri } from "../_lib/clientId.js";

/**
 * Dynamic Client Registration (RFC 7591), stateless: we don't persist a client record. The
 * `client_id` we hand back *is* the (allowlisted) redirect URIs, HMAC-tagged — see
 * `_lib/clientId.ts`. Everything else the client sends (name, grant types, ...) is accepted but
 * not stored; we only ever support one grant/response-type shape, so echoing it back is enough.
 */

const registerRequestSchema = z
  .object({
    redirect_uris: z.array(z.string().min(1)).min(1, "redirect_uris must not be empty"),
  })
  .passthrough();

function registrationError(status: number, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const config = loadConfig();
  if (!config) return unconfiguredResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return registrationError(400, "invalid_client_metadata", "Request body must be JSON.");
  }

  const parsed = registerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return registrationError(
      400,
      "invalid_client_metadata",
      parsed.error.issues[0]?.message ?? "Invalid client metadata.",
    );
  }

  const badRedirectUri = parsed.data.redirect_uris.find((uri) => !isAllowedRedirectUri(uri));
  if (badRedirectUri) {
    return registrationError(
      400,
      "invalid_redirect_uri",
      `"${badRedirectUri}" is not an allowed redirect URI. This connector only supports the ` +
        "claude.ai and claude.com MCP OAuth callbacks.",
    );
  }

  const clientId = encodeClientId(config.authSigningSecret, parsed.data.redirect_uris);

  return new Response(
    JSON.stringify({
      client_id: clientId,
      redirect_uris: parsed.data.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}
