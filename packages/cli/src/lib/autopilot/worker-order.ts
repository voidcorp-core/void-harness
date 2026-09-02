// Which workers may run at the same time, and which must take turns.
//
// This is the partition of A1 sharpened with what B needs: the project's own
// single-writer paths, and migrations. Both defeat footprint reasoning — two
// tickets can touch entirely different files and still both rewrite the
// lockfile, and a migration mutates shared dev state no file list describes.
//
// Conservative on purpose. A ticket runs in parallel only when nothing argues
// against it; anything else takes its turn, keeping its worktree either way.

import picomatch from 'picomatch';
import { autopilotFailure } from './errors.js';
import { type CompiledArea, areasOverlap, compileArea } from './footprint-area.js';

export type SequenceReason =
  | 'unknown-footprint'
  | 'low-confidence'
  | 'high-risk'
  | 'migration'
  | 'shared-ownership'
  | 'footprint-overlap';

export interface OrderFootprint {
  readonly id: string;
  readonly areas: readonly string[];
  readonly highRisk: boolean;
  readonly confidence: number;
  /** True when the ticket generates or applies a migration. */
  readonly touchesMigration: boolean;
}

export interface OrderInput {
  /** Cluster tickets, in the order the plan declared them. */
  readonly tickets: readonly string[];
  readonly footprints: readonly OrderFootprint[];
  /** Path patterns the active program reserves to a single writer. */
  readonly sequentialOwnership: readonly string[];
  /** Below this confidence a footprint is doubtful. Default 0.5. */
  readonly minConfidence?: number;
}

export interface WorkerOrder {
  readonly parallel: readonly string[];
  readonly sequential: readonly string[];
  /** Why each sequenced ticket lost its parallel slot. */
  readonly reasons: Readonly<Record<string, readonly SequenceReason[]>>;
}

const DEFAULT_MIN_CONFIDENCE = 0.5;

// Read through `footprint-area`, the same relation the reconciliation audit
// uses. Compared by exact string equality, `packages/cli/src` and
// `packages/cli/src/lib/x.ts` were disjoint here and nested there: the pair ran
// in parallel, and the audit then refused the second ticket's own neighbouring
// file on the first's behalf. One reading, or the two drift by construction.
function overlaps(a: readonly CompiledArea[], b: readonly CompiledArea[]): boolean {
  return a.some((left) => b.some((right) => areasOverlap(left, right)));
}

export function orderWorkers(input: OrderInput): WorkerOrder {
  if (input.tickets.length === 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the cluster to order is empty',
      'no ticket was passed to the ordering step',
      'plan a cluster before ordering its workers',
    );
  }
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const byId = new Map(input.footprints.map((footprint) => [footprint.id, footprint]));
  // Compiled once, and before any ordering: an area that claims nothing is a
  // contract failure, not a ticket that happens to collide with nobody.
  const areasById = new Map(
    input.footprints.map((footprint) => [footprint.id, footprint.areas.map(compileArea)] as const),
  );

  // Compiled once: an ownership list is short, but this runs per area per ticket.
  // `dot: true` for the reason `compileArea` carries: picomatch spans no hidden
  // segment by default, and the paths a program reserves to one writer are
  // mostly hidden ones -- `.void`, `.claude`, `.github`. `**/hooks/**` saw
  // `packages/core/hooks` and not `.void/hooks`, so the reservation this reason
  // exists to honour was the shape it could not see.
  const owned = input.sequentialOwnership.map((pattern) => picomatch(pattern, { dot: true }));
  const isOwned = (area: string): boolean => owned.some((match) => match(area));

  const reasons: Record<string, SequenceReason[]> = {};
  const parallel: string[] = [];
  const sequential: string[] = [];

  for (const ticketId of input.tickets) {
    const footprint = byId.get(ticketId);
    const why: SequenceReason[] = [];

    if (footprint === undefined || footprint.areas.length === 0) {
      why.push('unknown-footprint');
    } else {
      if (footprint.confidence < minConfidence) why.push('low-confidence');
      if (footprint.highRisk) why.push('high-risk');
      if (footprint.touchesMigration) why.push('migration');
      const areas = areasById.get(ticketId) ?? [];
      if (areas.some((entry) => isOwned(entry.area))) why.push('shared-ownership');

      const collides = input.tickets.some((other) => {
        if (other === ticketId) return false;
        const otherAreas = areasById.get(other);
        return otherAreas !== undefined && overlaps(areas, otherAreas);
      });
      if (collides) why.push('footprint-overlap');
    }

    if (why.length === 0) parallel.push(ticketId);
    else {
      sequential.push(ticketId);
      reasons[ticketId] = why;
    }
  }

  return { parallel, sequential, reasons };
}
