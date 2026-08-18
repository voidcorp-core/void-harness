import { describe, expect, it } from 'vitest';
import {
  judgeObservedIgnore,
  observedWriteCandidates,
  type ObservedPathObservation,
} from './observed-write-paths.js';

function seen(over: Partial<ObservedPathObservation> = {}): ObservedPathObservation {
  return { path: '.void/outputs', present: true, ignored: true, ...over };
}

describe('observedWriteCandidates', () => {
  it('covers the legacy locations a published bundle still writes to', () => {
    // The hole that cost a morning: `.void/outputs/` was written by the shipped
    // hook bundle on every session and matched by no ignore rule at all.
    const paths = observedWriteCandidates().map((candidate) => candidate.path);

    expect(paths).toContain('.void/outputs');
    expect(paths).toContain('.void/runs');
    expect(paths).toContain('.void/local');
    expect(paths).toContain('.void/machine');
  });

  it('never proposes a path the project is supposed to commit', () => {
    // Ignoring `.void/hooks/` or `.codex/hooks.json` breaks every fresh clone:
    // `.claude/settings.json` resolves the first by name, and the second IS the
    // Codex safety floor. Their absence is an error, not a degradation.
    const paths = observedWriteCandidates().map((candidate) => candidate.path);

    expect(paths).not.toContain('.void');
    expect(paths).not.toContain('.void/hooks');
    expect(paths).not.toContain('.codex/hooks.json');
  });

  it('probes from inside the path, because a directory-only rule matches contents, not the name', () => {
    // Measured against git 2.x: with the rule `x/`, `git check-ignore x` answers
    // "not ignored" whenever `x` is absent from disk, while `x/<child>` answers
    // "ignored" either way. Probing the name alone would therefore under-report
    // exactly where the rule is correct.
    const candidates = observedWriteCandidates();

    expect(candidates.find((candidate) => candidate.path === '.void/outputs')?.probe)
      .toBe('.void/outputs/.void-probe');
    expect(candidates.find((candidate) => candidate.path === '.void/status.json')?.probe)
      .toBe('.void/status.json/.void-probe');
  });
});

describe('judgeObservedIgnore', () => {
  it('passes when every observed path on disk is ignored', () => {
    const check = judgeObservedIgnore([seen(), seen({ path: '.void/machine' })]);

    expect(check.status).toBe('pass');
    expect(check.ok).toBe(true);
  });

  it('passes when nothing observed exists on disk yet', () => {
    expect(judgeObservedIgnore([]).status).toBe('pass');
  });

  it('says nothing about a path that does not exist here', () => {
    // Reporting an absent directory would fire in every project at once, and a
    // report that always fires is a report nobody reads.
    const check = judgeObservedIgnore([seen({ present: false, ignored: false })]);

    expect(check.status).toBe('pass');
    expect(check.message).not.toContain('.void/outputs');
  });

  it('fails on a path that exists and git does not ignore, naming it', () => {
    const check = judgeObservedIgnore([seen({ ignored: false })]);

    expect(check.status).toBe('fail');
    expect(check.ok).toBe(false);
    expect(check.message).toContain('.void/outputs');
    expect(check.message).toMatch(/would commit/);
    expect(check.fix).toContain('void-harness update');
  });

  it('reports a fact it could not measure as unknown, never as a defect', () => {
    // git absent or refusing to answer is not evidence of a leak.
    const check = judgeObservedIgnore([seen({ ignored: undefined })]);

    expect(check.status).toBe('unknown');
  });

  it('lets a measured leak outrank an unmeasured path', () => {
    const check = judgeObservedIgnore([
      seen({ path: '.void/runs', ignored: undefined }),
      seen({ path: '.void/outputs', ignored: false }),
    ]);

    expect(check.status).toBe('fail');
    expect(check.message).toContain('.void/outputs');
  });

  it('never calls a deliberately tracked path a defect, whatever it is handed', () => {
    const check = judgeObservedIgnore([
      seen({ path: '.void/hooks', ignored: false }),
      seen({ path: '.codex/hooks.json', ignored: false }),
      seen({ path: '.void', ignored: false }),
    ]);

    expect(check.status).toBe('pass');
  });
});
