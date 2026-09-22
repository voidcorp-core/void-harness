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
  ...overrides,
});

describe('fingerprintOf', () => {
  it('holds one digest per shared part and no content', () => {
    const fingerprint = fingerprintOf(reading());
    expect(Object.keys(fingerprint.digests).sort()).toEqual([...SHARED_STATE_PARTS].sort());
    for (const digest of Object.values(fingerprint.digests)) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fingerprint)).not.toContain('example.test');
  });

  it('is stable for the same state', () => {
    expect(fingerprintOf(reading())).toEqual(fingerprintOf(reading()));
  });

  it('ignores the branch settings every worker writes when it pushes', () => {
    const pushed = reading({
      config: `${reading().config}branch.work/dev-1.remote=origin\nbranch.work/dev-1.merge=refs/heads/work/dev-1\n`,
    });
    expect(changedParts(fingerprintOf(reading()), fingerprintOf(pushed))).toEqual([]);
  });
});

describe('changedParts', () => {
  it.each([
    ['config', { config: `${reading().config}core.hooksPath=/tmp/elsewhere\n` }],
    ['stash', { stash: 'bbbbbbbb\n' }],
    ['tags', { tags: '' }],
    ['notes', { notes: 'cccccccc refs/notes/commits\n' }],
    ['remotes', { remotes: '' }],
  ] as const)('names a change to the %s', (part, overrides) => {
    expect(changedParts(fingerprintOf(reading()), fingerprintOf(reading(overrides)))).toEqual([part]);
  });
});

describe('admitFingerprint', () => {
  it('admits a recorded fingerprint and refuses anything else', () => {
    const recorded = JSON.parse(JSON.stringify(fingerprintOf(reading()))) as unknown;
    expect(admitFingerprint(recorded)).toEqual({ ok: true, value: fingerprintOf(reading()) });
    const { digests } = fingerprintOf(reading());
    const truncated = { schemaVersion: 1, digests: { ...digests, stash: 'abc' } };
    expect(admitFingerprint(truncated)).toMatchObject({ ok: false });
    expect(admitFingerprint({ schemaVersion: 1, digests: { ...digests, extra: digests.tags } })).toMatchObject({
      ok: false,
    });
  });
});
