// Review budget for an autopilot cluster: decide how many of the selected
// tickets one human can still review in a single integration PR. Pure.
//
// Four tickets is a CEILING, not a quota. What shrinks a cluster is structural
// doubt about the work — an unknown footprint, a shaky estimate of it, a
// guaranteed-collision zone — because each of those is what actually makes a
// combined diff hard to read. The tracker estimate is totalled and reported as
// evidence, but it never spends budget on its own: this project's board is
// mostly `L`, so vetoing on points would make autopilot single-ticket without
// measuring any real risk (see the plan's [P1] decision).

/** Structural doubt that makes a ticket cost more than a baseline review unit. */
export type ReviewLoadReason = 'unknown-footprint' | 'low-confidence' | 'high-risk';

export interface ReviewSignal {
  readonly id: string;
  /** Estimated touched areas. Empty = unknown footprint. */
  readonly areas: readonly string[];
  /** Lockfile / migrations / other guaranteed-collision zones. */
  readonly highRisk: boolean;
  /** Footprint estimator confidence, 0..1. */
  readonly confidence: number;
  /** Tracker estimate in points, or null when the ticket carries none. */
  readonly estimate: number | null;
}

export interface ReviewLoadEntry {
  readonly id: string;
  readonly load: number;
  readonly reasons: readonly ReviewLoadReason[];
}

export interface DeferredTicket {
  readonly id: string;
  readonly reason: 'review-budget-exhausted';
}

export interface ReviewBudget {
  /** Review units available to the whole cluster. */
  readonly capacity: number;
  /** Units actually spent by the admitted tickets. */
  readonly spent: number;
  readonly admitted: readonly string[];
  readonly deferred: readonly DeferredTicket[];
  /** Per-ticket cost and the doubts that produced it, for the review proof. */
  readonly load: readonly ReviewLoadEntry[];
  /** Sum of the tracker estimates present, shown as evidence only. */
  readonly totalEstimate: number;
  /** Tickets carrying no tracker estimate: absent is not zero. */
  readonly unestimated: readonly string[];
}

export interface ReviewBudgetOptions {
  /** Review units for the cluster. Default 4, mirroring the cluster ceiling. */
  readonly capacity?: number;
  /** Below this confidence the footprint is treated as doubtful. Default 0.5. */
  readonly minConfidence?: number;
}

const DEFAULT_CAPACITY = 4;
const DEFAULT_MIN_CONFIDENCE = 0.5;
const HIGH_RISK_LOAD = 2;

function loadOf(signal: ReviewSignal, minConfidence: number): ReviewLoadEntry {
  const reasons: ReviewLoadReason[] = [];
  if (signal.areas.length === 0) reasons.push('unknown-footprint');
  if (signal.confidence < minConfidence) reasons.push('low-confidence');
  if (signal.highRisk) reasons.push('high-risk');

  const extra = reasons.reduce((sum, reason) => sum + (reason === 'high-risk' ? HIGH_RISK_LOAD : 1), 0);
  return { id: signal.id, load: 1 + extra, reasons };
}

/**
 * Admit tickets in the order given — already ranked upstream — while the review
 * budget holds. Admission stops at the first ticket that does not fit rather
 * than skipping ahead to a cheaper one, so a lower-ranked ticket never overtakes
 * the one it was queued behind.
 */
export function admitWithinReviewBudget(
  signals: readonly ReviewSignal[],
  options?: ReviewBudgetOptions,
): ReviewBudget {
  const capacity = options?.capacity ?? DEFAULT_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(
      `autopilot: review budget capacity must be an integer >= 1, received ${capacity}. Set a capacity that can admit at least one ticket.`,
    );
  }
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const load = signals.map((signal) => loadOf(signal, minConfidence));
  const admitted: string[] = [];
  const deferred: DeferredTicket[] = [];
  let spent = 0;

  for (const entry of load) {
    // The first ticket is always admitted: a single unit of work is the
    // indivisible minimum, so no amount of doubt can make it unreviewable —
    // it simply becomes a cluster of one.
    const fits = admitted.length === 0 || spent + entry.load <= capacity;
    if (!fits || deferred.length > 0) {
      deferred.push({ id: entry.id, reason: 'review-budget-exhausted' });
      continue;
    }
    admitted.push(entry.id);
    spent += entry.load;
  }

  const estimates = signals.filter((signal) => signal.estimate !== null);
  return {
    capacity,
    spent,
    admitted,
    deferred,
    load,
    totalEstimate: estimates.reduce((sum, signal) => sum + (signal.estimate ?? 0), 0),
    unestimated: signals.filter((signal) => signal.estimate === null).map((signal) => signal.id),
  };
}
