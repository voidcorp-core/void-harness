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

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((area) => set.has(area));
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

  // Compiled once: an ownership list is short, but this runs per area per ticket.
  const owned = input.sequentialOwnership.map((pattern) => picomatch(pattern));
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
      if (footprint.areas.some(isOwned)) why.push('shared-ownership');

      const collides = input.tickets.some((other) => {
        if (other === ticketId) return false;
        const otherFootprint = byId.get(other);
        return otherFootprint !== undefined && overlaps(footprint.areas, otherFootprint.areas);
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
