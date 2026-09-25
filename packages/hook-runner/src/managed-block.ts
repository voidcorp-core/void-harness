// The blocks the product writes into a consumer's own files (CLAUDE.md, AGENTS.md, .gitignore,
// .git/info/exclude) are found here and nowhere else. A rename leaves blocks under the former name
// in every project installed before it; reading only the current name would append a second block
// beside the old one on the next update, and the project would carry two copies of the rules,
// one of them never refreshed again.
import type { ManagedMarkers } from './identity.js';

interface Span {
  readonly start: number;
  readonly end: number;
}

// A block is a begin followed by the end of the same pair. Pairs are never mixed: an old begin
// closed by a new end is not a block, it is damage, and it is left for a person to read.
function spans(text: string, markers: ManagedMarkers): readonly Span[] {
  const found: Span[] = [];
  for (const pair of markers.recognized) {
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(pair.begin, cursor);
      if (start === -1) break;
      const close = text.indexOf(pair.end, start + pair.begin.length);
      if (close === -1) break;
      found.push({ start, end: close + pair.end.length });
      cursor = close + pair.end.length;
    }
  }
  const ordered = found.sort((left, right) => left.start - right.start);
  return ordered.filter((span, index) => index === 0 || span.start >= (ordered[index - 1]?.end ?? 0));
}

/** True when the text carries a complete block under the current or a former name. */
export function hasManagedBlock(text: string, markers: ManagedMarkers): boolean {
  return spans(text, markers).length > 0;
}

/**
 * The text around every recognized block, in order: one piece when there is none, n + 1 pieces for
 * n blocks. The caller decides how the holes are sewn, since a markdown file and an ignore file
 * treat the surrounding blank lines differently.
 */
export function removeManagedBlocks(text: string, markers: ManagedMarkers): readonly string[] {
  const pieces: string[] = [];
  let cursor = 0;
  for (const span of spans(text, markers)) {
    pieces.push(text.slice(cursor, span.start));
    cursor = span.end;
  }
  pieces.push(text.slice(cursor));
  return pieces;
}

/**
 * Put `block` where the first recognized block stands and drop any other, so the file ends with
 * exactly one block under the current name. Undefined when there is no complete block to replace.
 */
export function replaceManagedBlock(
  text: string,
  markers: ManagedMarkers,
  block: string,
): string | undefined {
  const pieces = removeManagedBlocks(text, markers);
  if (pieces.length === 1) return undefined;
  const [before = '', ...after] = pieces;
  return `${before}${block}${after.join('')}`;
}
