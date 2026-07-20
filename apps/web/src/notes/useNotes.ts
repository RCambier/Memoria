import {
  applyNotesPending,
  enqueueNoteOp,
  MalformedSheetError,
  NoteNotFoundError,
  notesOrder,
  type Note,
  type NotePendingOp,
  type SheetError,
} from "@memoria/sheet-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/http.js";
import {
  readNotesOutbox,
  readNotesReplica,
  writeNotesOutbox,
  writeNotesReplica,
  type PersistedNotesReplica,
} from "../lib/storage.js";
import * as notesApi from "./notesApi.js";

const POLL_INTERVAL_MS = 5000;

type NotesState =
  | { status: "loading" }
  | { status: "ready"; notes: Note[] }
  | { status: "malformed"; error: SheetError }
  | { status: "error"; message: string };

interface UseNotesResult {
  state: NotesState;
  /** When the last successful (or malformed-but-reachable) read completed. */
  lastSyncedAt: Date | null;
  /** True while the sheet can't be reached; notes keep working locally. */
  offline: boolean;
  /** Local mutations not yet confirmed against the sheet. */
  pendingCount: number;
  /** Google rejected the queued write (not a connectivity problem) — shown so a wedged queue is never silent. */
  writeRejected: string | null;
  /** Creates a note locally and returns it immediately (the editor opens on it). */
  addNote: (input: { title?: string; body?: string }) => Note | null;
  updateNote: (id: string, patch: { title?: string; body?: string }) => void;
  deleteNote: (id: string) => void;
  refresh: () => Promise<void>;
}

/** One notes sheet's local-first state: the last server snapshot plus the pending-op queue. */
interface LocalNotes {
  sheetId: string | null;
  replica: PersistedNotesReplica | null;
  outbox: NotePendingOp[];
}

function loadLocal(sheetId: string | null): LocalNotes {
  if (!sheetId) return { sheetId, replica: null, outbox: [] };
  return { sheetId, replica: readNotesReplica(sheetId), outbox: readNotesOutbox(sheetId) };
}

/**
 * Owns notes state for one spreadsheet — the notes twin of `useBoard`, same
 * local-first scheme (projection = replica + outbox, single-flight flusher,
 * epoch-guarded polls), minus what notes don't have: columns, ordering
 * writes, and the legacy-header upgrade.
 */
export function useNotes(token: string | null, spreadsheetId: string | null): UseNotesResult {
  const [local, setLocal] = useState<LocalNotes>(() => loadLocal(spreadsheetId));
  const [malformed, setMalformed] = useState<SheetError | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [writeRejected, setWriteRejected] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Reset local state when the sheet changes — render-time-with-guard, so no
  // frame shows sheet A's notes under sheet B.
  if (local.sheetId !== spreadsheetId) {
    setLocal(loadLocal(spreadsheetId));
    setMalformed(null);
    setFetchError(null);
    setWriteRejected(null);
    setLastSyncedAt(null);
  }

  const localRef = useRef(local);
  localRef.current = local;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const malformedRef = useRef(malformed);
  malformedRef.current = malformed;

  const pollInFlight = useRef(false);
  const flushing = useRef(false);
  /** Bumped after every confirmed write; polls that predate a bump are discarded. */
  const syncEpoch = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist on every change, keyed by the sheet the state belongs to.
  useEffect(() => {
    if (!local.sheetId) return;
    if (local.replica) writeNotesReplica(local.sheetId, local.replica);
    writeNotesOutbox(local.sheetId, local.outbox);
  }, [local]);

  const projection = useMemo(
    () => (local.replica ? notesOrder(applyNotesPending(local.replica.notes, local.outbox)) : null),
    [local],
  );
  const projectionRef = useRef(projection);
  projectionRef.current = projection;

  const setOutbox = useCallback((sheetId: string, ops: NotePendingOp[]) => {
    setLocal((l) => (l.sheetId === sheetId ? { ...l, outbox: ops } : l));
  }, []);

  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async (): Promise<void> => {
    if (flushing.current) return;
    flushing.current = true;
    let confirmedWrites = 0;
    try {
      for (;;) {
        const t = tokenRef.current;
        const sheetId = localRef.current.sheetId;
        const op = localRef.current.outbox[0];
        if (!t || !sheetId || !op || malformedRef.current) break;

        try {
          if (op.kind === "add") {
            // Replay-safe at the source of truth: appendNote re-reads the sheet
            // and skips if this id already landed (response lost, page reloaded),
            // so a retry can never write the row twice. See sheet-core
            // appendNoteIfAbsent — the local replica is not consulted here.
            await notesApi.appendNote(t, sheetId, op.note);
          } else if (op.kind === "edit") {
            await notesApi.editNote(t, sheetId, op.id, op.patch);
          } else {
            await notesApi.removeNote(t, sheetId, op.id);
          }
          syncEpoch.current++;
          confirmedWrites++;
          setFetchError(null);
          setWriteRejected(null);
        } catch (err) {
          if (err instanceof NoteNotFoundError) {
            // The target vanished remotely — drop the op; the sheet wins.
          } else if (err instanceof MalformedSheetError) {
            setMalformed(err.error);
            break;
          } else {
            // Park the queue; 'online'/next poll retries. A Google rejection
            // (e.g. a cell over the 50k limit written by an older client) is
            // surfaced separately — retrying alone will never fix it, and the
            // "Offline" label would be a lie.
            setFetchError(err instanceof Error ? err.message : String(err));
            if (err instanceof ApiError) setWriteRejected(err.message);
            break;
          }
        }

        // Commit the op into the replica in the SAME update that removes it
        // from the queue (see useBoard for the flash-of-old-state rationale).
        const cur = localRef.current;
        const rest = cur.outbox.slice(1);
        const replica = cur.replica
          ? { ...cur.replica, notes: applyNotesPending(cur.replica.notes, [op]) }
          : cur.replica;
        localRef.current = { ...cur, outbox: rest, replica };
        setLocal((l) => (l.sheetId === sheetId ? { ...l, outbox: rest, replica } : l));
      }
    } finally {
      flushing.current = false;
    }
    // Reconcile immediately after a drain (see useBoard).
    if (confirmedWrites > 0 && localRef.current.outbox.length === 0) {
      void refreshRef.current();
    }
  }, [setOutbox]);

  const refresh = useCallback(async (): Promise<void> => {
    const t = tokenRef.current;
    const sheetId = localRef.current.sheetId;
    if (!t || !sheetId || pollInFlight.current) return;
    pollInFlight.current = true;
    const epochAtStart = syncEpoch.current;
    let rerunStale = false;
    try {
      const result = await notesApi.fetchNotes(t, sheetId);
      if (localRef.current.sheetId !== sheetId) {
        // Sheet switched mid-read — drop the snapshot.
      } else if (syncEpoch.current !== epochAtStart) {
        rerunStale = true;
      } else {
        setLastSyncedAt(new Date());
        setFetchError(null);
        if (result.ok) {
          setMalformed(null);
          const replica: PersistedNotesReplica = {
            notes: result.notes,
            fetchedAt: new Date().toISOString(),
          };
          localRef.current = { ...localRef.current, replica };
          setLocal((l) => (l.sheetId === sheetId ? { ...l, replica } : l));
          if (localRef.current.outbox.length > 0) void flush();
        } else {
          setMalformed(result.error);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      pollInFlight.current = false;
    }
    if (rerunStale) await refreshRef.current();
  }, [flush]);
  refreshRef.current = refresh;

  // Poll while visible; refresh + flush on focus, visibility, and reconnect.
  useEffect(() => {
    if (!token || !spreadsheetId) return;
    void refresh();
    void flush();

    function startPolling(): void {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(() => {
        if (!document.hidden) void refresh();
      }, POLL_INTERVAL_MS);
    }
    function stopPolling(): void {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    }
    function onVisibilityChange(): void {
      if (document.hidden) {
        stopPolling();
      } else {
        void refresh();
        startPolling();
      }
    }
    function onFocus(): void {
      void refresh();
    }
    function onOnline(): void {
      void flush();
      void refresh();
    }

    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [token, spreadsheetId, refresh, flush]);

  /** Queues a local mutation and kicks the flusher. Instant — never awaits the network. */
  const enqueue = useCallback(
    (op: NotePendingOp) => {
      const sheetId = localRef.current.sheetId;
      if (!sheetId) return;
      const ops = enqueueNoteOp(localRef.current.outbox, op);
      localRef.current = { ...localRef.current, outbox: ops };
      setOutbox(sheetId, ops);
      void flush();
    },
    [flush, setOutbox],
  );

  const addNote = useCallback(
    (input: { title?: string; body?: string }): Note | null => {
      if (!localRef.current.sheetId) return null;
      const note = notesApi.buildNewNote(input);
      enqueue({ kind: "add", note });
      return note;
    },
    [enqueue],
  );

  const updateNote = useCallback(
    (id: string, patch: { title?: string; body?: string }) => {
      enqueue({ kind: "edit", id, patch, at: new Date().toISOString() });
    },
    [enqueue],
  );

  const deleteNote = useCallback(
    (id: string) => {
      enqueue({ kind: "delete", id });
    },
    [enqueue],
  );

  const state: NotesState = malformed
    ? { status: "malformed", error: malformed }
    : projection
      ? { status: "ready", notes: projection }
      : fetchError
        ? { status: "error", message: fetchError }
        : { status: "loading" };

  return {
    state,
    lastSyncedAt,
    offline: fetchError !== null,
    pendingCount: local.outbox.length,
    writeRejected: local.outbox.length > 0 ? writeRejected : null,
    addNote,
    updateNote,
    deleteNote,
    refresh,
  };
}
