import { describe, expect, it } from 'vitest';
import { type BaseObservation, selectBase } from './base-selection.js';

const SHA_MAIN = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const SHA_DEV = 'c92da52973cebd5e038d6f7879821da5a039b069';

function obs(over: Partial<BaseObservation> = {}): BaseObservation {
  return {
    requested: 'auto',
    branches: [
      { name: 'main', headSha: SHA_MAIN },
      { name: 'feature/x', headSha: SHA_DEV },
    ],
    ...over,
  };
}

describe('selectBase', () => {
  it('prefers develop under auto because that is where integration lands when it exists', () => {
    const selection = selectBase(
      obs({ branches: [{ name: 'main', headSha: SHA_MAIN }, { name: 'develop', headSha: SHA_DEV }] }),
    );

    expect(selection).toEqual({ kind: 'selected', branch: 'develop', sha: SHA_DEV });
  });

  it('falls back to main under auto when develop does not exist', () => {
    expect(selectBase(obs())).toEqual({ kind: 'selected', branch: 'main', sha: SHA_MAIN });
  });

  it('never invents develop from a lookalike branch name', () => {
    const selection = selectBase(
      obs({ branches: [{ name: 'main', headSha: SHA_MAIN }, { name: 'development', headSha: SHA_DEV }] }),
    );

    expect(selection).toEqual({ kind: 'selected', branch: 'main', sha: SHA_MAIN });
  });

  it('blocks under auto when neither develop nor main exists', () => {
    const selection = selectBase(obs({ branches: [{ name: 'trunk', headSha: SHA_MAIN }] }));

    expect(selection.kind).toBe('blocked');
    expect(selection).toMatchObject({ reason: 'no-conventional-base' });
  });

  it('selects an explicitly requested branch that exists', () => {
    const selection = selectBase(obs({ requested: 'feature/x' }));

    expect(selection).toEqual({ kind: 'selected', branch: 'feature/x', sha: SHA_DEV });
  });

  it('blocks on an explicit base that does not exist instead of falling back', () => {
    const selection = selectBase(obs({ requested: 'release/9' }));

    expect(selection.kind).toBe('blocked');
    expect(selection).toMatchObject({ reason: 'requested-base-missing' });
    expect((selection as { detail: string }).detail).toContain('release/9');
  });

  it('blocks when the chosen base has no resolved head because a lease pins a commit', () => {
    const selection = selectBase(obs({ branches: [{ name: 'main', headSha: '' }] }));

    expect(selection.kind).toBe('blocked');
    expect(selection).toMatchObject({ reason: 'unresolved-head' });
  });

  it('blocks when the head is not a full commit id', () => {
    const selection = selectBase(obs({ branches: [{ name: 'main', headSha: '2b0e24d' }] }));

    expect(selection).toMatchObject({ kind: 'blocked', reason: 'unresolved-head' });
  });

  it('blocks on an empty observation rather than assuming an empty repository is main', () => {
    expect(selectBase(obs({ branches: [] }))).toMatchObject({ kind: 'blocked' });
  });

  it('blocks on a duplicated branch name because the observation contradicts itself', () => {
    const selection = selectBase(
      obs({ branches: [{ name: 'main', headSha: SHA_MAIN }, { name: 'main', headSha: SHA_DEV }] }),
    );

    expect(selection).toMatchObject({ kind: 'blocked', reason: 'contradictory-observation' });
  });

  it('blocks on a malformed branch entry rather than skipping it silently', () => {
    const selection = selectBase(
      obs({ branches: [{ name: '', headSha: SHA_MAIN }, { name: 'main', headSha: SHA_MAIN }] }),
    );

    expect(selection).toMatchObject({ kind: 'blocked', reason: 'contradictory-observation' });
  });

  it('blocks on an empty requested base because auto is the only implicit value', () => {
    expect(selectBase(obs({ requested: '' }))).toMatchObject({ kind: 'blocked' });
  });
});
