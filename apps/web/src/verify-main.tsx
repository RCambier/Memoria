// Dev-only verification harness entry (see verify.html). Mounts the REAL App
// with every network call stubbed, so auth, the board shelf, and board flows
// can be driven end-to-end without Google. Not part of the production build.
//
// The stubbed world: a signed-in session, one account with two boards
// ("Todos" — the cached one — and "Groceries"), and a Todos board holding one
// task per column. The Sheets stub is a real fake backend: an in-memory grid
// that appends/updates/deletes rows exactly like the API, so flushed
// mutations survive the next poll. Every write is also recorded on
// `window.__sheetWrites` — stubbed calls never reach the network, so
// browser-level request interception won't see them.
//
// Offline simulation: `window.__setOffline(true)` (or loading with
// `?offline=1`) makes every stubbed Google/auth call reject like a dead
// network, without touching the page's real connectivity.
import { createRoot } from "react-dom/client";
import { HEADERS, taskToRow, type Task } from "@memoria/sheet-core";
import { App } from "./App.js";
import "./styles.css";

declare global {
  interface Window {
    /** Every stubbed Sheets write, in order — the harness's assertion surface. */
    __sheetWrites: { method: string; url: string; body: string | null }[];
    /** Simulate a dead network for all stubbed calls. */
    __setOffline: (offline: boolean) => void;
    /** The fake backend's current grid (header + rows) — for assertions. */
    __grid: () => string[][];
  }
}

const now = new Date().toISOString();

function task(id: string, title: string, status: Task["status"]): Task {
  return {
    id,
    title,
    status,
    sortOrder: 1,
    notes: "",
    source: "user",
    createdAt: now,
    updatedAt: now,
    dueDate: "",
    tags: [],
  };
}

const grid: string[][] = [
  [...HEADERS],
  taskToRow(task("t1", "Write the report", "backlog")),
  taskToRow(task("t2", "Ship it", "in_progress")),
  taskToRow(task("t3", "Old done thing", "done")),
];

let offline = new URLSearchParams(window.location.search).get("offline") === "1";
window.__setOffline = (v: boolean) => {
  offline = v;
  if (!v) window.dispatchEvent(new Event("online"));
};
window.__sheetWrites = [];
window.__grid = () => grid.map((r) => [...r]);

/** Row number (1-indexed) from a `Tasks!A5:J5`-style range in a values URL. */
function rowNumberFromUrl(url: string): number | null {
  const m = /values\/[^?]*%21A(\d+)/.exec(url) ?? /values\/[^?]*!A(\d+)/.exec(decodeURIComponent(url));
  return m ? Number(m[1]) : null;
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const stubbed = url.includes("/api/auth/") || url.includes("googleapis.com") || url.includes("userinfo");
  if (!stubbed) return realFetch(input, init);
  if (offline) throw new TypeError("Failed to fetch (harness offline)");

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  if (url.includes("/api/auth/session")) return json({ access_token: "tok", expires_in: 3600 });
  if (url.includes("userinfo")) return json({ name: "Test User", email: "t@example.com", picture: "" });
  if (url.includes("googleapis.com/drive"))
    return json({
      files: [
        { id: "sheet-1", name: "Todos", modifiedTime: now },
        { id: "sheet-2", name: "Groceries", modifiedTime: now },
      ],
    });

  if (url.includes("sheets.googleapis.com")) {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      // getTabSheetId probes spreadsheet properties; everything else reads values.
      if (url.includes("fields=sheets.properties"))
        return json({ sheets: [{ properties: { title: "Tasks", sheetId: 0 } }] });
      return json({ values: grid.map((r) => [...r]) });
    }

    const body = typeof init?.body === "string" ? init.body : null;
    window.__sheetWrites.push({ method, url, body });
    const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};

    if (url.includes(":append")) {
      grid.push((payload.values as string[][])[0]!);
    } else if (method === "PUT") {
      const n = rowNumberFromUrl(url);
      if (n) grid[n - 1] = (payload.values as string[][])[0]!;
    } else if (url.includes(":batchUpdate")) {
      const requests = payload.requests as
        { deleteDimension?: { range?: { startIndex?: number; endIndex?: number } } }[] | undefined;
      const range = requests?.[0]?.deleteDimension?.range;
      if (range?.startIndex !== undefined) grid.splice(range.startIndex, 1);
    }
    return json({});
  }

  return realFetch(input, init);
};

localStorage.setItem("todos:spreadsheetId", "sheet-1");

createRoot(document.getElementById("root")!).render(<App />);
