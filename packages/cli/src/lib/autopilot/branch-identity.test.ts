import { describe, expect, it } from 'vitest';
import { sameBranch } from './branch-identity.js';

// The loop refuses a merge into the branch that deploys unless this answers
// `different`, so every case below that is not two plainly distinct branches
// must come back `same` or `undecidable`.
describe('sameBranch', () => {
  // `deployBranch` is typed by a person and validated by nothing, so every one
  // of these spellings used to read as "not main".
  it('reads every spelling of one branch as that branch, on both sides', () => {
    const forms = [
      'main',
      'origin/main',
      'refs/heads/main',
      'refs/remotes/origin/main',
      'remotes/origin/main',
      '  main  ',
      'Main',
    ];
    for (const target of forms) {
      for (const deployBranch of forms) {
        expect(sameBranch(target, deployBranch), `${target} vs ${deployBranch}`).toBe('same');
      }
    }
  });

  // A parser that cannot say "I do not recognise this" turns every unknown
  // shape into a token matching nothing, which is a merge into production. The
  // rules are git's own, read from `git check-ref-format`.
  it('cannot decide on a name git would not accept as a branch', () => {
    for (const target of [
      '', '   ', 'b'.repeat(40), 'HEAD', 'main^', 'main~1', 'main:x', 'main@{0}',
      'main.lock', 'refs/tags/main', 'refs/pull/12/merge', '.main', 'main..x', '/main',
      'main/', 'main//x', 'main.', 'main?', 'main*', 'main[', 'main\\x', '@', 'ma in',
    ]) {
      expect(sameBranch(target, 'main'), target).toBe('undecidable');
    }
    expect(sameBranch('main', undefined)).toBe('undecidable');
  });

  // The emptiness check once ran on the raw string, so a prefix that normalises
  // away passed it and then matched nothing.
  it('judges a deploying branch after normalising it, not before', () => {
    for (const deployBranch of ['refs/heads/', 'refs/remotes/', 'remotes/', 'origin/']) {
      expect(sameBranch('main', deployBranch), deployBranch).toBe('undecidable');
    }
  });

  it('tells two distinct branches apart, whatever the remote prefix', () => {
    expect(sameBranch('develop', 'main')).toBe('different');
    expect(sameBranch('develop', 'origin/main')).toBe('different');
  });
});
