const SPREADSHEET_ID_KEY = "todos:spreadsheetId";

/** Minimal subset of the `Storage` interface, so tests can inject a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getCachedSpreadsheetId(store: KeyValueStore = localStorage): string | null {
  return store.getItem(SPREADSHEET_ID_KEY);
}

export function setCachedSpreadsheetId(id: string, store: KeyValueStore = localStorage): void {
  store.setItem(SPREADSHEET_ID_KEY, id);
}

export function clearCachedSpreadsheetId(store: KeyValueStore = localStorage): void {
  store.removeItem(SPREADSHEET_ID_KEY);
}

function sharedServiceAccountKey(spreadsheetId: string): string {
  return `todos:sharedServiceAccount:${spreadsheetId}`;
}

/**
 * Remembers which service account a board has been shared with, so the
 * Settings panel's "connect an agent" guide still shows step 2 as done (and
 * step 3 visible) after closing and reopening it — independent of whether
 * the share happened in this browser session.
 */
export function getSharedServiceAccountEmail(
  spreadsheetId: string,
  store: KeyValueStore = localStorage,
): string | null {
  return store.getItem(sharedServiceAccountKey(spreadsheetId));
}

export function setSharedServiceAccountEmail(
  spreadsheetId: string,
  email: string,
  store: KeyValueStore = localStorage,
): void {
  store.setItem(sharedServiceAccountKey(spreadsheetId), email);
}
