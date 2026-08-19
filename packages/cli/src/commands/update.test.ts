import { describe, expect, it } from 'vitest';
import type { InstallReceipt } from '../lib/receipts.js';
import { localInitArgs, ownedFromManifestPaths, updateModeFor, updateRouteFor } from './update.js';

const receipt = (source: InstallReceipt['source']): InstallReceipt => ({
  schemaVersion: 1,
  version: '2.0.2',
  source,
  runtimes: ['codex'],
  files: [],
});

describe('update routing', () => {
  it('keeps local receipts offline and marketplace receipts on the remote adapter', () => {
    expect(updateModeFor(receipt('local'))).toBe('local');
    expect(updateModeFor(receipt('marketplace'))).toBe('marketplace');
    expect(updateModeFor(undefined)).toBe('marketplace');
  });
});

describe('localInitArgs', () => {
  it('carries the recorded runtimes and the selected packs', () => {
    const args = localInitArgs(receipt('local'), ['monorepo', 'react'], { force: false });

    expect(args).toContain('--no-interactive');
    expect(args).toContain('--replace-packs');
    expect(args.join(' ')).toContain('--runtime codex');
    expect(args.join(' ')).toContain('--pack monorepo');
    expect(args.join(' ')).toContain('--pack react');
  });

  it('does not force by default', () => {
    expect(localInitArgs(receipt('local'), [], { force: false })).not.toContain('--force');
  });

  /**
   * Reported from a real consumer project on 2.6.0. `init` refuses to clobber a
   * managed file it cannot prove it wrote and says "preserve it or re-run with
   * --force" — but `update` never parsed the flag nor passed it on, so the
   * remedy the tool printed could not be applied through the command that
   * printed it. An instruction that cannot be followed is worse than none.
   */
  it('forwards --force so the remedy it prints can actually be applied', () => {
    expect(localInitArgs(receipt('local'), [], { force: true })).toContain('--force');
  });
});

// The receipt is observed state, so it is gitignored and absent from every
// clone. Reading the route from it alone made `update` fall through to the
// marketplace branch on a colleague's fresh checkout: it pulled a plugin cache,
// bumped the pins, materialised nothing, and reported success. The install
// manifest is the committed half of the same fact and is always there.
describe('updateRouteFor', () => {
  it('follows the receipt when there is one', () => {
    expect(updateRouteFor(receipt('local'), true)).toBe('local');
    expect(updateRouteFor(receipt('marketplace'), true)).toBe('marketplace');
  });

  // A missing receipt used to end the command with two commands to type, one of
  // them `--force`. It is the common case, not an edge: the receipt is
  // machine-local, so EVERY fresh clone arrives without one. The committed
  // manifest names the paths the harness owns, which is the only thing the
  // update needs from it -- the contents come from the version being installed.
  // Reading it is not guessing.
  it('rehydrates ownership from the committed manifest instead of stopping', () => {
    expect(updateRouteFor(undefined, true)).toBe('local-rehydrate');
  });

  it('is a marketplace install when neither is there', () => {
    expect(updateRouteFor(undefined, false)).toBe('marketplace');
  });
})

// Rehydration takes the paths from the committed manifest and the CONTENT from
// disk, never the manifest's hashes: those describe the version that wrote it,
// and the point is to reclaim ownership of what is there now so the new version
// can overwrite it. Hashing the manifest's own values would fail every comparison
// and reproduce the conflict this removes.
describe('ownedFromManifestPaths', () => {
  it('claims the paths the manifest names, with the content found on disk', () => {
    const owned = ownedFromManifestPaths(
      ['.void/hooks/_void-hook.mjs', '.claude/skills/tdd/SKILL.md'],
      (path) => ({ sha256: `sha-of-${path}`, mode: 0o644 }),
    );
    expect(owned).toEqual([
      { path: '.void/hooks/_void-hook.mjs', sha256: 'sha-of-.void/hooks/_void-hook.mjs', mode: 0o644 },
      { path: '.claude/skills/tdd/SKILL.md', sha256: 'sha-of-.claude/skills/tdd/SKILL.md', mode: 0o644 },
    ]);
  });

  it('drops a path the manifest names and the disk no longer has', () => {
    const owned = ownedFromManifestPaths(
      ['.void/hooks/_void-hook.mjs', '.claude/skills/retired/SKILL.md'],
      (path) => (path.includes('retired') ? undefined : { sha256: 'x', mode: 0o644 }),
    );
    expect(owned.map((file) => file.path)).toEqual(['.void/hooks/_void-hook.mjs']);
  });

  it('claims nothing from an empty manifest rather than inventing ownership', () => {
    expect(ownedFromManifestPaths([], () => ({ sha256: 'x', mode: 0o644 }))).toEqual([]);
  });
});
