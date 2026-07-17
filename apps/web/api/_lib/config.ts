/**
 * The hosted MCP connector is entirely optional. It's configured only if
 * all three env vars below are set; if any is missing, every `/api/*`
 * route responds 503 with a plain explanation instead of a confusing crash
 * — a fork that skips this feature loses nothing else (see
 * docs/ARCHITECTURE.md, "Hosted MCP connector").
 */
export interface HostedMcpConfig {
  googleClientId: string;
  googleClientSecret: string;
  authSigningSecret: string;
}

const MIN_SIGNING_SECRET_BYTES = 32;

function isValidSigningSecret(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value) && value.length >= MIN_SIGNING_SECRET_BYTES * 2;
}

/** Reads and validates the three hosted-connector env vars. Returns `undefined` if unconfigured. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): HostedMcpConfig | undefined {
  const googleClientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const authSigningSecret = env.AUTH_SIGNING_SECRET?.trim();

  if (!googleClientId || !googleClientSecret || !authSigningSecret) return undefined;
  if (!isValidSigningSecret(authSigningSecret)) {
    // Never log the secret itself — just that it's shaped wrong.
    console.error(
      `[hosted-mcp] AUTH_SIGNING_SECRET must be at least ${MIN_SIGNING_SECRET_BYTES} bytes of hex ` +
        `(${MIN_SIGNING_SECRET_BYTES * 2}+ hex characters). Treating the hosted connector as unconfigured.`,
    );
    return undefined;
  }

  return { googleClientId, googleClientSecret, authSigningSecret };
}

/** The uniform response for every hosted-connector route when the deployment hasn't configured it. */
export function unconfiguredResponse(): Response {
  return new Response(
    "The hosted MCP connector is not configured on this deployment. Its deployment owner needs to " +
      "set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and AUTH_SIGNING_SECRET (see " +
      "docs/SETUP.md) and redeploy. Nothing else in this app is affected.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
