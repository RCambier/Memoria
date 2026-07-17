import { describe, expect, it } from "vitest";
import { buildClaudeCodeCliSnippet, buildMcpConfigSnippet } from "../src/lib/mcpSnippet.js";

describe("buildMcpConfigSnippet", () => {
  it("embeds the spreadsheet id in the env block", () => {
    const snippet = buildMcpConfigSnippet("SHEET_ID_123");
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.todos.env.TODOS_SPREADSHEET_ID).toBe("SHEET_ID_123");
  });

  it("produces valid JSON pointing node at the built server entrypoint, with placeholder paths", () => {
    const parsed = JSON.parse(buildMcpConfigSnippet("abc"));
    expect(parsed.mcpServers.todos.command).toBe("node");
    expect(parsed.mcpServers.todos.args[0]).toMatch(/^\/path\/to\/Todos\/.*mcp-server\/dist\/index\.js$/);
    expect(parsed.mcpServers.todos.env.GOOGLE_APPLICATION_CREDENTIALS).toBe("/path/to/service-account.json");
  });
});

describe("buildClaudeCodeCliSnippet", () => {
  it("embeds the spreadsheet id", () => {
    const snippet = buildClaudeCodeCliSnippet("SHEET_ID_123");
    expect(snippet).toContain("TODOS_SPREADSHEET_ID=SHEET_ID_123");
  });

  it("is a claude mcp add one-liner pointing node at the built server entrypoint", () => {
    const snippet = buildClaudeCodeCliSnippet("abc");
    expect(snippet).toMatch(/^claude mcp add todos --scope user /);
    expect(snippet).toContain("GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json");
    expect(snippet).toMatch(/-- node \/path\/to\/Todos\/.*mcp-server\/dist\/index\.js$/);
  });
});
