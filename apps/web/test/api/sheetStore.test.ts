import { afterEach, describe, expect, it, vi } from "vitest";
import { findMostRecentBoardId, NoBoardError, RemoteSheetStore } from "../../api/_lib/sheetStore.js";

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findMostRecentBoardId", () => {
  it("returns the id of the single most-recently-modified board", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [{ id: "sheet-abc" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const id = await findMostRecentBoardId("test-token");

    expect(id).toBe("sheet-abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://www.googleapis.com/drive/v3/files");
    expect(url).toContain("orderBy=modifiedTime+desc");
    expect(url).toContain("pageSize=1");
    expect(url).toContain(encodeURIComponent("todosBoard"));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("returns undefined when Drive reports no matching files", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ files: [] })));
    expect(await findMostRecentBoardId("test-token")).toBeUndefined();
  });

  it("returns undefined when the files field is absent entirely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await findMostRecentBoardId("test-token")).toBeUndefined();
  });

  it("propagates a Google API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: "bad token" } }), { status: 401 }),
        ),
    );
    await expect(findMostRecentBoardId("test-token")).rejects.toThrow(/bad token/);
  });
});

describe("RemoteSheetStore", () => {
  it("throws NoBoardError from readRows when no board is found, without calling Sheets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const store = new RemoteSheetStore("test-token");
    await expect(store.readRows()).rejects.toBeInstanceOf(NoBoardError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the Drive discovery call, no Sheets call
  });

  it("discovers the board once and reuses it across multiple calls", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("drive/v3/files"))
        return Promise.resolve(jsonResponse({ files: [{ id: "sheet-xyz" }] }));
      return Promise.resolve(jsonResponse({ values: [["id", "title"]] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = new RemoteSheetStore("test-token");
    await store.readRows();
    await store.readRows();

    const urls = fetchMock.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(urls.filter((url) => url.includes("drive/v3/files"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("sheets.googleapis.com"))).toHaveLength(2);
  });
});
