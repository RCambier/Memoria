import type { SheetStore } from "@memoria/sheet-core";
import { appendRow, deleteRow, getValues, updateRow } from "./sheets.js";

/**
 * The one `SheetStore` adapter: a caller's OAuth token bound to one
 * spreadsheet, over the plain-`fetch` Sheets helpers. Used identically by
 * the web app (`board/boardApi.ts`) and the hosted MCP connector
 * (`api/_lib/sheetStore.ts`) — the board operations behind it live in
 * `@memoria/sheet-core`.
 */
export class HttpSheetStore implements SheetStore {
  constructor(
    private readonly token: string,
    private readonly spreadsheetId: string,
  ) {}

  readRows(): Promise<string[][]> {
    return getValues(this.token, this.spreadsheetId);
  }

  async appendRow(row: string[]): Promise<void> {
    await appendRow(this.token, this.spreadsheetId, row);
  }

  async updateRow(rowNumber: number, row: string[]): Promise<void> {
    await updateRow(this.token, this.spreadsheetId, rowNumber, row);
  }

  async deleteRow(rowNumber: number): Promise<void> {
    await deleteRow(this.token, this.spreadsheetId, rowNumber);
  }
}
