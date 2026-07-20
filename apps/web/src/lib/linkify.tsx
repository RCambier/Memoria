import type { ReactNode } from "react";

/** One piece of a linkified text: either plain text or an http(s) URL. */
export interface TextSegment {
  kind: "text" | "link";
  value: string;
}

// http(s) only — never mailto:/javascript:/etc. Trailing punctuation that's
// almost certainly sentence-level (".", ",", ")"…) is left out of the link.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** Pure: splits text into plain and link segments. Exported for tests. */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    let url = match[0];
    const trimmed = url.replace(TRAILING_PUNCTUATION, "");
    url = trimmed.length > "https://".length ? trimmed : url;
    if (start > last) segments.push({ kind: "text", value: text.slice(last, start) });
    segments.push({ kind: "link", value: url });
    last = start + url.length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

/**
 * Renders text with http(s) URLs as clickable links (new tab, no referrer).
 * Clicks don't bubble — a link tap inside a card must not also open the
 * task dialog.
 */
export function Linkify({ text }: { text: string }): ReactNode {
  const segments = splitLinks(text);
  return segments.map((seg, i) =>
    seg.kind === "link" ? (
      <a
        key={i}
        href={seg.value}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
      >
        {seg.value}
      </a>
    ) : (
      seg.value
    ),
  );
}
