import { useState } from "react";
import { shareWithServiceAccount } from "../api/drive.js";
import { buildClaudeCodeCliSnippet, buildMcpConfigSnippet } from "../lib/mcpSnippet.js";
import { getSharedServiceAccountEmail, setSharedServiceAccountEmail } from "../lib/storage.js";

interface SettingsPanelProps {
  token: string;
  spreadsheetId: string;
  onClose: () => void;
  onDisconnect: () => void;
}

type ShareStatus = { kind: "idle" | "sharing" | "error"; message?: string };

const SERVICE_ACCOUNTS_URL = "https://console.cloud.google.com/iam-admin/serviceaccounts";

/** Copies `value` to the clipboard, showing a transient "Copied" confirmation. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied outright — the text is still
      // selectable from the <pre> next to this button.
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={() => void handleCopy()}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function SettingsPanel({ token, spreadsheetId, onClose, onDisconnect }: SettingsPanelProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ShareStatus>({ kind: "idle" });
  const [sharedEmail, setSharedEmail] = useState<string | null>(() =>
    getSharedServiceAccountEmail(spreadsheetId),
  );

  const cliSnippet = buildClaudeCodeCliSnippet(spreadsheetId);
  const jsonSnippet = buildMcpConfigSnippet(spreadsheetId);

  async function handleShare(): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus({ kind: "sharing" });
    try {
      await shareWithServiceAccount(token, spreadsheetId, trimmed);
      setSharedServiceAccountEmail(spreadsheetId, trimmed);
      setSharedEmail(trimmed);
      setStatus({ kind: "idle" });
      setEmail("");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <button className="close" aria-label="Close settings" onClick={onClose}>
          ×
        </button>
        <h2>Settings</h2>

        <div>
          <h3>Connect an agent</h3>
          <p className="settings-intro">
            Let a coding agent (Claude Code, Codex, …) read and write this board over MCP. Three steps:
          </p>

          <div className="settings-step">
            <h4>
              <span className="step-num">1</span> Create a service account
            </h4>
            <p className="step-desc">
              In Google Cloud,{" "}
              <a href={SERVICE_ACCOUNTS_URL} target="_blank" rel="noreferrer">
                create a service account
              </a>{" "}
              — no roles needed — then add a key (Keys → Add key → JSON). Save that file somewhere private on
              the machine the agent runs on: it&rsquo;s a secret, and it should never end up in a repo.
            </p>
          </div>

          <div className="settings-step">
            <h4>
              <span className="step-num">2</span> Share this board with it
            </h4>
            <p className="step-desc">
              Sharing grants the service account editor access to this one spreadsheet — nothing else in your
              Drive. No notification email is sent.
            </p>
            <div className="field">
              <input
                type="email"
                placeholder="my-agent@my-project.iam.gserviceaccount.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="btn-primary"
                onClick={() => void handleShare()}
                disabled={status.kind === "sharing" || !email.trim()}
              >
                {status.kind === "sharing" ? "Sharing…" : "Share"}
              </button>
              {status.kind === "error" && <span className="status-msg error">{status.message}</span>}
            </div>
            {sharedEmail && <p className="status-msg success">✓ Shared with {sharedEmail}</p>}
          </div>

          <div className="settings-step">
            <h4>
              <span className="step-num">3</span> Register the MCP server with your agent
            </h4>
            <p className="step-desc">
              Replace <code>/path/to/Todos</code> and <code>/path/to/service-account.json</code> below with
              your real paths. The repo needs a one-time <code>npm install &amp;&amp; npm run build</code>{" "}
              first, so <code>packages/mcp-server/dist/index.js</code> exists.
            </p>

            <div className="field">
              <span className="field-label">Spreadsheet ID</span>
              <div className="copy-row">
                <pre>{spreadsheetId}</pre>
                <CopyButton value={spreadsheetId} />
              </div>
            </div>

            <div className="field">
              <span className="field-label">Claude Code — one-liner</span>
              <div className="copy-row">
                <pre>{cliSnippet}</pre>
                <CopyButton value={cliSnippet} />
              </div>
            </div>

            <div className="field">
              <span className="field-label">Manual config (.mcp.json)</span>
              <div className="copy-row">
                <pre>{jsonSnippet}</pre>
                <CopyButton value={jsonSnippet} />
              </div>
            </div>
          </div>
        </div>

        <hr />

        <button className="top-link" style={{ alignSelf: "flex-start" }} onClick={onDisconnect}>
          Disconnect this browser
        </button>
      </div>
    </div>
  );
}
