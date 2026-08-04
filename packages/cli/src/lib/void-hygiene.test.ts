import { describe, expect, it } from 'vitest';
import type { CheckResult } from './prerequisites.js';
import { judgeLayout, type LayoutObservation } from './void-hygiene.js';

function observation(over: Partial<LayoutObservation> = {}): LayoutObservation {
  return { pending: [], localIgnored: true, trackedObserved: [], ...over };
}

function named(results: readonly CheckResult[], name: string): CheckResult | undefined {
  return results.find((result) => result.name === name);
}

describe('judgeLayout', () => {
  it('passes a project that keeps observed state out of its history', () => {
    expect(judgeLayout(observation()).every((check) => check.ok)).toBe(true);
  });

  it('reports state left at the old location, and points at the command that moves it', () => {
    const check = named(judgeLayout(observation({ pending: ['runs', 'activations.jsonl'] })), 'void layout');

    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('runs');
    expect(check?.fix).toContain('void-harness update');
  });

  it('does not confuse "no git" with "not ignored"', () => {
    // One is a project shipping telemetry; the other is a directory nobody
    // versions. Collapsing them either cries wolf or hides a real leak.
    const absent = named(judgeLayout(observation({ localIgnored: null })), 'void ignore');
    const notIgnored = named(judgeLayout(observation({ localIgnored: false })), 'void ignore');

    expect(absent?.status).toBe('unknown');
    expect(notIgnored?.status).toBe('fail');
  });

  it('treats an already-tracked observed path as its own failure', () => {
    // git ignores nothing it already tracks, so writing the block does not fix
    // this one — the fix has to be an explicit untrack.
    const check = named(judgeLayout(observation({ trackedObserved: ['.void/usage.log'] })), 'void tracked');

    expect(check?.status).toBe('fail');
    expect(check?.fix).toContain('git rm --cached');
    expect(check?.fix).toContain('.void/usage.log');
  });

  it('says the consequence, not just the state', () => {
    const check = named(judgeLayout(observation({ localIgnored: false })), 'void ignore');

    expect(check?.message).toMatch(/would be committed/);
  });
});
