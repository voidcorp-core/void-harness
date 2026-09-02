import { describe, expect, it } from 'vitest';
import {
  judgeKeptTracked,
  keptTrackedCandidates,
  type KeptTrackedObservation,
} from './kept-tracked-paths.js';

const seen = (over: Partial<KeptTrackedObservation> = {}): KeptTrackedObservation => ({
  path: '.void/config.json',
  present: true,
  ignored: false,
  rule: undefined,
  ...over,
});

describe('keptTrackedCandidates', () => {
  it('names the paths whose absence from a clone is an error, not a degradation', () => {
    const paths = keptTrackedCandidates();

    expect(paths).toContain('.void/config.json');
    expect(paths).toContain('.void/install-manifest.json');
    expect(paths).toContain('.void/hooks');
    expect(paths).toContain('.codex/hooks.json');
    expect(paths).toContain('.claude/settings.json');
  });

  it('never names an observed path, which the block ignores on purpose', () => {
    expect(keptTrackedCandidates()).not.toContain('.void/machine');
    expect(keptTrackedCandidates()).not.toContain('.void/installed');
  });
});

describe('judgeKeptTracked', () => {
  it('passes a project where every declared path is visible to git', () => {
    expect(judgeKeptTracked([seen(), seen({ path: '.codex/hooks.json' })]).ok).toBe(true);
  });

  it('says nothing about a path this project does not have', () => {
    const check = judgeKeptTracked([seen({ path: '.codex/hooks.json', present: false, ignored: true })]);

    expect(check.ok).toBe(true);
  });

  // The whole point of the check: the block declares these tracked, a project
  // rule higher in the file wins, and nothing said so. A fresh clone then has
  // .claude/settings.json naming hooks that are not there.
  it('fails naming the path AND the project rule that hides it', () => {
    const check = judgeKeptTracked([
      seen({ path: '.void/hooks', ignored: true, rule: '.gitignore:1:.void/*' }),
    ]);

    expect(check.status).toBe('fail');
    expect(check.message).toContain('.void/hooks');
    expect(check.message).toContain('.gitignore:1:.void/*');
    expect(check.fix).toContain('git check-ignore -v');
  });

  it('reports a path git could not be asked about as unknown, never as a defect', () => {
    const check = judgeKeptTracked([seen({ ignored: undefined })]);

    expect(check.status).toBe('unknown');
    expect(check.ok).toBe(false);
  });

  it('lets a measured failure outrank an unmeasured path', () => {
    const check = judgeKeptTracked([
      seen({ path: '.void/config.json', ignored: undefined }),
      seen({ path: '.void/hooks', ignored: true, rule: '.gitignore:1:.void/*' }),
    ]);

    expect(check.status).toBe('fail');
  });
});
