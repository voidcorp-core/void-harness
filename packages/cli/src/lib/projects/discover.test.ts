import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverProjects } from './discover.js';

/**
 * A project is any directory carrying `.void/config.json`. No registry: a
 * registry is mutable global state that rots — moved paths, deleted repos,
 * entries nobody remembers to add. The marker cannot go stale.
 *
 * The view reads eight projects at once, so no single unreadable directory may
 * take the whole answer down.
 */

let root: string;

function project(name: string, opts: { config?: boolean } = {}): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.void'), { recursive: true });
  if (opts.config !== false) {
    writeFileSync(join(dir, '.void', 'config.json'), JSON.stringify({ packs: {} }));
  }
  return dir;
}

beforeEach(() => {
  // Resolved on purpose: discovery reports PHYSICAL paths, because that is what
  // makes a symlink cycle terminate and a project's identity stable. On macOS
  // the temp dir sits behind /var -> /private/var, so an unresolved root here
  // would test the wrong string.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'void-discover-')));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('discoverProjects', () => {
  it('finds a project by its marker, with no registration', () => {
    project('alpha');

    const found = discoverProjects({ roots: [root], exclude: [] });

    expect(found.projects.map((p) => p.name)).toEqual(['alpha']);
    expect(found.projects[0]?.path).toBe(join(root, 'alpha'));
  });

  // Already hit in this very repo: `.void/machine/` existed for months while
  // `config.json` did not. A partial .void is not an installed project.
  it('ignores a .void directory without config.json', () => {
    project('partial', { config: false });
    mkdirSync(join(root, 'partial', '.void', 'local'), { recursive: true });

    expect(discoverProjects({ roots: [root], exclude: [] }).projects).toEqual([]);
  });

  it('finds several projects and orders them deterministically', () => {
    project('charlie');
    project('alpha');
    project('bravo');

    const names = discoverProjects({ roots: [root], exclude: [] }).projects.map((p) => p.name);

    expect(names).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('finds a project nested below the root', () => {
    mkdirSync(join(root, 'clients'), { recursive: true });
    project(join('clients', 'delta'));

    expect(discoverProjects({ roots: [root], exclude: [] }).projects).toHaveLength(1);
  });

  it('never walks into node_modules', () => {
    project(join('node_modules', 'some-package'));

    expect(discoverProjects({ roots: [root], exclude: [] }).projects).toEqual([]);
  });

  it('honours an explicit exclusion', () => {
    project('keep');
    project('drop');

    const found = discoverProjects({ roots: [root], exclude: ['**/drop/**'] });

    expect(found.projects.map((p) => p.name)).toEqual(['keep']);
  });

  it('reports a missing root instead of failing', () => {
    project('alpha');
    const absent = join(root, 'does-not-exist');

    const found = discoverProjects({ roots: [root, absent], exclude: [] });

    expect(found.projects).toHaveLength(1);
    expect(found.unreadable.map((u) => u.path)).toEqual([absent]);
  });

  it('returns an empty result rather than throwing when no root is readable', () => {
    const found = discoverProjects({ roots: [join(root, 'nope')], exclude: [] });

    expect(found.projects).toEqual([]);
    expect(found.unreadable).toHaveLength(1);
  });

  // A symlink loop is the one filesystem shape that turns a scan into a hang.
  it('terminates on a symlink cycle', () => {
    project('alpha');
    const loop = join(root, 'loop');
    mkdirSync(loop, { recursive: true });
    symlinkSync(root, join(loop, 'back'), 'dir');

    const found = discoverProjects({ roots: [root], exclude: [] });

    expect(found.projects.map((p) => p.name)).toContain('alpha');
  });

  it('stops at the depth bound rather than walking a whole disk', () => {
    project(join('a', 'b', 'c', 'd', 'e', 'deep'));

    const found = discoverProjects({ roots: [root], exclude: [] }, { maxDepth: 2 });

    expect(found.projects).toEqual([]);
  });

  // The path is the identity: two projects can legitimately share a name.
  it('keeps both projects when two share a name under different paths', () => {
    project(join('one', 'shared'));
    project(join('two', 'shared'));

    const found = discoverProjects({ roots: [root], exclude: [] });

    expect(found.projects).toHaveLength(2);
    expect(new Set(found.projects.map((p) => p.path)).size).toBe(2);
  });

  it('does not report the same project twice when roots overlap', () => {
    project('alpha');

    const found = discoverProjects({ roots: [root, join(root, 'alpha')], exclude: [] });

    expect(found.projects).toHaveLength(1);
  });

  // Found on the real park: two sesame worktrees showed up as separate
  // projects, because a worktree checks out the same `.void/config.json`. A
  // worktree is the same project on another branch, and autopilot creates one
  // per ticket — left alone, a run would fill the view with phantom projects.
  it('does not report a git worktree as its own project', () => {
    const main = project('alpha');
    const wt = join(root, 'alpha-wt', 'feature');
    mkdirSync(join(wt, '.void'), { recursive: true });
    writeFileSync(join(wt, '.void', 'config.json'), JSON.stringify({ packs: {} }));
    writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'feature')}\n`);

    const found = discoverProjects({ roots: [root], exclude: [] });

    expect(found.projects.map((p) => p.name)).toEqual(['alpha']);
  });

  it('still reports a project whose .git is a normal directory', () => {
    const dir = project('alpha');
    mkdirSync(join(dir, '.git'), { recursive: true });

    expect(discoverProjects({ roots: [root], exclude: [] }).projects).toHaveLength(1);
  });

  it('does not descend into a project it already found', () => {
    project('alpha');
    project(join('alpha', 'nested'));

    const found = discoverProjects({ roots: [root], exclude: [] });

    expect(found.projects.map((p) => p.name)).toEqual(['alpha']);
  });
});
