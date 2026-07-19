import type { BoardCatalog, BoardInfo, SheetStore } from "@memoria/mcp-server";
import { findBoards } from "../../src/api/drive.js";
import { HttpSheetStore } from "../../src/api/sheetStore.js";

/**
 * The connector's `BoardCatalog`: the same Drive listing (`src/api/drive.ts`)
 * and the same `SheetStore` adapter (`src/api/sheetStore.ts`) the web app
 * uses, bound to the caller's per-request OAuth token. One instance per
 * request: the Drive listing runs at most once (on first use) and is cached
 * for the rest of that request's tool calls — and not at all when every call
 * names its `board_id`.
 */
export class RemoteBoardCatalog implements BoardCatalog {
  private boardsPromise: Promise<BoardInfo[]> | undefined;

  constructor(private readonly token: string) {}

  listBoards(): Promise<BoardInfo[]> {
    if (!this.boardsPromise) {
      this.boardsPromise = findBoards(this.token);
    }
    return this.boardsPromise;
  }

  openBoard(id: string): SheetStore {
    return new HttpSheetStore(this.token, id);
  }
}
