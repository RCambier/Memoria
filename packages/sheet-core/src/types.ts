/** A task's column in the board. Order here is display order, left to right. */
export const STATUSES = ["backlog", "in_progress", "done"] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** Who created the task. Informational only — never used for authorization. */
export const SOURCES = ["user", "agent"] as const;

export type Source = (typeof SOURCES)[number];

export interface Task {
  id: string;
  title: string;
  status: Status;
  /** Ascending within a column = top to bottom. A float; see ordering.ts. */
  sortOrder: number;
  notes: string;
  source: Source;
  /** ISO 8601, set once at creation. */
  createdAt: string;
  /** ISO 8601, set on every mutation. */
  updatedAt: string;
  /** Due date as `YYYY-MM-DD`, or `""` for none. */
  dueDate: string;
  /** Free-form labels. Stored comma-separated in the sheet, so names can't contain commas. */
  tags: string[];
}

/** A raw row of string cells as returned by the Sheets API (already A:J sliced). */
export type SheetRow = string[];
