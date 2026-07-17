interface WelcomeProps {
  error: string | null;
  onConnect: () => void;
}

/** The logged-out landing screen: what this is, in one look — a board in front, a sheet behind. */
export function Welcome({ error, onConnect }: WelcomeProps) {
  return (
    <div className="welcome">
      <div>
        <h1>Todos</h1>
        <p className="welcome-tagline">A quiet kanban board over a Google Sheet you own.</p>
      </div>

      <div className="hero-art" aria-hidden="true">
        <div className="art-sheet">
          <div className="art-sheet-tab" />
        </div>
        <div className="art-board">
          <div className="art-col">
            <span className="art-pill pill-backlog">Backlog</span>
            <div className="art-card">
              <i style={{ width: "80%" }} />
              <i style={{ width: "55%" }} />
            </div>
            <div className="art-card">
              <i style={{ width: "65%" }} />
            </div>
          </div>
          <div className="art-col">
            <span className="art-pill pill-progress">In progress</span>
            <div className="art-card lifted">
              <i style={{ width: "75%" }} />
              <i style={{ width: "45%" }} />
            </div>
          </div>
          <div className="art-col">
            <span className="art-pill pill-done">Done</span>
            <div className="art-card done">
              <i style={{ width: "70%" }} />
            </div>
            <div className="art-card done">
              <i style={{ width: "50%" }} />
            </div>
          </div>
        </div>
      </div>

      <p className="welcome-explain">
        Your tasks live in a plain spreadsheet in your Drive — created for you on first run, yours to keep
        either way. This app is the board on top: drag cards between columns here, edit rows in Google Sheets,
        or let your AI agents work the same list over MCP. Every view stays in sync, and nothing ever leaves
        your Drive.
      </p>

      {error && <div className="first-run-error">{error}</div>}

      <button className="btn-primary btn-hero" onClick={onConnect}>
        Connect Google Drive
      </button>
      <p className="welcome-fineprint">
        Read/write access only to sheets this app creates or that you pick — never the rest of your Drive.
      </p>
    </div>
  );
}
