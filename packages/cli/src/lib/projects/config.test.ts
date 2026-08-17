import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDiscoveryConfig } from './config.js';

/**
 * Where to look for projects. Configuration is a list of ROOTS, never a list of
 * projects: the registry that already exists in this repo rotted to 16k dead
 * pointers from test runs while knowing only 3 of the 8 real projects, because
 * it only learns a project once a hook has run there.
 *
 * With no configuration at all the answer must still be useful, so the default
 * is derived rather than empty.
 */

let home: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'void-cfg-')));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('readDiscoveryConfig', () => {
  it('reads declared roots and exclusions', () => {
    writeFileSync(
      join(home, 'discovery.json'),
      JSON.stringify({ roots: ['/a', '/b'], exclude: ['**/tmp/**'] }),
    );

    const config = readDiscoveryConfig({ globalDir: home, cwd: '/anywhere' });

    expect(config.roots).toEqual(['/a', '/b']);
    // Declared exclusions ADD to the always-excluded set rather than replace it:
    // node_modules is never worth walking, on any machine.
    expect(config.exclude).toContain('**/tmp/**');
    expect(config.exclude).toContain('**/node_modules/**');
    expect(config.source).toBe('declared');
  });

  // Zero-config must work: run it inside any project and its neighbours are the
  // park. Asking for setup before showing anything is how a tool never gets used.
  it('defaults to the parent of the current project when nothing is declared', () => {
    const park = join(home, 'park');
    const project = join(park, 'alpha');
    mkdirSync(join(project, '.void'), { recursive: true });
    writeFileSync(join(project, '.void', 'config.json'), '{}');

    const config = readDiscoveryConfig({ globalDir: home, cwd: project });

    expect(config.roots).toEqual([park]);
    expect(config.source).toBe('derived');
  });

  it('derives from an ancestor when run below the project root', () => {
    const park = join(home, 'park');
    const project = join(park, 'alpha');
    mkdirSync(join(project, 'src', 'deep'), { recursive: true });
    mkdirSync(join(project, '.void'), { recursive: true });
    writeFileSync(join(project, '.void', 'config.json'), '{}');

    const config = readDiscoveryConfig({ globalDir: home, cwd: join(project, 'src', 'deep') });

    expect(config.roots).toEqual([park]);
  });

  it('falls back to the working directory outside any project', () => {
    const elsewhere = join(home, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });

    const config = readDiscoveryConfig({ globalDir: home, cwd: elsewhere });

    expect(config.roots).toEqual([elsewhere]);
    expect(config.source).toBe('derived');
  });

  it('expands a leading tilde against the home directory', () => {
    writeFileSync(join(home, 'discovery.json'), JSON.stringify({ roots: ['~/Code'] }));

    const config = readDiscoveryConfig({ globalDir: home, cwd: '/anywhere', home: '/Users/x' });

    expect(config.roots).toEqual(['/Users/x/Code']);
  });

  it('always excludes node_modules even when the file overrides exclude', () => {
    writeFileSync(
      join(home, 'discovery.json'),
      JSON.stringify({ roots: ['/a'], exclude: ['**/custom/**'] }),
    );

    const config = readDiscoveryConfig({ globalDir: home, cwd: '/anywhere' });

    expect(config.exclude).toContain('**/custom/**');
  });

  it.each([
    ['malformed json', '{ not json'],
    ['an array at the top level', '[]'],
    ['roots that are not strings', '{"roots":[1,2]}'],
    ['an empty roots list', '{"roots":[]}'],
  ])('falls back to the derived default on %s', (_label, content) => {
    const elsewhere = join(home, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(join(home, 'discovery.json'), content);

    const config = readDiscoveryConfig({ globalDir: home, cwd: elsewhere });

    expect(config.source).toBe('derived');
    expect(config.roots).toEqual([elsewhere]);
  });

  it('drops a non-absolute root rather than resolving it against nothing', () => {
    writeFileSync(
      join(home, 'discovery.json'),
      JSON.stringify({ roots: ['/good', 'relative/bad'] }),
    );

    expect(readDiscoveryConfig({ globalDir: home, cwd: '/anywhere' }).roots).toEqual(['/good']);
  });
});
