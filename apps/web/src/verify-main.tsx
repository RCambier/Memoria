// Dev-only verification harness entry (see verify.html). Mounts the REAL App
// with every network call stubbed, so auth, the board shelf, and board flows
// can be driven end-to-end without Google. Not part of the production build.
//
// The stubbed world: a signed-in session, one account with two boards
// ("Todos" — the cached one — and "Groceries"), and a Todos board holding one
// task per column. Sheets writes are accepted and dropped (the next poll
// re-serves the same grid), but every write is recorded on
// `window.__sheetWrites` — assert on those (or on optimistic state), not on
// persistence. Stubbed calls never reach the network, so request
// interception at the browser level won't see them.
import { createRoot } from "react-dom/client";
import { HEADERS, taskToRow, type Task } from "@memoria/sheet-core";
import { App } from "./App.js";
import "./styles.css";

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

const grid = [
  [...HEADERS],
  taskToRow(task("t1", "Write the report", "backlog")),
  taskToRow(task("t2", "Ship it", "in_progress")),
  taskToRow(task("t3", "Old done thing", "done")),
];

declare global {
  interface Window {
    /** Every stubbed Sheets write, in order — the harness's assertion surface. */
    __sheetWrites: { method: string; url: string; body: string | null }[];
  }
}
window.__sheetWrites = [];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
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
    if (!init?.method || init.method === "GET") return json({ values: grid });
    window.__sheetWrites.push({
      method: init.method,
      url,
      body: typeof init.body === "string" ? init.body : null,
    });
    return json({});
  }
  return realFetch(input, init);
};

localStorage.setItem("todos:spreadsheetId", "sheet-1");

createRoot(document.getElementById("root")!).render(<App />);
