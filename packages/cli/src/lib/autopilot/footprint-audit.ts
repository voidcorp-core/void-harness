// Whether a worker range only carries work its own ticket was entitled to.
//
// `git-observation` proves a range is the linear history it claims to be. It
// says nothing about WHAT that history contains, and the two questions have
// different failure modes: a range can descend cleanly from the base, hold no
// merge, match its declared commits exactly, and still carry another ticket's
// files -- because the worktrees share `refs/stash`, because a `git add -A`
// swept up a neighbour, because a rebase went sideways. Disjoint footprints
// then make the merge succeed without a conflict, and unclaimed code reaches
// the integration pull request under a message that never mentions it.
//
// The rule, and it is the design call of this module: a range is refused for a
// file **another ticket of the cluster declared**, never for a file merely
// nobody predicted. Widening is normal and often the point -- a ticket that
// enumerates from the manifests finds the packages the ticket author missed,
// and a guard that refuses that discovery is a guard that hides defects. What
// is never normal is one ticket writing another's declared area: nothing
// legitimate produces it, and it is exactly the shape contamination takes.
//
// Pure: it decides, it observes nothing. The caller supplies the files git
// reported for the range, never the ones the worker said it touched.

import { autopilotFailure } from './errors.js';
import { areaClaims, compileArea, normaliseArea } from './footprint-area.js';

export interface DeclaredFootprint {
  readonly id: string;
  /** Paths, directories or globs the ticket named as its anchors. */
  readonly areas: readonly string[];
}

export interface AuditedRange {
  readonly ticketId: string;
  /** Files git reported for the range. A worker's own list is not evidence. */
  readonly files: readonly string[];
}

export interface Intrusion {
  readonly file: string;
  /** Cluster tickets that declared this file, in declaration order. */
  readonly claimedBy: readonly string[];
}

export type FootprintVerdict =
  | {
      readonly kind: 'within-scope';
      /** Files nobody claimed: allowed, reported so a reader sees the growth. */
      readonly widened: readonly string[];
    }
  | {
      readonly kind: 'breach';
      readonly ticketId: string;
      readonly intrusions: readonly Intrusion[];
      readonly detail: string;
    };

export interface FootprintAuditInput {
  /** Every ticket of the cluster and what it declared, ran or not. */
  readonly footprints: readonly DeclaredFootprint[];
  /**
   * Paths the reconciler owns; a range never keeps them, so it is not judged on
   * them. Matched literally -- exact path or containing directory -- because
   * that is exactly what the strip step matches. An exemption wider than the
   * strip would clear a file for the audit that the merge then keeps.
   */
  readonly exempt: readonly string[];
}

/**
 * The file list is what git reported, or the audit answers nothing.
 *
 * The type says `readonly string[]`, but this value crossed a JSON boundary
 * where a type is a wish. A string survives every emptiness check -- it has a
 * `length`, and `for...of` iterates it -- and then walks character by character:
 * no character matches an area, so the verdict is `within-scope`, which is this
 * module's word for approval. Refusing loudly is the whole difference between a
 * guard and a formality.
 */
function requireObservation(files: AuditedRange['files'], ticketId: string): void {
  const observed =
    Array.isArray(files) && files.every((file) => typeof file === 'string' && file.trim() !== '');
  if (observed) return;
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    'a range was audited against something git never observed',
    `the file list for \`${ticketId}\` is ${typeof files === 'string' ? 'a string' : 'not a list of paths'}`,
    "pass `git diff --name-only base..head` verbatim; a worker's own list is not an observation",
  );
}

/**
 * A declaration is a list of areas, for the same reason a range is a list of files.
 *
 * `areas` crossed the same JSON boundary as `files`, and a string survives the
 * emptiness check one layer up -- `'packages/core'.length > 0` is true -- so a
 * footprint written as a bare path arrives here looking declared, and turns into
 * `areas.map is not a function` at the line that compiles it. Which names
 * neither the ticket nor the field.
 */
function requireDeclarations(footprints: readonly DeclaredFootprint[]): void {
  const malformed = footprints.filter(
    (footprint) =>
      !Array.isArray(footprint.areas) ||
      footprint.areas.some((area) => typeof area !== 'string' || area.trim() === ''),
  );
  if (malformed.length === 0) return;
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    'a footprint declares its areas as something other than a list of paths',
    `${malformed.map((footprint) => footprint.id).join(', ')} declared \`areas\` that is not a list of non-empty paths`,
    'pass `footprints` exactly as `orchestrate` returned them; one entry per ticket, and `areas` is an array even when it holds a single path',
  );
}

export function auditFootprint(range: AuditedRange, input: FootprintAuditInput): FootprintVerdict {
  requireObservation(range.files, range.ticketId);
  requireDeclarations(input.footprints);
  // Compiled through the shared reading, so the audit and `orderWorkers` cannot
  // disagree about what an area claims -- and so an area that claims nothing is
  // refused here rather than passing as an empty claim.
  const compiled = input.footprints.map((footprint) => ({
    id: footprint.id,
    areas: footprint.areas.map(compileArea),
  }));
  const exempt = input.exempt.map(normaliseArea);
  const isExempt = (file: string): boolean =>
    exempt.some((pattern) => file === pattern || file.startsWith(`${pattern}/`));

  const owns = (ticketId: string, file: string): boolean =>
    compiled
      .filter((footprint) => footprint.id === ticketId)
      .some((footprint) => footprint.areas.some((entry) => areaClaims(entry, file)));

  const intrusions: Intrusion[] = [];
  const widened: string[] = [];

  for (const file of range.files) {
    if (isExempt(file)) continue;
    if (owns(range.ticketId, file)) continue;

    const claimedBy = compiled
      .filter(
        (footprint) =>
          footprint.id !== range.ticketId &&
          footprint.areas.some((entry) => areaClaims(entry, file)),
      )
      .map((footprint) => footprint.id);

    if (claimedBy.length === 0) widened.push(file);
    else intrusions.push({ file, claimedBy });
  }

  if (intrusions.length === 0) return { kind: 'within-scope', widened };

  const named = intrusions
    .map((entry) => `${entry.file} (declared by ${entry.claimedBy.join(', ')})`)
    .join('; ');
  return {
    kind: 'breach',
    ticketId: range.ticketId,
    intrusions,
    detail:
      `\`${range.ticketId}\` touches ${String(intrusions.length)} file(s) another ticket of the` +
      ` cluster declared: ${named}`,
  };
}
