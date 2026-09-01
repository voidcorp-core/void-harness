/**
 * A run that died must not read like a run that is working.
 *
 * The slice before this made the cycle unattended, and its gate -- "no human
 * interaction between launch and the pull request" -- is satisfied by a run
 * that stalls silently at minute ten and contradicted by nothing. Six hours
 * later a person finds no pull request and cannot tell whether it is still
 * going, whether it died, or whether it never started.
 *
 * So the run says where it is, after every decision, in the one place a person
 * can read without a terminal: the body of a draft pull request. And silence
 * itself becomes readable, by comparing the last beat against the ceiling one
 * unit is allowed.
 */

import { describe, expect, it } from 'vitest';
import { judgeLiveness, renderRunProgress, type RunBeat } from './run-progress.js';

const AT = (minute: number): string => `1970-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`;

function beat(over: Partial<RunBeat> = {}): RunBeat {
  return {
    at: AT(5),
    step: 'reconcile',
    unit: 'DEV-1',
    spentMs: 5 * 60_000,
    remainingMs: 115 * 60_000,
    ...over,
  };
}

describe('judgeLiveness', () => {
  // The whole point. A silence longer than one unit's ceiling is not patience.
  it('calls a run stalled once its silence outlasts what one unit may take', () => {
    const verdict = judgeLiveness({
      beats: [beat()],
      now: AT(45),
      unitCeilingMs: 30 * 60_000,
      ended: false,
    });

    expect(verdict.kind).toBe('stalled');
    expect(verdict.detail).toContain('DEV-1');
    expect(verdict.detail).toMatch(/40m|last/i);
  });

  it('calls it alive while the silence is shorter than that', () => {
    expect(
      judgeLiveness({ beats: [beat()], now: AT(20), unitCeilingMs: 30 * 60_000, ended: false }).kind,
    ).toBe('alive');
  });

  // A run that ended is not a stalled one, however long the silence since. The
  // two lead a reader to opposite places: one to wait, one to go looking.
  it('never calls an ended run stalled, however old its last beat', () => {
    const verdict = judgeLiveness({
      beats: [beat({ step: 'chain' })],
      now: AT(59),
      unitCeilingMs: 30 * 60_000,
      ended: true,
    });

    expect(verdict.kind).toBe('ended');
  });

  // A launch that never reached its first decision looks exactly like a healthy
  // start until the ceiling passes. It is the case a person hits most often.
  it('reports a run that never beat as unstarted, not as alive', () => {
    const verdict = judgeLiveness({ beats: [], now: AT(3), unitCeilingMs: 30 * 60_000, ended: false });

    expect(verdict.kind).toBe('unstarted');
    expect(verdict.detail).toMatch(/no decision/i);
  });
});

describe('renderRunProgress', () => {
  const rendered = (over: Record<string, unknown> = {}): string =>
    renderRunProgress({
      runId: 'run-a',
      base: { branch: 'develop', sha: 'a'.repeat(40) },
      beats: [beat({ at: AT(2), step: 'reconcile', unit: 'DEV-1' }), beat({ at: AT(9), step: 'chain', unit: 'DEV-2' })],
      liveness: { kind: 'alive', detail: 'last beat 1m ago' },
      journal: '2 merge(s) in this run:\n1. DEV-1',
      ...over,
    });

  it('names the last unit and the state, in the first lines a phone shows', () => {
    const head = rendered().split('\n').slice(0, 6).join('\n');

    expect(head).toContain('DEV-2');
    expect(head).toMatch(/alive/i);
  });

  it('shows what is left of the budget, not only what was spent', () => {
    expect(rendered()).toMatch(/115m|1h55m/);
  });

  it('says a stalled run is stalled, above everything else', () => {
    const body = rendered({ liveness: { kind: 'stalled', detail: 'no beat for 40m, last was DEV-2' } });

    expect(body.split('\n')[0]).toMatch(/stalled/i);
    expect(body).toContain('40m');
  });

  it('carries the merge journal, so provenance is readable before the run ends', () => {
    expect(rendered()).toContain('DEV-1');
    expect(rendered()).toContain('merge(s) in this run');
  });

  it('reads as a start rather than a failure when nothing has happened yet', () => {
    const body = rendered({ beats: [], liveness: { kind: 'unstarted', detail: 'no decision yet' }, journal: 'Nothing merged in this run.' });

    expect(body).toMatch(/no decision yet/i);
    expect(body).not.toMatch(/stalled/i);
  });
});
