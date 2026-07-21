import { describe, expect, it } from "vitest";
import {
  blockedColumnId,
  columnIds,
  columnsToRows,
  COLUMNS_HEADERS,
  DEFAULT_NEW_COLUMNS,
  doneColumnId,
  hiddenColumns,
  LEGACY_COLUMNS,
  orderColumns,
  parseColumnsSheet,
  releaseColumnId,
  slugifyColumnId,
  visibleColumns,
  type BoardColumn,
} from "../src/columns.js";

describe("parseColumnsSheet", () => {
  it("reports empty for a missing/header-only tab", () => {
    expect(parseColumnsSheet([]).empty).toBe(true);
    expect(parseColumnsSheet([[...COLUMNS_HEADERS]]).empty).toBe(true);
  });

  it("parses rows, roles, and ordering", () => {
    const rows = [
      [...COLUMNS_HEADERS],
      ["backlog", "Backlog", "0", "", "", ""],
      ["done", "Done", "2", "1", "", ""],
      ["blocked", "Blocked", "1", "", "1", ""],
      ["later", "Later", "3", "", "", "1"],
    ];
    const { columns, empty } = parseColumnsSheet(rows);
    expect(empty).toBe(false);
    expect(columnIds(columns)).toEqual(["backlog", "blocked", "done", "later"]);
    expect(doneColumnId(columns)).toBe("done");
    expect(blockedColumnId(columns)).toBe("blocked");
    expect(hiddenColumns(columns).map((c) => c.id)).toEqual(["later"]);
    expect(visibleColumns(columns).map((c) => c.id)).toEqual(["backlog", "blocked", "done"]);
  });

  it("skips rows without an id and dedupes by id (first wins)", () => {
    const rows = [
      [...COLUMNS_HEADERS],
      ["", "No id", "0", "", "", ""],
      ["a", "First", "0", "", "", ""],
      ["a", "Duplicate", "1", "", "", ""],
    ];
    const { columns } = parseColumnsSheet(rows);
    expect(columns.map((c) => c.label)).toEqual(["First"]);
  });

  it("clamps done and blocked roles to the first column that claims each", () => {
    const rows = [[...COLUMNS_HEADERS], ["a", "A", "0", "1", "1", ""], ["b", "B", "1", "1", "1", ""]];
    const { columns } = parseColumnsSheet(rows);
    expect(columns.filter((c) => c.done).map((c) => c.id)).toEqual(["a"]);
    expect(columns.filter((c) => c.blocked).map((c) => c.id)).toEqual(["a"]);
  });

  it("falls back to row position when sort_order isn't a number", () => {
    const rows = [[...COLUMNS_HEADERS], ["a", "A", "x", "", "", ""], ["b", "B", "", "", "", ""]];
    expect(columnIds(parseColumnsSheet(rows).columns)).toEqual(["a", "b"]);
  });
});

describe("columnsToRows round-trips", () => {
  it("serializes then parses back to the same columns", () => {
    const { columns } = parseColumnsSheet(columnsToRows(LEGACY_COLUMNS));
    expect(columns).toEqual(orderColumns(LEGACY_COLUMNS));
  });

  it("the default sets carry the expected roles", () => {
    expect(doneColumnId(DEFAULT_NEW_COLUMNS)).toBe("done");
    expect(blockedColumnId(DEFAULT_NEW_COLUMNS)).toBe(null);
    expect(doneColumnId(LEGACY_COLUMNS)).toBe("done");
    expect(blockedColumnId(LEGACY_COLUMNS)).toBe("blocked");
    expect(hiddenColumns(LEGACY_COLUMNS).map((c) => c.id)).toEqual(["admin_renewals", "health_checks"]);
  });
});

describe("releaseColumnId", () => {
  function col(id: string, sortOrder: number, roles: Partial<BoardColumn> = {}): BoardColumn {
    return { id, label: id, sortOrder, done: false, blocked: false, hidden: false, ...roles };
  }

  it("is the working column just left of Blocked on the legacy layout", () => {
    expect(releaseColumnId(LEGACY_COLUMNS)).toBe("in_progress");
  });

  it("is null without a blocked column", () => {
    expect(releaseColumnId(DEFAULT_NEW_COLUMNS)).toBe(null);
  });

  it("skips done and hidden columns when scanning left", () => {
    const columns = [
      col("a", 0),
      col("hid", 1, { hidden: true }),
      col("fin", 2, { done: true }),
      col("blocked", 3, { blocked: true }),
    ];
    expect(releaseColumnId(columns)).toBe("a");
  });

  it("falls back to the nearest eligible column right of Blocked", () => {
    const columns = [col("blocked", 0, { blocked: true }), col("next", 1), col("later", 2)];
    expect(releaseColumnId(columns)).toBe("next");
  });

  it("is null when no column is eligible", () => {
    const columns = [col("blocked", 0, { blocked: true }), col("done", 1, { done: true })];
    expect(releaseColumnId(columns)).toBe(null);
  });
});

describe("slugifyColumnId", () => {
  it("slugifies a label", () => {
    expect(slugifyColumnId("In Progress", [])).toBe("in_progress");
    expect(slugifyColumnId("  Waiting on Ops!  ", [])).toBe("waiting_on_ops");
  });

  it("falls back for an empty slug and dedupes on collision", () => {
    expect(slugifyColumnId("★", [])).toBe("column");
    expect(slugifyColumnId("Done", ["done"])).toBe("done_2");
    expect(slugifyColumnId("Done", ["done", "done_2"])).toBe("done_3");
  });
});
