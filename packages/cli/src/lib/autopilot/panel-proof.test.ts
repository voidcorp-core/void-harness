import { describe, expect, it } from 'vitest';
import { judgePanelBeforeWriting, type PanelEvent } from './panel-proof.js';

const event = (
  kind: PanelEvent['kind'],
  seq: number,
  over: Partial<PanelEvent> = {},
): PanelEvent => ({ kind, seq, stage: 'pre-implementation', ...over });

describe('judgePanelBeforeWriting', () => {
  it('is satisfied when a specialist completed before the first writing', () => {
    const outcome = judgePanelBeforeWriting([
      event('specialist.requested', 1),
      event('specialist.completed', 2),
      event('lead-writer.completed', 3),
    ]);

    expect(outcome.kind).toBe('satisfied');
  });

  // The defect measured on 2026-08-30: sixteen specialists compiled, the panel
  // convened at pass 10, after the code existed. A panel that speaks afterwards
  // reviews; it does not brief.
  it('refuses when the writing came first, because that panel briefed nobody', () => {
    const outcome = judgePanelBeforeWriting([
      event('lead-writer.completed', 1),
      event('specialist.completed', 2),
    ]);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('writing-came-first');
  });

  it('refuses when no specialist completed at all', () => {
    const outcome = judgePanelBeforeWriting([event('lead-writer.completed', 1)]);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('panel-absent');
  });

  // Distinct from panel-absent: a stream with nothing in it is a mission that
  // did not run, and reading it as "the panel was absent" sends someone to fix
  // the panel rather than to ask why there is no mission.
  it('separates an empty stream from a panel that was absent', () => {
    const empty = judgePanelBeforeWriting([]);
    const absent = judgePanelBeforeWriting([event('lead-writer.completed', 1)]);

    expect(empty.kind).toBe('unproven');
    if (empty.kind === 'unproven') expect(empty.reason).toBe('no-events');
    expect(empty).not.toEqual(absent);
  });

  it('reads only a completion at pre-implementation, never one at review time', () => {
    const outcome = judgePanelBeforeWriting([
      event('specialist.completed', 1, { stage: 'post-implementation' }),
      event('lead-writer.completed', 2),
    ]);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('panel-absent');
  });

  it('is not satisfied by a specialist that was requested and never completed', () => {
    const outcome = judgePanelBeforeWriting([
      event('specialist.requested', 1),
      event('lead-writer.completed', 2),
    ]);

    expect(outcome.kind).toBe('unproven');
  });

  it('is not satisfied by a specialist that failed', () => {
    const outcome = judgePanelBeforeWriting([
      event('specialist.failed', 1),
      event('lead-writer.completed', 2),
    ]);

    expect(outcome.kind).toBe('unproven');
  });

  // A brief with nothing written after it is a mission still in flight, not one
  // that skipped the panel. The proof is about ORDER, and order needs both ends.
  it('is satisfied when the panel spoke and nothing has been written yet', () => {
    const outcome = judgePanelBeforeWriting([event('specialist.completed', 1)]);

    expect(outcome.kind).toBe('satisfied');
  });

  it('orders by sequence rather than by array position, since a stream can arrive unsorted', () => {
    const outcome = judgePanelBeforeWriting([
      event('lead-writer.completed', 9),
      event('specialist.completed', 2),
    ]);

    expect(outcome.kind).toBe('satisfied');
  });

  it('names the writing it came after, so a reader can open it', () => {
    const outcome = judgePanelBeforeWriting([
      event('lead-writer.completed', 4),
      event('specialist.completed', 7),
    ]);

    if (outcome.kind === 'unproven') expect(outcome.detail).toContain('4');
  });
});
