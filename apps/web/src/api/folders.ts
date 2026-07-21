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
 *         attachments/     ← files attached to tasks
 *       notes/             ← the Notes sheet
 *         attachments/     ← images & files attached to notes
 *       memories/          ← the AI Memories sheet
 *         attachments/     ← images & files attached to memories
 *
 * Folders are found-or-created lazily, once per session. An earlier layout
 * used `boards/` instead of `todos/`; when that folder is found it's simply
 * renamed in place (same folder id — its contents follow for free).
 * Collections that predate the layout (or were created on another device
 * before it ran) are moved in by `organizeCollections`, with a localStorage
 * memo so each file's parents are checked at most once per browser.
 */

interface MemoriaFolders {
  memoriaId: string;
  todosId: string;
  notesId: string;
  memoriesId: string;
  notesAttachmentsId: string;
  todosAttachmentsId: string;
  memoriesAttachmentsId: string;
}

/** v2: the `boards/` → `todos/` layout change re-checks every file's parents once. */
const ORGANIZED_KEY = "todos:organizedFiles:v2";

/**
 * The Memoria root folder's Drive id, remembered across sessions so the
 * topbar's "Open in Google Drive" link works from the first paint (and
 * offline) — refreshed every time the folder tree is ensured.
 */
const MEMORIA_FOLDER_ID_KEY = "todos:memoriaFolderId";

/** The "open this folder in Drive" URL. Pure. */
export function memoriaFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** The remembered Memoria root folder id, or null before the first `ensureMemoriaFolders`. */
export function getCachedMemoriaFolderId(): string | null {
  try {
    return localStorage.getItem(MEMORIA_FOLDER_ID_KEY);
  } catch {
    return null;
  }
}

function cacheMemoriaFolderId(id: string): void {
  try {
    localStorage.setItem(MEMORIA_FOLDER_ID_KEY, id);
  } catch {
    // Storage unavailable — the Drive link just falls back to the sheet.
  }
}

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
      cacheMemoriaFolderId(memoriaId);
      const [todosId, notesId, memoriesId] = await Promise.all([
        ensureTodosFolder(token, memoriaId),
        ensureFolder(token, "notes", memoriaId),
        ensureFolder(token, "memories", memoriaId),
      ]);
      const [notesAttachmentsId, todosAttachmentsId, memoriesAttachmentsId] = await Promise.all([
        ensureFolder(token, "attachments", notesId!),
        ensureFolder(token, "attachments", todosId!),
        ensureFolder(token, "attachments", memoriesId!),
      ]);
      return {
        memoriaId,
        todosId: todosId!,
        notesId: notesId!,
        memoriesId: memoriesId!,
        notesAttachmentsId: notesAttachmentsId!,
        todosAttachmentsId: todosAttachmentsId!,
        memoriesAttachmentsId: memoriesAttachmentsId!,
      };
    })().catch((err: unknown) => {
      foldersPromise = null;
      throw err;
    });
  }
  return foldersPromise;
}

/** The folder a collection of `kind` belongs in. */
export function folderForKind(folders: MemoriaFolders, kind: CollectionKind): string {
  return kind === "memories" ? folders.memoriesId : kind === "notes" ? folders.notesId : folders.todosId;
}

/** The attachments folder for a kind (files dropped on a note / a memory / a task). */
export function attachmentsFolderForKind(folders: MemoriaFolders, kind: CollectionKind): string {
  return kind === "memories"
    ? folders.memoriesAttachmentsId
    : kind === "notes"
      ? folders.notesAttachmentsId
      : folders.todosAttachmentsId;
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
 * Moves every tagged collection into `Memoria/todos/`, `Memoria/notes/`, or `Memoria/memories/`.
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
