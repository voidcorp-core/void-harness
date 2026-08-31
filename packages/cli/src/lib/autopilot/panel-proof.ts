// Did the panel speak before anything was written?
//
// Measured on 2026-08-30: sixteen canonical specialists were compiled for both
// runtimes, and `void-implement` convened them at pass 10 -- after the code
// existed. A panel that speaks afterwards reviews; it does not brief, which is
// the entire reason it exists. The order was fixed in the skill the same day and
// this is what stops it drifting back, because prose has no compiler.
//
// Read from the event stream rather than from anything a worker reports. The
// events are written by the dispatch and the lifecycle recorder, so a worker that
// skipped the panel cannot produce them and a worker that claims it did not
// convene anybody is not consulted.

export interface PanelEvent {
  readonly kind:
    | 'specialist.requested'
    | 'specialist.started'
    | 'specialist.completed'
    | 'specialist.failed'
    | 'lead-writer.requested'
    | 'lead-writer.completed';
  /** Monotonic position in the mission stream; a stream may arrive unsorted. */
  readonly seq: number;
  readonly stage?: 'pre-implementation' | 'post-implementation';
}

/**
 * Why the order could not be proven.
 *
 * `no-events` and `panel-absent` are deliberately distinct. An empty stream is a
 * mission that did not run, and reading it as a missing panel sends someone to
 * fix the panel rather than to ask why there is no mission.
 */
export type PanelUnprovenReason = 'no-events' | 'panel-absent' | 'writing-came-first';

export type PanelOutcome =
  | { readonly kind: 'satisfied'; readonly briefedAtSeq: number }
  | {
      readonly kind: 'unproven';
      readonly reason: PanelUnprovenReason;
      readonly detail: string;
    };

const WRITING = new Set(['lead-writer.requested', 'lead-writer.completed']);

export function judgePanelBeforeWriting(events: readonly PanelEvent[]): PanelOutcome {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      kind: 'unproven',
      reason: 'no-events',
      detail: 'the mission stream is empty, so no mission ran here',
    };
  }

  // Only a COMPLETION at pre-implementation counts. A request is an intention, a
  // failure produced no brief, and a completion at review time is the pass this
  // proof exists to distinguish itself from.
  const briefs = events
    .filter((event) => event.kind === 'specialist.completed' && event.stage === 'pre-implementation')
    .map((event) => event.seq)
    .sort((left, right) => left - right);

  const writings = events
    .filter((event) => WRITING.has(event.kind))
    .map((event) => event.seq)
    .sort((left, right) => left - right);

  const firstBrief = briefs[0];
  if (firstBrief === undefined) {
    return {
      kind: 'unproven',
      reason: 'panel-absent',
      detail: 'no specialist completed at pre-implementation, so nothing briefed the writer',
    };
  }

  // A brief with nothing written after it is a mission still in flight, not one
  // that skipped the panel: the proof is about order, and it already holds.
  const firstWriting = writings[0];
  if (firstWriting !== undefined && firstWriting < firstBrief) {
    return {
      kind: 'unproven',
      reason: 'writing-came-first',
      detail: `writing began at event ${String(firstWriting)},`
        + ` before the panel completed at ${String(firstBrief)}`,
    };
  }

  return { kind: 'satisfied', briefedAtSeq: firstBrief };
}
