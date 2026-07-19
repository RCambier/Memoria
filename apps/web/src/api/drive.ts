import { APP_PROPERTY_KEY, APP_PROPERTY_VALUE } from "@memoria/sheet-core";
import { authedFetch, authedJson } from "./http.js";

const BASE = "https://www.googleapis.com/drive/v3/files";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

export interface DriveFile {
  id: string;
  name: string;
  /** ISO 8601 last-modified timestamp. */
  modifiedTime: string;
}

/**
 * THE board-listing query — the one place the "what counts as a board"
 * filter lives: spreadsheets tagged with `appProperties.todosBoard = "1"`
 * at creation time that the current `drive.file`-scoped token can still
 * see, newest-modified first. Used by the web app's shelf/tabs and by the
 * hosted MCP connector's board catalog (`api/_lib/sheetStore.ts`).
 */
export async function findBoards(token: string): Promise<DriveFile[]> {
  const q =
    `mimeType='${SPREADSHEET_MIME_TYPE}' and trashed=false and ` +
    `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' }`;
  const params = new URLSearchParams({
    q,
    orderBy: "modifiedTime desc",
    pageSize: "50",
    fields: "files(id,name,modifiedTime)",
    spaces: "drive",
  });
  const data = await authedJson<{ files?: DriveFile[] }>(token, `${BASE}?${params.toString()}`);
  return (data.files ?? []).map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime }));
}

/** Tags a spreadsheet as a Todos board so `findBoards` can find it later from any device. */
export async function tagAsBoard(token: string, fileId: string): Promise<void> {
  const url = `${BASE}/${fileId}?fields=id`;
  await authedFetch(token, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appProperties: { [APP_PROPERTY_KEY]: APP_PROPERTY_VALUE } }),
  });
}

/** Fetches basic metadata for a Picker-selected file, to check it's actually a spreadsheet. */
export async function getFileMeta(
  token: string,
  fileId: string,
): Promise<{ id: string; name: string; mimeType: string }> {
  const url = `${BASE}/${fileId}?fields=id,name,mimeType`;
  return authedJson(token, url);
}
