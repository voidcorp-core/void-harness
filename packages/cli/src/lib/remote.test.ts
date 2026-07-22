import { describe, expect, it } from 'vitest';
import { pinnedCoordinates, selectCorePlugin } from './remote.js';

describe('selectCorePlugin', () => {
  it('selects the harness entry by name, never plugins[0]', () => {
    // Regression: the first catalog entry is an unrelated, version-less product.
    const plugins = [
      { name: 'forge', source: 'github' as const },
      { name: 'harness', source: { source: 'github', repo: 'voidcorp-core/void-plugins', sha: 'a'.repeat(40) } },
    ];
    expect(selectCorePlugin(plugins)?.name).toBe('harness');
  });

  it('returns undefined when no harness entry exists', () => {
    expect(selectCorePlugin([{ name: 'forge', source: 'github' as const }])).toBeUndefined();
  });
});

// Coordinates map a catalog source entry to the gh fetch location. A self-hosted
// local source resolves into the marketplace repo itself at HEAD; external git
// sources pin via sha/ref. These freeze the mapping.
const MKT = 'voidcorp-core/void-harness';
describe('pinnedCoordinates', () => {
  it('local source: resolves into the marketplace repo at HEAD (self-hosted)', () => {
    expect(pinnedCoordinates('./packages/core', MKT)).toEqual({
      repo: MKT,
      basePath: 'packages/core/',
      ref: 'HEAD',
    });
    // trailing slash tolerated, and the marketplace root maps to an empty basePath
    expect(pinnedCoordinates('./packages/packs/pack-nextjs/', MKT)).toEqual({
      repo: MKT,
      basePath: 'packages/packs/pack-nextjs/',
      ref: 'HEAD',
    });
  });

  it('github source: repo at sha, plugin.json at repo root', () => {
    expect(
      pinnedCoordinates({ source: 'github', repo: 'voidcorp-core/forge', ref: 'main', sha: 'a'.repeat(40) }, MKT),
    ).toEqual({ repo: 'voidcorp-core/forge', basePath: '', ref: 'a'.repeat(40) });
  });

  it('git-subdir source: repo parsed from url, basePath from path', () => {
    expect(
      pinnedCoordinates(
        {
          source: 'git-subdir',
          url: 'https://github.com/voidcorp-core/void-harness.git',
          path: 'packages/core',
          sha: 'b'.repeat(40),
        },
        MKT,
      ),
    ).toEqual({ repo: 'voidcorp-core/void-harness', basePath: 'packages/core/', ref: 'b'.repeat(40) });
  });

  it('falls back to ref when sha is absent, HEAD when both are', () => {
    expect(pinnedCoordinates({ source: 'github', repo: 'o/r', ref: 'v1.2.3' }, MKT)?.ref).toBe('v1.2.3');
    expect(pinnedCoordinates({ source: 'github', repo: 'o/r' }, MKT)?.ref).toBe('HEAD');
  });

  it('returns undefined when there is no source at all', () => {
    expect(pinnedCoordinates(undefined, MKT)).toBeUndefined();
  });
});
