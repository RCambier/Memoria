/**
 * Note-card image handling (design 10b): a note's images live in its body as
 * `![alt](drive:<id>)` or `![alt](https://…)`. The grid shows the FIRST image
 * as a 56px side thumbnail with a `+N` badge for the rest, and renders the
 * body with the image markdown stripped out so the text stays the hero.
 */

export interface NoteImage {
  /** `drive:<fileId>` or an `https://…` URL, exactly as written in the body. */
  src: string;
  alt: string;
}

const IMAGE_RE = /!\[([^\]\n]*)\]\(((?:https?:\/\/|drive:)[^\s)]+)\)/g;

/**
 * Splits a note body into its images and the text with those images removed.
 * Order is preserved; the first image is the thumbnail. `text` is trimmed of
 * the blank lines left behind so the card preview stays tight.
 */
export function noteImages(body: string): { images: NoteImage[]; text: string } {
  const images: NoteImage[] = [];
  for (const m of body.matchAll(IMAGE_RE)) images.push({ alt: m[1] ?? "", src: m[2] ?? "" });
  const text = body
    .replace(IMAGE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { images, text };
}
