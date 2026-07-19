/**
 * The narrow surface the board operations (`board.ts`) need from a sheet
 * backend, always bound to a single board. Transport-free by design — no
 * `googleapis`, no `fetch`, nothing that assumes how the caller
 * authenticates. The web app and the hosted MCP connector both satisfy it
 * with the same plain-`fetch` adapter (`apps/web/src/api/sheetStore.ts`);
 * tests supply an in-memory fake.
 */
export interface SheetStore {
  readRows(): Promise<string[][]>;
  appendRow(row: string[]): Promise<void>;
  updateRow(rowNumber: number, row: string[]): Promise<void>;
  deleteRow(rowNumber: number): Promise<void>;
}
