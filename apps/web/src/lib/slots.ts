import type { Collection, CollectionKind } from "../api/drive.js";

/**
 * The app manages exactly one connected sheet per kind (one Todos board, one
 * Notes grid). Drive can still hold more tagged sheets of a kind — created
 * elsewhere or left over from older versions — so the listing is folded into
 * a *slot* per kind: the connected sheet plus any extras, which the setup
 * screen surfaces for switching to or unlinking.
 */
export interface KindSlot {
  connected: Collection | null;
  /** Other tagged sheets of this kind, newest-modified first. */
  extras: Collection[];
}

export type Slots = Record<CollectionKind, KindSlot>;

/**
 * Folds the Drive listing (newest-modified first) into one slot per kind.
 * A kind's cached id wins while it's still listed; otherwise the newest
 * sheet of that kind is the connected one.
 */
export function deriveSlots(
  collections: readonly Collection[],
  cachedIds: { board: string | null; notes: string | null },
): Slots {
  const slotFor = (kind: CollectionKind): KindSlot => {
    const ofKind = collections.filter((c) => c.kind === kind);
    const connected = ofKind.find((c) => c.id === cachedIds[kind]) ?? ofKind[0] ?? null;
    return { connected, extras: ofKind.filter((c) => c !== connected) };
  };
  return { board: slotFor("board"), notes: slotFor("notes") };
}
