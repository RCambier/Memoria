import { isBlankRow, parseNotesSheet, parseSheet } from "@memoria/sheet-core";
import { moveToFolder, tagAsBoard, tagAsNotes, type CollectionKind } from "../api/drive.js";
import { ensureMemoriaFolders, folderForKind, markOrganized } from "../api/folders.js";
import {
  createSpreadsheet,
  getValues,
  listTabs,
  NOTES_TAB,
  renameTab,
  TASKS_TAB,
  writeHeaderRow,
  type SheetTab,
} from "../api/sheets.js";

function tabForKind(kind: CollectionKind): SheetTab {
  return kind === "notes" ? NOTES_TAB : TASKS_TAB;
}

function tagForKind(token: string, spreadsheetId: string, kind: CollectionKind): Promise<void> {
  return kind === "notes" ? tagAsNotes(token, spreadsheetId) : tagAsBoard(token, spreadsheetId);
}

/**
 * Creates a brand-new collection sheet: a spreadsheet with the right tab +
 * header row, the appProperties tag for reconnect, filed under
 * `Memoria/todos/` or `Memoria/notes/` in the user's Drive. Filing is
 * best-effort — a failure leaves the sheet in the Drive root, where the
 * boot-time organizer will pick it up later.
 */
export async function createCollection(token: string, title: string, kind: CollectionKind): Promise<string> {
  const tab = tabForKind(kind);
  const spreadsheetId = await createSpreadsheet(token, title, tab);
  await writeHeaderRow(token, spreadsheetId, tab);
  await tagForKind(token, spreadsheetId, kind);
  try {
    const folders = await ensureMemoriaFolders(token);
    await moveToFolder(token, spreadsheetId, folderForKind(folders, kind));
    markOrganized(spreadsheetId);
  } catch {
    // Left unfiled; organizeCollections retries on a later boot.
  }
  return spreadsheetId;
}

type AttachOutcome = { kind: "attached" } | { kind: "bootstrapped" } | { kind: "refused"; reason: string };

/**
 * Handles the "link an existing sheet" path (Picker result), for either
 * kind: an empty sheet gets the kind's tab + headers bootstrapped; a sheet
 * whose tab already holds valid rows of that kind is attached as-is;
 * anything else is refused with a precise reason rather than silently
 * reinterpreted. Attached sheets stay where the user keeps them — they
 * explicitly chose that file, so we don't move it.
 */
export async function attachOrBootstrap(
  token: string,
  spreadsheetId: string,
  kind: CollectionKind,
): Promise<AttachOutcome> {
  const tab = tabForKind(kind);
  const tabs = await listTabs(token, spreadsheetId);
  const existing = tabs.find((t) => t.title === tab.name);

  if (!existing) {
    // No matching tab. A single-tab sheet with no data is "an empty sheet" —
    // rename its tab so ranges resolve, then bootstrap. Anything else holds
    // content we won't reinterpret.
    const only = tabs.length === 1 ? tabs[0] : undefined;
    if (!only) {
      return {
        kind: "refused",
        reason: `it has several tabs and none is named "${tab.name}".`,
      };
    }
    const rows = await getValues(token, spreadsheetId, { name: only.title, headers: tab.headers });
    if (rows.length > 0 && !rows.every(isBlankRow)) {
      return {
        kind: "refused",
        reason: `it already has content but no "${tab.name}" tab.`,
      };
    }
    await renameTab(token, spreadsheetId, only.sheetId, tab.name);
    await writeHeaderRow(token, spreadsheetId, tab);
    await tagForKind(token, spreadsheetId, kind);
    markOrganized(spreadsheetId); // user-picked: leave it where they keep it
    return { kind: "bootstrapped" };
  }

  const rawRows = await getValues(token, spreadsheetId, tab);
  if (rawRows.length === 0 || rawRows.every(isBlankRow)) {
    await writeHeaderRow(token, spreadsheetId, tab);
    await tagForKind(token, spreadsheetId, kind);
    markOrganized(spreadsheetId);
    return { kind: "bootstrapped" };
  }

  const result = kind === "notes" ? parseNotesSheet(rawRows) : parseSheet(rawRows);
  if (result.ok) {
    await tagForKind(token, spreadsheetId, kind);
    markOrganized(spreadsheetId);
    return { kind: "attached" };
  }
  return { kind: "refused", reason: result.error.message };
}
