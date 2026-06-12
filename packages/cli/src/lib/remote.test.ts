import { describe, expect, it } from 'vitest';
import { pinnedCoordinates } from './remote.js';

// The catalog (void-plugins) pins every external source with ref + sha and
// carries no version field: the remote version of truth is the plugin.json
// of the product repo, read at the pinned commit. These tests freeze the
// mapping from a catalog source entry to the gh fetch coordinates.
describe('pinnedCoordinates', () => {
  it('github source: repo at sha, plugin.json at repo root', () => {
    expect(
      pinnedCoordinates({ source: 'github', repo: 'voidcorp-core/forge', ref: 'main', sha: 'a'.repeat(40) }),
    ).toEqual({ repo: 'voidcorp-core/forge', basePath: '', ref: 'a'.repeat(40) });
  });

  it('git-subdir source: repo parsed from url, basePath from path', () => {
    expect(
      pinnedCoordinates({
        source: 'git-subdir',
        url: 'https://github.com/voidcorp-core/void-harness.git',
        path: 'packages/core',
        sha: 'b'.repeat(40),
      }),
    ).toEqual({ repo: 'voidcorp-core/void-harness', basePath: 'packages/core/', ref: 'b'.repeat(40) });
  });

  it('falls back to ref when sha is absent, HEAD when both are', () => {
    expect(pinnedCoordinates({ source: 'github', repo: 'o/r', ref: 'v1.2.3' })?.ref).toBe('v1.2.3');
    expect(pinnedCoordinates({ source: 'github', repo: 'o/r' })?.ref).toBe('HEAD');
  });

  it('returns undefined for local string sources (no remote pin)', () => {
    expect(pinnedCoordinates('./packages/core')).toBeUndefined();
    expect(pinnedCoordinates(undefined)).toBeUndefined();
  });
});
