import {
  ensureFolder,
  findFolder,
  moveToFolder,
  renameFile,
  type Collection,
  type CollectionKind,
} from "./drive.js";

/**
 * The app's home in the user's Drive — one folder per sheet kind:
 *
 *     Memoria/
 *       todos/             ← the Todos sheet
 *       notes/             ← the Notes sheet
 *         attachments/     ← images pasted into notes
 *
 * Folders are found-or-created lazily, once per session. An earlier layout
 * used `boards/` instead of `todos/`; when that folder is found it's simply
 * renamed in place (same folder id — its contents follow for free).
 * Collections that predate the layout (or were created on another device
 * before it ran) are moved in by `organizeCollections`, with a localStorage
 * memo so each file's parents are checked at most once per browser.
 */

export interface MemoriaFolders {
  memoriaId: string;
  todosId: string;
  notesId: string;
  attachmentsId: string;
}

/** v2: the `boards/` → `todos/` layout change re-checks every file's parents once. */
const ORGANIZED_KEY = "todos:organizedFiles:v2";

let foldersPromise: Promise<MemoriaFolders> | null = null;

/**
 * Finds or creates the `todos/` folder. The one migration wrinkle: a Drive
 * that still has the old `boards/` folder gets it renamed to `todos/` —
 * one PATCH, id unchanged, files inside untouched.
 */
async function ensureTodosFolder(token: string, memoriaId: string): Promise<string> {
  const existing = await findFolder(token, "todos", memoriaId);
  if (existing) return existing;
  const legacy = await findFolder(token, "boards", memoriaId);
  if (legacy) {
    await renameFile(token, legacy, "todos");
    return legacy;
  }
  return ensureFolder(token, "todos", memoriaId);
}

/** Finds or creates the Memoria folder tree. Memoized per session; a failure clears the memo. */
export function ensureMemoriaFolders(token: string): Promise<MemoriaFolders> {
  if (!foldersPromise) {
    foldersPromise = (async () => {
      const memoriaId = await ensureFolder(token, "Memoria", "root");
      const [todosId, notesId] = await Promise.all([
        ensureTodosFolder(token, memoriaId),
        ensureFolder(token, "notes", memoriaId),
      ]);
      const attachmentsId = await ensureFolder(token, "attachments", notesId!);
      return { memoriaId, todosId: todosId!, notesId: notesId!, attachmentsId };
    })().catch((err: unknown) => {
      foldersPromise = null;
      throw err;
    });
  }
  return foldersPromise;
}

/** The folder a collection of `kind` belongs in. */
export function folderForKind(folders: MemoriaFolders, kind: CollectionKind): string {
  return kind === "notes" ? folders.notesId : folders.todosId;
}

function readOrganized(): Set<string> {
  try {
    const raw = localStorage.getItem(ORGANIZED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeOrganized(ids: Set<string>): void {
  try {
    localStorage.setItem(ORGANIZED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — worst case the parents get re-checked next boot.
  }
}

/** Marks a file as already living in the Memoria tree (e.g. it was just created there). */
export function markOrganized(fileId: string): void {
  const ids = readOrganized();
  ids.add(fileId);
  writeOrganized(ids);
}

/**
 * Moves every tagged collection into `Memoria/todos/` or `Memoria/notes/`.
 * Best-effort and quiet: a failure (offline, revoked file) leaves that file
 * where it is and retries on a later boot. Never touches file contents.
 */
export async function organizeCollections(token: string, collections: Collection[]): Promise<void> {
  const organized = readOrganized();
  const pending = collections.filter((c) => !organized.has(c.id));
  if (pending.length === 0) return;

  const folders = await ensureMemoriaFolders(token);
  for (const c of pending) {
    try {
      await moveToFolder(token, c.id, folderForKind(folders, c.kind));
      organized.add(c.id);
    } catch {
      // Leave it for a future boot; organizing is never load-bearing.
    }
  }
  writeOrganized(organized);
}
