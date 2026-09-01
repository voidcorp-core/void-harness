// How one declared area is read, for every step that reads one.
//
// A footprint area is written by a human in a ticket, so all three forms appear
// there: the exact path, the directory that contains a file, and the glob. Two
// steps consume them and they disagreed: `worker-order` compared areas by exact
// string equality to decide who runs in parallel, `footprint-audit` matched by
// prefix and glob to decide whose file is whose. So `packages/cli/src` and
// `packages/cli/src/lib/x.ts` were never sequenced, ran at once, and the second
// ticket's own neighbouring file was then refused as a breach on behalf of the
// first. One relation, read once, is the fix -- not two readings kept in step by
// review.
//
// Normalisation is the other half, and it was a silent guard failure rather than
// a cosmetic one. `packages/core/templates/` -- the most natural way to write a
// directory in a path list -- claimed nothing: not the exact path, not the
// prefix (which would need a doubled slash), and picomatch matches no file
// against a trailing slash either. A file stolen from that area came back
// `within-scope`, reported as a widening, which is the audit's word for
// approval. A leading `./` does the same thing.
//
// An area that still claims nothing after normalisation is refused rather than
// accepted as an empty claim, because an empty claim is indistinguishable from a
// clean audit -- the failure this whole module exists to remove.

import picomatch from 'picomatch';
import { autopilotFailure } from './errors.js';

export interface CompiledArea {
  /** The area as every consumer reads it: trimmed, no `./`, no trailing `/`. */
  readonly area: string;
  readonly match: (value: string) => boolean;
}

/**
 * Does any segment of this path make it unable to name a file git reports?
 *
 * git reports a path relative to the repository root, with single separators
 * and no dot segment. So `packages//core` is not `packages/core` for the exact
 * comparison, not a prefix of it, and picomatch collapses nothing either; `/abs`
 * leads with an empty segment; `../x` and `a/./b` are the same failure written
 * differently. All of them read as ordinary areas and claim nothing, which is
 * how a spelling disarms the guard rather than tripping it.
 */
function claimsNothing(value: string): boolean {
  return value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

/**
 * The one spelling of an area, so two readers cannot disagree about it.
 *
 * Refuses what would claim nothing: an empty area, an absolute path, and any
 * spelling carrying an empty or a dot segment. None of them matches a path git
 * ever reports for a range. The stripping runs first, so the two forms a human
 * legitimately writes -- a leading `./`, a trailing `/` -- survive it.
 */
export function normaliseArea(area: string): string {
  let value = typeof area === 'string' ? area.trim() : '';
  while (value.startsWith('./')) value = value.slice(2);
  while (value.endsWith('/')) value = value.slice(0, -1);
  if (value.length === 0 || claimsNothing(value)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'a declared area claims nothing',
      `the area ${JSON.stringify(area)} reads as ${JSON.stringify(value)}, which matches no file git reports`,
      'declare each area as a repository-relative path, directory or glob, for example `packages/cli/src`',
    );
  }
  return value;
}

export function compileArea(area: string): CompiledArea {
  const value = normaliseArea(area);
  return { area: value, match: picomatch(value) };
}

/**
 * Does this area claim this file?
 *
 * Deliberately generous, and symmetric -- the same reading decides both what a
 * ticket owns and what its neighbour owns, so being generous never refuses a
 * range it would otherwise have accepted.
 */
export function areaClaims(compiled: CompiledArea, file: string): boolean {
  return file === compiled.area || file.startsWith(`${compiled.area}/`) || compiled.match(file);
}

/**
 * Do two areas contend for the same ground?
 *
 * Symmetric on purpose: `packages/cli/src` claims `packages/cli/src/lib/x.ts`,
 * so the pair overlaps whichever way round the two tickets declared them. Two
 * globs that match no literal form of each other read as disjoint, which
 * under-detects rather than over-detects; the audit stays the backstop.
 */
export function areasOverlap(left: CompiledArea, right: CompiledArea): boolean {
  return areaClaims(left, right.area) || areaClaims(right, left.area);
}
