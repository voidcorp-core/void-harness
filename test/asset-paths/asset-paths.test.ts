import { describe, expect, it } from 'vitest';
import { deadPaths, harnessPaths } from '../../scripts/check-asset-paths.mjs';

// Skills are prose an agent reads, and they name paths in that prose. When the
// layout moves, every one of those sentences is wrong and nothing says so:
// moving the active pointer left four assets still routing to `plans/ACTIVE.md`,
// found by reading rather than by the build. On its first run this check found
// four more that reading had missed.
describe('harnessPaths', () => {
  it('reads a path the harness owns the meaning of', () => {
    expect(harnessPaths('read `.void/active.md` first')).toEqual(['.void/active.md']);
  });

  // An illustration is the consuming project's business, and asserting on it
  // would make the check wrong rather than strict.
  it('ignores a path that belongs to the consuming project', () => {
    expect(harnessPaths('any change to `apps/checkout/src/` triggers strict mode')).toEqual([]);
  });

  it('ignores prose that merely mentions a name, unquoted', () => {
    expect(harnessPaths('the old plans/ACTIVE.md contract, since moved')).toEqual([]);
  });

  it('reports each path once, sorted', () => {
    expect(harnessPaths('`docs/plans/a.md` and `docs/specs/b.md` and `docs/plans/a.md`'))
      .toEqual(['docs/plans/a.md', 'docs/specs/b.md']);
  });
});

describe('deadPaths', () => {
  const exists = (path: string): boolean => ['.void/active.md', 'docs/specs'].includes(path);

  it('reports a path that resolves to nothing', () => {
    expect(deadPaths(['.void/active.md', 'plans/ACTIVE.md'], exists)).toEqual(['plans/ACTIVE.md']);
  });

  // A skill saying specs live in `docs/specs/` is right whether or not one has
  // been written yet, so a location is checked as a directory.
  it('checks a trailing slash as a location, not a file', () => {
    expect(deadPaths(['docs/specs/'], exists)).toEqual([]);
  });

  // The same for a filename pattern: it describes where something will be
  // written, and demanding it already exist would fail on an empty project.
  it('checks a placeholder as the directory that holds it', () => {
    expect(deadPaths(['docs/specs/YYYY-MM-DD-<topic>.md'], exists)).toEqual([]);
    expect(deadPaths(['docs/absent/YYYY-MM-DD-<topic>.md'], exists)).toEqual([
      'docs/absent/YYYY-MM-DD-<topic>.md',
    ]);
  });

  it('says nothing when every path resolves', () => {
    expect(deadPaths(['.void/active.md'], exists)).toEqual([]);
  });
});
