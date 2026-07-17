/**
 * Transport-free entrypoint: tool registration and the `SheetStore` contract,
 * without `googleapis` or `node:fs` (the stdio-only pieces live in
 * `sheetsClient.ts`, `env.ts`, and `index.ts`, none of which this file
 * imports). This is what lets a different host — e.g. the Vercel MCP
 * function in `apps/web/api/` — register the same six tools against a
 * different `SheetStore` implementation (REST `fetch` with a per-request
 * OAuth token instead of a service account).
 */
export { registerTools } from "./tools.js";
export type { SheetStore } from "./sheetStore.js";
