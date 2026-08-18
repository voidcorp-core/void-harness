import { describe, expect, it } from 'vitest';
import { judgeRunnerStaleness, runnerStalenessCheck, suspendsStructureChecks } from './runner-staleness.js';

// A CLI older than the layout it inspects reads the previous layout and reports
// structural failures that are not real: on 2026-08-18 a 2.5.1 binary told a
// healthy 2.7.0 project that PHILOSOPHY.md was missing, that its hooks never
// fired, and that five packs were unwired — three remedies, all destructive,
// all wrong. The version gap is the finding; everything downstream of it is noise.
describe('judgeRunnerStaleness', () => {
  it('names the gap when the running CLI is older than the recorded layout', () => {
    const verdict = judgeRunnerStaleness({ running: '2.5.1', recorded: '2.7.0' });
    expect(verdict).toEqual({ state: 'stale', running: '2.5.1', recorded: '2.7.0' });
  });

  it('is current when both agree', () => {
    expect(judgeRunnerStaleness({ running: '2.7.0', recorded: '2.7.0' }).state).toBe('current');
  });

  it('tolerates a leading v or range marker on either side', () => {
    expect(judgeRunnerStaleness({ running: 'v2.7.0', recorded: '^2.7.0' }).state).toBe('current');
  });

  // A newer CLI against an older project is the ordinary state between a publish
  // and that project's `update`. It is what `update` is for, not a fault.
  it('is ahead, not stale, when the CLI is newer than the project', () => {
    expect(judgeRunnerStaleness({ running: '2.8.0', recorded: '2.7.0' }).state).toBe('ahead');
  });

  it('is unknown when the project records no version', () => {
    expect(judgeRunnerStaleness({ running: '2.7.0', recorded: undefined })).toEqual({
      state: 'unknown',
      reason: 'no-recorded-version',
    });
  });

  it('is unknown when the running version cannot be read', () => {
    expect(judgeRunnerStaleness({ running: undefined, recorded: '2.7.0' })).toEqual({
      state: 'unknown',
      reason: 'no-running-version',
    });
  });

  it('is unknown rather than stale on an unparseable recorded version', () => {
    expect(judgeRunnerStaleness({ running: '2.7.0', recorded: 'nightly' }).state).toBe('unknown');
  });
});

describe('suspendsStructureChecks', () => {
  it('suspends only on a stale runner', () => {
    expect(suspendsStructureChecks(judgeRunnerStaleness({ running: '2.5.1', recorded: '2.7.0' }))).toBe(true);
    expect(suspendsStructureChecks(judgeRunnerStaleness({ running: '2.7.0', recorded: '2.7.0' }))).toBe(false);
    expect(suspendsStructureChecks(judgeRunnerStaleness({ running: '2.8.0', recorded: '2.7.0' }))).toBe(false);
    expect(suspendsStructureChecks(judgeRunnerStaleness({ running: '2.7.0', recorded: undefined }))).toBe(false);
  });
});

describe('runnerStalenessCheck', () => {
  it('fails, carries both versions, and offers the upgrade as the remedy', () => {
    const check = runnerStalenessCheck(judgeRunnerStaleness({ running: '2.5.1', recorded: '2.7.0' }));
    expect(check?.ok).toBe(false);
    expect(check?.message).toContain('2.5.1');
    expect(check?.message).toContain('2.7.0');
    expect(check?.fix).toContain('voidharness@latest');
  });

  // Silence is the point: a healthy pair must not add a line to a list people
  // already scan under time pressure.
  it('emits nothing when the runner is not stale', () => {
    expect(runnerStalenessCheck(judgeRunnerStaleness({ running: '2.7.0', recorded: '2.7.0' }))).toBeUndefined();
    expect(runnerStalenessCheck(judgeRunnerStaleness({ running: '2.8.0', recorded: '2.7.0' }))).toBeUndefined();
    expect(runnerStalenessCheck(judgeRunnerStaleness({ running: '2.7.0', recorded: undefined }))).toBeUndefined();
  });
});
