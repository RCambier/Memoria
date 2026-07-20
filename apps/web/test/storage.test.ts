import { describe, expect, it } from "vitest";
import {
  clearConnectedSheetId,
  getActiveKind,
  getConnectedSheetId,
  setActiveKind,
  setConnectedSheetId,
  type KeyValueStore,
} from "../src/lib/storage.js";

function fakeStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("connected sheet ids (one per kind)", () => {
  it("returns null when nothing is cached", () => {
    const store = fakeStore();
    expect(getConnectedSheetId("board", store)).toBeNull();
    expect(getConnectedSheetId("notes", store)).toBeNull();
  });

  it("round-trips per kind independently", () => {
    const store = fakeStore();
    setConnectedSheetId("board", "sheet-b", store);
    setConnectedSheetId("notes", "sheet-n", store);
    expect(getConnectedSheetId("board", store)).toBe("sheet-b");
    expect(getConnectedSheetId("notes", store)).toBe("sheet-n");
  });

  it("clears one kind without touching the other", () => {
    const store = fakeStore();
    setConnectedSheetId("board", "sheet-b", store);
    setConnectedSheetId("notes", "sheet-n", store);
    clearConnectedSheetId("board", store);
    expect(getConnectedSheetId("board", store)).toBeNull();
    expect(getConnectedSheetId("notes", store)).toBe("sheet-n");
  });
});

describe("legacy single-sheet cache migration", () => {
  it("seeds the matching kind's slot from the old id + kind pair", () => {
    const store = fakeStore({ "todos:spreadsheetId": "old-board", "todos:collectionKind": "board" });
    expect(getConnectedSheetId("board", store)).toBe("old-board");
    expect(getConnectedSheetId("notes", store)).toBeNull();
  });

  it("treats a missing legacy kind as board", () => {
    const store = fakeStore({ "todos:spreadsheetId": "old-board" });
    expect(getConnectedSheetId("board", store)).toBe("old-board");
  });

  it("seeds the notes slot when the legacy kind was notes", () => {
    const store = fakeStore({ "todos:spreadsheetId": "old-notes", "todos:collectionKind": "notes" });
    expect(getConnectedSheetId("notes", store)).toBe("old-notes");
    expect(getConnectedSheetId("board", store)).toBeNull();
  });

  it("clearing the migrated kind also drops the legacy pair (no re-seed)", () => {
    const store = fakeStore({ "todos:spreadsheetId": "old-board", "todos:collectionKind": "board" });
    expect(getConnectedSheetId("board", store)).toBe("old-board");
    clearConnectedSheetId("board", store);
    expect(getConnectedSheetId("board", store)).toBeNull();
  });
});

describe("active kind", () => {
  it("defaults to board", () => {
    expect(getActiveKind(fakeStore())).toBe("board");
  });

  it("round-trips", () => {
    const store = fakeStore();
    setActiveKind("notes", store);
    expect(getActiveKind(store)).toBe("notes");
  });

  it("falls back to the legacy kind key", () => {
    expect(getActiveKind(fakeStore({ "todos:collectionKind": "notes" }))).toBe("notes");
  });
});
