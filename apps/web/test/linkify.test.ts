import { describe, expect, it } from "vitest";
import { splitLinks } from "../src/lib/linkify.js";

describe("splitLinks", () => {
  it("returns one text segment when there is no URL", () => {
    expect(splitLinks("just some notes")).toEqual([{ kind: "text", value: "just some notes" }]);
  });

  it("extracts an http(s) URL between text", () => {
    expect(splitLinks("see https://app.ledgy.com/portfolios/abc for details")).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", value: "https://app.ledgy.com/portfolios/abc" },
      { kind: "text", value: " for details" },
    ]);
  });

  it("handles a URL that is the entire text", () => {
    expect(splitLinks("https://example.com/x")).toEqual([{ kind: "link", value: "https://example.com/x" }]);
  });

  it("handles multiple URLs", () => {
    const segs = splitLinks("a https://one.test b http://two.test c");
    expect(segs.filter((s) => s.kind === "link").map((s) => s.value)).toEqual([
      "https://one.test",
      "http://two.test",
    ]);
  });

  it("leaves sentence punctuation out of the link", () => {
    expect(splitLinks("go to https://example.com/page.")).toEqual([
      { kind: "text", value: "go to " },
      { kind: "link", value: "https://example.com/page" },
      { kind: "text", value: "." },
    ]);
    expect(splitLinks("(see https://example.com/p)")).toEqual([
      { kind: "text", value: "(see " },
      { kind: "link", value: "https://example.com/p" },
      { kind: "text", value: ")" },
    ]);
  });

  it("does not linkify non-http schemes", () => {
    expect(splitLinks("mailto:a@b.c and javascript:alert(1) and ftp://x")).toEqual([
      { kind: "text", value: "mailto:a@b.c and javascript:alert(1) and ftp://x" },
    ]);
  });

  it("keeps URLs with query strings and fragments intact", () => {
    expect(splitLinks("https://e.test/a?b=c&d=e#frag")).toEqual([
      { kind: "link", value: "https://e.test/a?b=c&d=e#frag" },
    ]);
  });
});
