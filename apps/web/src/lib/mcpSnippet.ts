/**
 * Builds ready-to-paste MCP server configs for this board. The server isn't
 * published to npm — it's meant to be built and run from a clone of this
 * repo (see docs/SETUP.md) — so the snippets point `node` at the built
 * entrypoint rather than an `npx` package name.
 *
 * The repo path and service-account key path are local to whatever machine
 * the agent runs on, and this app has no way to know either — so both show
 * up as clearly-marked placeholders for the user to replace. The
 * spreadsheet id, on the other hand, is known, so it's inlined for real.
 */

const SERVER_ENTRYPOINT_PLACEHOLDER = "/path/to/Todos/packages/mcp-server/dist/index.js";
const CREDENTIALS_PLACEHOLDER = "/path/to/service-account.json";

/** The manual `.mcp.json` / Claude Desktop-style config block. */
export function buildMcpConfigSnippet(spreadsheetId: string): string {
  const config = {
    mcpServers: {
      todos: {
        command: "node",
        args: [SERVER_ENTRYPOINT_PLACEHOLDER],
        env: {
          TODOS_SPREADSHEET_ID: spreadsheetId,
          GOOGLE_APPLICATION_CREDENTIALS: CREDENTIALS_PLACEHOLDER,
        },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

/** The `claude mcp add` one-liner equivalent of `buildMcpConfigSnippet`. */
export function buildClaudeCodeCliSnippet(spreadsheetId: string): string {
  return (
    `claude mcp add todos --scope user ` +
    `-e TODOS_SPREADSHEET_ID=${spreadsheetId} ` +
    `-e GOOGLE_APPLICATION_CREDENTIALS=${CREDENTIALS_PLACEHOLDER} ` +
    `-- node ${SERVER_ENTRYPOINT_PLACEHOLDER}`
  );
}
