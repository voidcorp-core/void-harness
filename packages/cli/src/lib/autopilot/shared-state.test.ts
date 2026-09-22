import { describe, expect, it } from 'vitest';
import {
  admitFingerprint,
  changedParts,
  fingerprintOf,
  SHARED_STATE_PARTS,
  type SharedStateReading,
} from './shared-state.js';

// A worktree isolates the working tree, the index and HEAD, and nothing else:
// the local config, the stash, tags, notes and remotes are one set shared by
// every worker of the repository. A unit that wrote there changed what its
// neighbours run against, so the loop refuses to publish it (DEV-858). The
// fingerprint is digests only: the config can hold a credential in a remote URL,
// and a record of it would carry that credential to disk.

const reading = (overrides: Partial<SharedStateReading> = {}): SharedStateReading => ({
  config: 'core.bare=false\nremote.origin.url=https://example.test/r.git\n',
  stash: '',
  tags: 'aaaaaaaa refs/tags/v1.0.0\n',
  notes: '',
  remotes: 'origin\thttps://example.test/r.git (fetch)\norigin\thttps://example.test/r.git (push)\n',
  bases: 'dddddddd refs/heads/develop\n',
  replace: '',
  hooks: 'eeeeeeee pre-commit.sample\n',
  info: 'ffffffff exclude\n',
  ...overrides,
});

const BRANCH = 'work/dev-1';

describe('fingerprintOf', () => {
  it('holds one digest per shared part and no content', () => {
    const fingerprint = fingerprintOf(reading(), BRANCH);
    expect(Object.keys(fingerprint.digests).sort()).toEqual([...SHARED_STATE_PARTS].sort());
    for (const digest of Object.values(fingerprint.digests)) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fingerprint)).not.toContain('example.test');
  });

  it('is stable for the same state', () => {
    expect(fingerprintOf(reading(), BRANCH)).toEqual(fingerprintOf(reading(), BRANCH));
  });

  it("counts every branch setting but the upstream of the ticket's own branch", () => {
    const changed = (line: string) => {
      const config = `${reading().config}${line}\n`;
      return changedParts(fingerprintOf(reading(), BRANCH), fingerprintOf(reading({ config }), BRANCH));
    };
    // What `git branch --set-upstream-to` on develop writes: the next pull of
    // develop merges the worker's branch into it (DEV-858).
    expect(changed('branch.develop.remote=.')).toEqual(['config']);
    expect(changed('branch.develop.merge=refs/heads/work/dev-1')).toEqual(['config']);
    expect(changed('branch.work/dev-1.pushremote=mirror')).toEqual(['config']);
    expect(changed('branch.work/dev-2.remote=origin')).toEqual(['config']);
    expect(changed('branch.autosetuprebase=always')).toEqual(['config']);
  });

  it('records which branch it left out, so the check runs on the same reading', () => {
    expect(fingerprintOf(reading(), BRANCH).branch).toBe(BRANCH);
  });

  it('ignores the branch settings every worker writes when it pushes', () => {
    const pushed = reading({
      config: `${reading().config}branch.work/dev-1.remote=origin\nbranch.work/dev-1.merge=refs/heads/work/dev-1\n`,
    });
    expect(changedParts(fingerprintOf(reading(), BRANCH), fingerprintOf(pushed, BRANCH))).toEqual([]);
  });
});

describe('changedParts', () => {
  it.each([
    ['config', { config: `${reading().config}core.hooksPath=/tmp/elsewhere\n` }],
    ['stash', { stash: 'bbbbbbbb\n' }],
    ['tags', { tags: '' }],
    ['notes', { notes: 'cccccccc refs/notes/commits\n' }],
    ['remotes', { remotes: '' }],
    ['bases', { bases: '99999999 refs/heads/develop\n' }],
    ['replace', { replace: '12121212 refs/replace/34343434\n' }],
    ['hooks', { hooks: 'eeeeeeee pre-commit.sample\n56565656 post-checkout\n' }],
    ['info', { info: '78787878 exclude\n' }],
  ] as const)('names a change to the %s', (part, overrides) => {
    expect(changedParts(fingerprintOf(reading(), BRANCH), fingerprintOf(reading(overrides), BRANCH))).toEqual([part]);
  });
});

describe('admitFingerprint', () => {
  it('admits a recorded fingerprint and refuses anything else', () => {
    const recorded = JSON.parse(JSON.stringify(fingerprintOf(reading(), BRANCH))) as unknown;
    expect(admitFingerprint(recorded)).toEqual({ ok: true, value: fingerprintOf(reading(), BRANCH) });
    const { digests } = fingerprintOf(reading(), BRANCH);
    const truncated = { schemaVersion: 2, branch: BRANCH, digests: { ...digests, stash: 'abc' } };
    expect(admitFingerprint(truncated)).toMatchObject({ ok: false });
    expect(
      admitFingerprint({ schemaVersion: 2, branch: BRANCH, digests: { ...digests, extra: digests.tags } }),
    ).toMatchObject({ ok: false });
    // A record from before the base refs, hooks and info were read proves less.
    const { bases: _b, replace: _r, hooks: _h, info: _i, ...older } = digests;
    expect(admitFingerprint({ schemaVersion: 1, digests: older })).toMatchObject({ ok: false });
    expect(admitFingerprint({ schemaVersion: 2, digests })).toMatchObject({ ok: false });
  });
});
