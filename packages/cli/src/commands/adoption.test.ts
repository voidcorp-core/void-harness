import { describe, expect, it } from 'vitest';
import { PRODUCT_IDENTITY } from '@voidcorp/hook-runner';
import {
  githubReleasesUrl,
  githubRepoUrl,
  npmDownloadsUrl,
  parseGithubStars,
  parseNpmDownloads,
  parseReleaseDownloads,
} from './adoption.js';

describe('adoption URLs', () => {
  it('builds the public npm + GitHub endpoints for the harness package/repo', () => {
    const { packageName, repositorySlug } = PRODUCT_IDENTITY;
    expect(npmDownloadsUrl()).toBe(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
    expect(githubRepoUrl()).toBe(`https://api.github.com/repos/${repositorySlug}`);
    expect(githubReleasesUrl()).toBe(`https://api.github.com/repos/${repositorySlug}/releases`);
  });
});

describe('parseNpmDownloads', () => {
  it('reads the download count', () => {
    expect(parseNpmDownloads({ downloads: 1234, package: 'examplepkg' })).toBe(1234);
  });
  it('returns undefined on a 404-shaped / malformed response (no false 0)', () => {
    expect(parseNpmDownloads({ error: 'not found' })).toBeUndefined();
    expect(parseNpmDownloads(undefined)).toBeUndefined();
    expect(parseNpmDownloads('nope')).toBeUndefined();
  });
});

describe('parseGithubStars', () => {
  it('reads stargazers_count, undefined when absent', () => {
    expect(parseGithubStars({ stargazers_count: 42 })).toBe(42);
    expect(parseGithubStars({ message: 'Not Found' })).toBeUndefined();
  });
});

describe('parseReleaseDownloads', () => {
  it('sums asset download_count across releases', () => {
    const releases = [
      { assets: [{ download_count: 10 }, { download_count: 5 }] },
      { assets: [{ download_count: 3 }] },
    ];
    expect(parseReleaseDownloads(releases)).toBe(18);
  });
  it('treats an empty release list as a real 0, and a non-array as undefined', () => {
    expect(parseReleaseDownloads([])).toBe(0);
    expect(parseReleaseDownloads({ message: 'Not Found' })).toBeUndefined();
  });
  it('ignores malformed assets without throwing', () => {
    expect(parseReleaseDownloads([{ assets: [{ download_count: 'x' }, {}, { download_count: 7 }] }])).toBe(7);
  });
});
