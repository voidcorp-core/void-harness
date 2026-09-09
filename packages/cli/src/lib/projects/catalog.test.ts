import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverConfiguredProjects } from './catalog.js';

const scratchDirectories: string[] = [];

function scratch(prefix: string): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratchDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('discoverConfiguredProjects', () => {
  it('gives every cross-project reader the configured marker scan', () => {
    const globalDir = scratch('void-project-catalog-global-');
    const park = scratch('void-project-catalog-park-');
    const project = join(park, 'alpha');
    mkdirSync(join(project, '.void'), { recursive: true });
    writeFileSync(join(project, '.void', 'config.json'), '{}\n');
    writeFileSync(join(globalDir, 'discovery.json'), JSON.stringify({ roots: [park] }));

    const discovered = discoverConfiguredProjects({ globalDir, cwd: project });

    expect(discovered.projects.map((entry) => entry.path)).toEqual([project]);
    expect(discovered.roots).toEqual([park]);
    expect(discovered.rootsSource).toBe('declared');
  });
});
