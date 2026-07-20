import { HEADERS, NOTES_HEADERS, NOTES_TAB_NAME, SHEET_TAB_NAME } from "@memoria/sheet-core";
import { authedFetch, authedJson } from "./http.js";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * The tab a call operates on. Every function here takes one, defaulting to
 * the Tasks tab so the board call sites read unchanged; notes call sites
 * pass `NOTES_TAB`.
 */
export interface SheetTab {
  name: string;
  headers: readonly string[];
}

export const TASKS_TAB: SheetTab = { name: SHEET_TAB_NAME, headers: HEADERS };
export const NOTES_TAB: SheetTab = { name: NOTES_TAB_NAME, headers: NOTES_HEADERS };

/** Last column letter, derived from the header count so it can't drift from the schema. */
function lastColumn(tab: SheetTab): string {
  return String.fromCharCode(64 + tab.headers.length);
}

function fullRange(tab: SheetTab): string {
  return `${tab.name}!A:${lastColumn(tab)}`;
}

function rowRange(tab: SheetTab, rowNumber: number): string {
  return `${tab.name}!A${rowNumber}:${lastColumn(tab)}${rowNumber}`;
}

/** Reads every row currently in the tab, header included. */
export async function getValues(
  token: string,
  spreadsheetId: string,
  tab: SheetTab = TASKS_TAB,
): Promise<string[][]> {
  const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(fullRange(tab))}`;
  const data = await authedJson<{ values?: string[][] }>(token, url);
  return data.values ?? [];
}

/** Appends one row after the tab's last row (used for inserts). */
export async function appendRow(
  token: string,
  spreadsheetId: string,
  row: string[],
  tab: SheetTab = TASKS_TAB,
): Promise<void> {
  const url =
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(fullRange(tab))}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await authedFetch(token, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
}

/** Overwrites exactly one existing row (1-indexed spreadsheet row, header = 1). */
export async function updateRow(
  token: string,
  spreadsheetId: string,
  rowNumber: number,
  row: string[],
  tab: SheetTab = TASKS_TAB,
): Promise<void> {
  const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(rowRange(tab, rowNumber))}?valueInputOption=RAW`;
  await authedFetch(token, url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
}

/** Lists the spreadsheet's tabs (title + internal numeric id), in sheet order. */
export async function listTabs(
  token: string,
  spreadsheetId: string,
): Promise<{ title: string; sheetId: number }[]> {
  const url = `${BASE}/${spreadsheetId}?fields=sheets.properties`;
  const data = await authedJson<{ sheets?: { properties?: { title?: string; sheetId?: number } }[] }>(
    token,
    url,
  );
  return (data.sheets ?? []).flatMap((s) =>
    s.properties?.title !== undefined && s.properties.sheetId != null
      ? [{ title: s.properties.title, sheetId: s.properties.sheetId }]
      : [],
  );
}

/** Renames one tab (used when bootstrapping an empty picked sheet, so ranges resolve). */
export async function renameTab(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  title: string,
): Promise<void> {
  await authedFetch(token, `${BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ updateSheetProperties: { properties: { sheetId, title }, fields: "title" } }],
    }),
  });
}

/** Fetches the tab's internal numeric sheetId, needed for row deletion. */
export async function getTabSheetId(
  token: string,
  spreadsheetId: string,
  tab: SheetTab = TASKS_TAB,
): Promise<number> {
  const found = (await listTabs(token, spreadsheetId)).find((t) => t.title === tab.name);
  if (!found) {
    throw new Error(`This spreadsheet has no tab named "${tab.name}".`);
  }
  return found.sheetId;
}

/** Deletes exactly one row. */
export async function deleteRow(
  token: string,
  spreadsheetId: string,
  rowNumber: number,
  tab: SheetTab = TASKS_TAB,
): Promise<void> {
  const sheetId = await getTabSheetId(token, spreadsheetId, tab);
  const url = `${BASE}/${spreadsheetId}:batchUpdate`;
  await authedFetch(token, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
          },
        },
      ],
    }),
  });
}

/** Creates a new spreadsheet with a single tab named for `tab`. Returns its spreadsheet ID. */
export async function createSpreadsheet(
  token: string,
  title: string,
  tab: SheetTab = TASKS_TAB,
): Promise<string> {
  const data = await authedJson<{ spreadsheetId: string }>(token, BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: tab.name } }],
    }),
  });
  return data.spreadsheetId;
}

/** Writes the header row (used when creating a collection or bootstrapping an empty attached sheet). */
export async function writeHeaderRow(
  token: string,
  spreadsheetId: string,
  tab: SheetTab = TASKS_TAB,
): Promise<void> {
  await updateRow(token, spreadsheetId, 1, [...tab.headers], tab);
}
