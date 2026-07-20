import { useState } from "react";
import type { Collection, CollectionKind } from "../api/drive.js";
import { pickSpreadsheet } from "../api/picker.js";
import { attachOrBootstrap, createCollection } from "../board/onboarding.js";
import type { Slots } from "../lib/slots.js";
import { Logo } from "./Logo.js";

interface FirstRunProps {
  token: string;
  /** Null while the Drive listing is still loading. */
  slots: Slots | null;
  listError: string | null;
  /** A slot got its sheet (created / linked / picked) — connect it and show that view. */
  onSheetReady: (kind: CollectionKind, id: string) => void;
  /** Removes the sheet's kind tag in Drive (the file stays); resolves when the listing is stale. */
  onUnlink: (kind: CollectionKind, id: string) => Promise<void>;
}

const KIND_LABEL: Record<CollectionKind, string> = { board: "Todos", notes: "Notes" };

/**
 * The sheet setup screen: one slot per kind — your Todos sheet and your
 * Notes sheet. An empty slot offers create / link; a connected slot shows
 * the sheet with open and unlink. Extra tagged sheets of a kind (older
 * versions allowed several) are listed under the slot to switch to or
 * unlink, until one of each remains.
 */
export function FirstRun({ token, slots, listError, onSheetReady, onUnlink }: FirstRunProps) {
  return (
    <div className="first-run">
      <div className="first-run-brand" aria-hidden="true">
        <Logo size={26} />
        <span className="wordmark-name">
          Memor<span className="wordmark-ia">ia</span>
        </span>
      </div>

      <div>
        <h1>Your sheets</h1>
        <p>Memoria keeps two Google Sheets in your Drive: one for todos, one for notes.</p>
      </div>

      {listError && <p className="shelf-note">Couldn&rsquo;t list your sheets: {listError}</p>}

      <KindSlotSection
        kind="board"
        token={token}
        slots={slots}
        onSheetReady={onSheetReady}
        onUnlink={onUnlink}
      />
      <KindSlotSection
        kind="notes"
        token={token}
        slots={slots}
        onSheetReady={onSheetReady}
        onUnlink={onUnlink}
      />
    </div>
  );
}

type Busy = "create" | "link" | "unlink" | null;

function KindSlotSection({
  kind,
  token,
  slots,
  onSheetReady,
  onUnlink,
}: Pick<FirstRunProps, "token" | "slots" | "onSheetReady" | "onUnlink"> & { kind: CollectionKind }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  /** Id of the sheet whose unlink is awaiting its second, confirming click. */
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  const slot = slots?.[kind] ?? null;
  const label = KIND_LABEL[kind];

  async function run(what: Exclude<Busy, null>, work: () => Promise<void>): Promise<void> {
    setBusy(what);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function handleCreate(): void {
    void run("create", async () => {
      const id = await createCollection(token, label, kind);
      onSheetReady(kind, id);
    });
  }

  function handleLink(): void {
    void run("link", async () => {
      const fileId = await pickSpreadsheet(token);
      if (!fileId) return;
      const outcome = await attachOrBootstrap(token, fileId, kind);
      if (outcome.kind === "refused") {
        setError(`Can't use that sheet: ${outcome.reason}`);
      } else {
        onSheetReady(kind, fileId);
      }
    });
  }

  function handleUnlink(id: string): void {
    if (confirmUnlink !== id) {
      setConfirmUnlink(id);
      return;
    }
    setConfirmUnlink(null);
    void run("unlink", () => onUnlink(kind, id));
  }

  function row(c: Collection, connected: boolean): React.JSX.Element {
    return (
      <div className={`board-row slot-row${connected ? "" : " slot-extra"}`} key={c.id}>
        <SheetGlyph kind={kind} />
        <button
          type="button"
          className="slot-open"
          onClick={() => onSheetReady(kind, c.id)}
          disabled={busy !== null}
        >
          <span className="board-name">{c.name}</span>
          <span className="board-open">{connected ? "Open →" : "Use this →"}</span>
        </button>
        <button
          type="button"
          className={`slot-unlink${confirmUnlink === c.id ? " confirm" : ""}`}
          onClick={() => handleUnlink(c.id)}
          disabled={busy !== null}
        >
          {confirmUnlink === c.id ? "Really unlink?" : busy === "unlink" ? "Unlinking…" : "Unlink"}
        </button>
      </div>
    );
  }

  return (
    <section className="slot" aria-label={`${label} sheet`}>
      <div className="slot-head">
        <h2>{label}</h2>
        <span className="slot-desc">
          {kind === "board"
            ? "A small board. Items move through statuses."
            : "A grid of notes. Free-form markdown."}
        </span>
      </div>

      {error && <div className="first-run-error">{error}</div>}

      <div className="board-shelf">
        {slot === null && <div className="board-row skeleton" aria-hidden="true" />}

        {slot?.connected && row(slot.connected, true)}
        {slot?.extras.map((c) => row(c, false))}

        {slot && !slot.connected && (
          <div className="slot-empty-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={busy !== null}>
              {busy === "create" ? "Creating…" : `+ Create your ${label} sheet`}
            </button>
            <button className="btn-ghost" onClick={handleLink} disabled={busy !== null}>
              {busy === "link" ? "Opening Drive…" : "Link an existing sheet"}
            </button>
          </div>
        )}
      </div>

      {slot?.connected && (
        <p className="slot-note">
          Unlinking only disconnects the sheet from Memoria — it stays in your Drive.
        </p>
      )}
    </section>
  );
}

/** Small Google-Sheets-style tile; the notes sheet gets a warm paper variant. */
function SheetGlyph({ kind }: { kind: CollectionKind }) {
  if (kind === "notes") {
    return (
      <svg className="sheet-glyph" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1" y="1" width="18" height="18" rx="4" fill="var(--warn)" />
        <path
          d="M5.5 7h9M5.5 10h9M5.5 13h5.5"
          stroke="#fff"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  return (
    <svg className="sheet-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" rx="4" fill="var(--status-done)" />
      <path
        d="M5.5 7h9M5.5 10h9M5.5 13h9M8.5 7v8.5"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
