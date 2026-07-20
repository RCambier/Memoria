/**
 * Deterministic tag → color-class mapping. The palette lives in styles.css
 * (`.tag-c0` … `.tag-c5`, tinted for both themes); hashing the name means a
 * tag keeps its color everywhere it appears, across devices, with nothing
 * stored — the sheet only ever holds the tag names.
 */
const TAG_COLOR_COUNT = 6;

export function tagColorClass(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `tag-c${h % TAG_COLOR_COUNT}`;
}
