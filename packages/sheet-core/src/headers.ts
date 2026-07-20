/**
 * Constants describing the shape of the Todos Google Sheet. There is exactly
 * one tab, named `Tasks`, whose row 1 is a frozen header matching `HEADERS`
 * exactly (same names, same order).
 */

/** Name of the spreadsheet tab that holds tasks. */
export const SHEET_TAB_NAME = "Tasks";

/**
 * Column headers, in column order (A..J). This is the contract both clients
 * validate against — the header row of the sheet must match exactly (or
 * match `LEGACY_HEADERS`, the pre-due_date/tags shape; see `parseSheet`).
 */
export const HEADERS = [
  "id",
  "title",
  "status",
  "sort_order",
  "notes",
  "source",
  "created_at",
  "updated_at",
  "due_date",
  "tags",
] as const;

/**
 * The original 8-column header (before `due_date` and `tags`). Sheets with
 * this exact header still parse — their tasks just have no due date or tags
 * — and the web app extends the header in place (an additive, non-destructive
 * write of two new header cells) the first time it loads one.
 */
export const LEGACY_HEADERS = HEADERS.slice(0, 8);

/** Google Drive `appProperties` key used to tag spreadsheets created by this app. */
export const APP_PROPERTY_KEY = "todosBoard";
export const APP_PROPERTY_VALUE = "1";
