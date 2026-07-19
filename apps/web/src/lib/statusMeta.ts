import type { Status } from "@memoria/sheet-core";

/** Display metadata per status — the one place to touch when a column is added or renamed. */
export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  done: "Done",
};

export const STATUS_PILL_CLASS: Record<Status, string> = {
  backlog: "pill-backlog",
  in_progress: "pill-progress",
  done: "pill-done",
};
