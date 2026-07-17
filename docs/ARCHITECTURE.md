# Architecture

A kanban todo app whose only backend is a Google Sheet in the user's own Drive.
Three clients read and write that sheet: a static web app (the board UI), an
MCP server (for coding agents like Claude Code or Codex), and an optional
hosted MCP endpoint (for claude.ai custom connectors). None of them holds
state; the sheet is the single source of truth.

```
                       ┌────────────────────┐
                       │   Google Sheet     │  ← single source of truth
                       │   (user's Drive)   │
                       └──┬───────▲──────┬──┘
                Sheets API│       │      │Sheets API
        ┌─────────────────┘       │      └────────────────┐
        │                         │Sheets API             │
┌───────▼────────┐      ┌─────────▼──────────┐   ┌────────▼─────────┐
│  apps/web      │      │  apps/web/api      │   │ packages/        │
│  static SPA    │      │  hosted MCP        │   │ mcp-server       │
│  OAuth (user)  │      │  (optional)        │   │ service account  │
└────────────────┘      │  OAuth (caller)    │   └────────▲─────────┘
        │               └─────────▲──────────┘            │
        │                         │                       │
        └───────► packages/sheet-core ◄───────────────────┘
                  (shared schema + validation)
```

## Principles

1. **The sheet is the database.** Both clients are stateless; sync happens
   because everyone reads and writes the same sheet.
2. **No servers, no secrets.** The web app is static files; the only
   credentials are the user's own (OAuth in the browser, a service-account key
   on the user's machine). Nothing secret ever appears in this repo or its
   deploys. (The optional hosted MCP connector adds exactly three server-side
   env vars — deployment credentials, never user credentials — and nothing
   else changes if you skip it.)
3. **Never destroy user data.** Writes are surgical (one task at a time,
   row located by ID at write time). A malformed sheet makes the app
   read-only with a precise error — it is never auto-"repaired".
4. **Reusable by anyone.** Fork, create your own free Google Cloud
   credentials, deploy. See `docs/SETUP.md`.

## Components

### `apps/web` — the board UI

React + TypeScript + Vite static SPA. No backend of any kind.

- **Auth**: Google Identity Services token model (browser-held, short-lived
  access token, in memory only). Scope: `https://www.googleapis.com/auth/drive.file`
  — the app can only access files it created or files the user explicitly
  picked. Sheets/Drive calls are plain `fetch` against the REST APIs.
- **First run** offers three paths that converge on a spreadsheet ID:
  1. *Found your existing board* — the app lists files it has access to,
     filtered by `appProperties.todosBoard = "1"` (set at creation), and
     offers to reconnect. This is the multi-device path.
  2. *Create a board* — creates the spreadsheet (tagged with the
     appProperty), writes the header row.
  3. *Use an existing sheet* — Google Picker. Empty sheet → bootstrap
     headers; valid headers → attach; anything else → refuse with a clear
     message.
- The chosen spreadsheet ID is cached in `localStorage`.
- **Sync**: poll the sheet every 5 s while the tab is visible (pause when
  hidden, refresh immediately on focus). Mutations are optimistic: apply to
  local state, write to the sheet, reconcile on next poll. Last write wins.
- **Writes are row-targeted**: to mutate a task, re-locate its row by task
  `id` in the freshest read, then write exactly that row. Never write the
  whole grid. Appends go through the Sheets `append` API.
- **Malformed sheet**: if validation (from `sheet-core`) fails, show a
  banner naming the exact row/column/value, disable all mutations, keep
  polling — the board resumes automatically once the sheet is fixed.
- **Agent connect panel** (settings): user pastes a service-account email;
  the app shares the sheet with it (Drive permissions API, `writer` role,
  no notification email) and shows the spreadsheet ID plus a ready-made MCP
  config snippet.
- **Build-time config** (public by design, via Vite env vars):
  `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` (Picker only).

### `packages/sheet-core` — shared schema and validation

Dependency-free TypeScript. The single definition of what a valid sheet is.
Used by both other packages. Exports:

- `Task` type and `Status` enum (`backlog` | `in_progress` | `done`).
- `HEADERS`, sheet/tab name constants.
- `parseSheet(rows) → { ok: true, tasks } | { ok: false, error }` where
  `error` pinpoints row, column, and offending value in a human sentence.
- `taskToRow(task)` / `rowToTask(row)` serialization.
- Ordering helpers (see *Ordering* below).
- ID generation (crypto-random, URL-safe, e.g. 12-char base62).

### `packages/mcp-server` — the agent connector

Node + TypeScript, MCP over stdio, published-quality but run from the repo
(`npx`/`node dist`). Auth: a Google service account the user shares the
sheet with. Config via env vars:

- `TODOS_SPREADSHEET_ID` — which sheet.
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the service-account key JSON.

Tools (all mutations take a task `id` from `list_tasks`; every write
re-locates the row by ID first, exactly like the web app):

| tool | input | behavior |
|---|---|---|
| `list_tasks` | optional `status` filter | tasks in board order |
| `add_task` | `title`, optional `notes`, `status` (default `backlog`), `due_date`, `tags` | insert at top of column |
| `update_task` | `id`, optional `title`, `notes`, `due_date`, `tags` | edit fields |
| `move_task` | `id`, `status` | move to top of target column |
| `complete_task` | `id` | sugar for `move_task(done)` |
| `delete_task` | `id` | delete that row |

No bulk or whole-sheet tools — a confused agent can damage at most one row,
and Sheets version history covers recovery. Tasks created via MCP set
`source = "agent"` (see schema) so the UI can show provenance.

The package has two entrypoints: `dist/index.js` is the stdio server binary,
and `dist/mcp.js` is a transport-free module exporting `registerTools` and
the `SheetStore` interface — no `googleapis`, no filesystem access. The
hosted connector (next section) registers the same six tools through that
second entrypoint against its own `SheetStore`.

### `apps/web/api` — hosted MCP connector (optional)

Vercel Functions deployed alongside the static build, so any user of a
deployed instance can add `https://<deployment>/api/mcp` as a claude.ai
custom connector and get the same six tools operating on **their** board in
**their** Drive. It is opt-in per deployment: it activates only when three
env vars are set (below); a fork that skips them serves 503 on `/api/*` with
a plain explanation and loses nothing else — the static app is completely
unaffected.

The server is stateless in the same spirit as everything else: no database,
no session store, no stored user credentials. Auth is the MCP authorization
spec pattern with this deployment acting as an OAuth authorization server
that proxies Google:

- Dynamic Client Registration returns a `client_id` that *is* the client's
  redirect URIs (base64url + HMAC tag), so `/authorize` can validate it
  without storage. Redirect URIs are allowlisted to exactly the claude.ai
  and claude.com MCP callbacks.
- `/api/oauth/authorize` validates the client and PKCE (S256 only), seals
  `{client redirect_uri, state, code_challenge, issued_at}` into an
  AES-256-GCM blob (key derived from `AUTH_SIGNING_SECRET`) passed as the
  `state` to Google, and redirects to Google's consent screen
  (`drive.file` scope, offline access).
- `/api/oauth/callback` verifies the blob (10-minute TTL), wraps Google's
  authorization code in a fresh sealed blob — *our* authorization code —
  and redirects back to the client.
- `/api/oauth/token` opens that blob, verifies the PKCE verifier
  (constant-time), exchanges the embedded Google code using our client
  credentials, and returns Google's tokens as our own. Refresh grants are
  proxied straight through.
- Every `/api/mcp` request is authenticated by validating the caller's
  bearer token against Google's tokeninfo endpoint (scope + audience
  checked); the board is discovered per request as the caller's most
  recently modified tagged spreadsheet. All Sheets/Drive calls use the
  caller's own token — the deployment can never touch a board without the
  caller's live Google credential in hand.

Env vars (all three required to activate, set in Vercel project settings):
`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (a second,
"Web application"-type OAuth client in the same GCP project) and
`AUTH_SIGNING_SECRET` (32+ random hex bytes for the AEAD keys). These are
the only server-side secrets in the whole project, and they are deployment
credentials, not user credentials.

## The sheet schema

One tab named `Tasks`. Row 1 is the header, frozen. Columns:

| column | type | notes |
|---|---|---|
| `id` | string | stable random ID, never reused |
| `title` | string | required, non-empty |
| `status` | enum | `backlog` \| `in_progress` \| `done` |
| `sort_order` | number | ascending within a column = top→bottom |
| `notes` | string | optional |
| `source` | string | `user` or `agent`; informational only |
| `created_at` | ISO 8601 string | set once |
| `updated_at` | ISO 8601 string | set on every mutation |
| `due_date` | string | `YYYY-MM-DD` or empty; optional |
| `tags` | string | comma-separated labels; optional (so tag names can't contain commas) |

Validation rules (enforced identically by both clients via `sheet-core`):
header row must match exactly; `id`, `title`, `status` required;
`status` must be in the enum; `sort_order` must be numeric; `due_date`, if
present, must be `YYYY-MM-DD`. Empty rows are ignored. Anything else →
precise validation error.

**Schema evolution**: `due_date` and `tags` were added after the original
8-column schema. A sheet with the old header still validates (its tasks
just have empty due dates and tags), and the web app extends the header row
in place the first time it loads such a board — an additive write of two
header cells that never touches task rows. This keeps existing boards
working without a migration step.

**Ordering**: `sort_order` is a float. Insert at top = `min(column) − 1`
(or `0` for an empty column). Drop between two cards = midpoint. No global
renumbering — keeps every reorder a one-row write. (Float exhaustion needs
~50 consecutive midpoint inserts in the same gap to matter; accept the
theoretical limit rather than engineer around it.)

**Conflicts**: single-user tool; last write wins, the sheet wins over any
client's memory. Because writes re-locate rows by ID and touch one row,
the realistic worst case for a simultaneous edit is one field reverting —
acceptable, and version history exists.

## What we deliberately did not build

- **No push/webhook sync** — Drive push notifications need a hosted HTTPS
  endpoint; polling is free, simple, and plenty for a todo board.
- **No backend, database, or session store** — the token model exists so
  static apps don't need them.
- **No broad OAuth scopes** — `drive.file` only; the app cannot see the
  rest of the user's Drive, which is the right trust posture for a public
  reusable project.
- **No offline queue / CRDTs / realtime collab** — single user,
  last-write-wins.

## Repo layout & tooling

```
apps/web              React + TS + Vite SPA (@hello-pangea/dnd for drag & drop)
apps/web/api          optional hosted MCP connector (Vercel Functions, mcp-handler)
packages/sheet-core   shared schema/validation (no runtime deps)
packages/mcp-server   MCP stdio server (@modelcontextprotocol/sdk, googleapis)
docs/                 this file, SETUP.md, design/
```

npm workspaces (no extra workspace tooling). Vitest for tests —
`sheet-core` is tested exhaustively (it guards user data); the other
packages get focused tests where logic warrants. GitHub Actions CI:
typecheck, lint, test, build. Vercel deploys `apps/web` from `main`.

## Design

See `docs/design/mockup.html` (open in a browser) — Notion-inspired: system
font stack, hairline structure, muted status tints, color only where it
carries meaning (status, sync health, warnings). Light and dark themes. The
mockup is the visual spec: match its tokens, spacing, and states, including
the drag state, inline top-of-column composer, agent provenance chip,
malformed-sheet banner, and the one-column mobile layout.
