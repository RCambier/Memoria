import { describe, expect, it } from "vitest";
import type { Collection } from "../src/api/drive.js";
import { deriveSlots } from "../src/lib/slots.js";

function col(id: string, kind: Collection["kind"], modifiedTime = "2026-07-01T00:00:00.000Z"): Collection {
  return { id, name: id, kind, modifiedTime };
}

const none = { board: null, notes: null, memories: null };

describe("deriveSlots", () => {
  it("gives empty slots for an empty listing", () => {
    expect(deriveSlots([], none)).toEqual({
      board: { connected: null, extras: [] },
      notes: { connected: null, extras: [] },
      memories: { connected: null, extras: [] },
    });
  });

  it("connects the only sheet of each kind", () => {
    const board = col("b1", "board");
    const notes = col("n1", "notes");
    const memories = col("m1", "memories");
    const slots = deriveSlots([board, notes, memories], none);
    expect(slots.board).toEqual({ connected: board, extras: [] });
    expect(slots.notes).toEqual({ connected: notes, extras: [] });
    expect(slots.memories).toEqual({ connected: memories, extras: [] });
  });

  it("prefers the cached id while it's still listed", () => {
    const newer = col("b-new", "board");
    const cached = col("b-cached", "board");
    const slots = deriveSlots([newer, cached], { ...none, board: "b-cached" });
    expect(slots.board.connected).toBe(cached);
    expect(slots.board.extras).toEqual([newer]);
  });

  it("falls back to the newest (listing order) when the cached id is gone", () => {
    const first = col("b1", "board");
    const second = col("b2", "board");
    const slots = deriveSlots([first, second], { ...none, board: "unlinked" });
    expect(slots.board.connected).toBe(first);
    expect(slots.board.extras).toEqual([second]);
  });

  it("never mixes kinds between slots", () => {
    const board = col("b1", "board");
    const notes = col("n1", "notes");
    const memories = col("m1", "memories");
    const slots = deriveSlots([board, notes, memories], { board: "n1", notes: "m1", memories: "b1" });
    expect(slots.board.connected).toBe(board);
    expect(slots.notes.connected).toBe(notes);
    expect(slots.memories.connected).toBe(memories);
  });
});
