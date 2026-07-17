import type { BoardState } from "../board/useBoard.js";

interface TopbarProps {
  spreadsheetId: string;
  boardStatus: BoardState["status"];
  lastSyncedAt: Date | null;
  onOpenSettings: () => void;
}

function syncLabel(status: BoardState["status"], lastSyncedAt: Date | null): string {
  if (status === "error") return "Offline — retrying…";
  if (!lastSyncedAt) return "Syncing…";
  const seconds = Math.max(0, Math.round((Date.now() - lastSyncedAt.getTime()) / 1000));
  if (seconds < 5) return "Synced · just now";
  if (seconds < 60) return `Synced · ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `Synced · ${minutes}m ago`;
}

/** Simple spreadsheet-grid glyph — stands in for the "Open in Google Sheets" link on narrow screens. */
function SheetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6h13M1.5 10h13M6 1.5v13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * Six-ray spark — the app's own "agent" mark, matching the ✳ chip on
 * agent-created cards. (Deliberately not a Claude/Codex/MCP logo: those are
 * third-party trademarks this MIT repo shouldn't ship.)
 */
function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2v11.6M2.98 5.1l10.04 5.8M13.02 5.1 2.98 10.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Topbar({ spreadsheetId, boardStatus, lastSyncedAt, onOpenSettings }: TopbarProps) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const offline = boardStatus === "error";
  const label = syncLabel(boardStatus, lastSyncedAt);

  return (
    <div className="topbar">
      <div className="board-name">
        <span className="glyph">✓</span> Todos
      </div>
      <div className={`sync${offline ? " offline" : ""}`} title={label} aria-label={label} role="status">
        <span className="dot" />
        <span className="sync-label">{label}</span>
      </div>
      <div className="spacer" />
      <a
        className="top-link"
        href={sheetUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in Google Sheets"
        title="Open in Google Sheets"
      >
        <SheetIcon />
        <span className="top-link-label">Open in Google Sheets ↗</span>
      </a>
      <button
        className="top-link"
        onClick={onOpenSettings}
        aria-label="Connect from agents"
        title="Connect from agents"
      >
        <AgentIcon />
        <span className="top-link-label">Connect from agents</span>
      </button>
      <div className="avatar" aria-hidden="true">
        ✓
      </div>
    </div>
  );
}
