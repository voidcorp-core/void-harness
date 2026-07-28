import { describe, expect, it } from 'vitest';
import { compareFreshness } from './compare.js';

describe('compareFreshness', () => {
  it('reports behind when the published version is newer', () => {
    expect(compareFreshness('0.17.0', '2.1.0')).toEqual({
      verdict: 'behind',
      installed: '0.17.0',
      latest: '2.1.0',
    });
  });

  it('reports up-to-date on an exact match', () => {
    expect(compareFreshness('2.1.0', '2.1.0')).toEqual({
      verdict: 'up-to-date',
      installed: '2.1.0',
      latest: '2.1.0',
    });
  });

  it('reports ahead when the local build leads the registry', () => {
    // A maintainer running from source, or a pinned downgrade of the registry tag.
    expect(compareFreshness('2.2.0', '2.1.0')).toEqual({
      verdict: 'ahead',
      installed: '2.2.0',
      latest: '2.1.0',
    });
  });

  it('tolerates a leading v and surrounding whitespace on either side', () => {
    expect(compareFreshness(' v2.1.0 ', 'v2.1.0')).toMatchObject({ verdict: 'up-to-date' });
  });

  it.each([
    ['1.9.0', '1.10.0', 'behind'],
    ['1.10.0', '1.9.0', 'ahead'],
    ['2.0.0', '10.0.0', 'behind'],
  ] as const)('compares %s against %s numerically, not lexically', (installed, latest, verdict) => {
    expect(compareFreshness(installed, latest)).toMatchObject({ verdict });
  });

  it('never claims up-to-date when the installed version is unknown', () => {
    const result = compareFreshness('unknown', '2.1.0');
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/installed version/i);
  });

  it.each(['', '   '])('never claims up-to-date on an empty installed version (%j)', (installed) => {
    expect(compareFreshness(installed, '2.1.0')).toMatchObject({ verdict: 'unknown' });
  });

  it('degrades to unknown rather than guessing on a prerelease', () => {
    // Comparing 2.2.0-rc.1 numerically would silently read as 2.2.0 and could
    // announce a false up-to-date. Refusing to compare is the honest answer.
    const result = compareFreshness('2.2.0-rc.1', '2.2.0');
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/prerelease|not comparable/i);
  });

  it.each(['2.1', '2', 'latest', '2.1.0.4', 'main'])(
    'degrades to unknown on the non-semver version %j',
    (installed) => {
      expect(compareFreshness(installed, '2.1.0')).toMatchObject({ verdict: 'unknown' });
    },
  );

  it('degrades to unknown when the registry version itself is unusable', () => {
    const result = compareFreshness('2.1.0', 'not-a-version');
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/published version/i);
  });

  it('carries a reason on every unknown verdict so a caller can explain itself', () => {
    const unknowns = [
      compareFreshness('unknown', '2.1.0'),
      compareFreshness('2.1.0', ''),
      compareFreshness('2.2.0-rc.1', '2.2.0'),
    ];
    for (const result of unknowns) {
      expect(result.verdict).toBe('unknown');
      expect(result.reason).toBeTruthy();
    }
  });

  it('is a pure function of its two inputs', () => {
    const once = compareFreshness('0.17.0', '2.1.0');
    const twice = compareFreshness('0.17.0', '2.1.0');
    expect(once).toEqual(twice);
  });
});
