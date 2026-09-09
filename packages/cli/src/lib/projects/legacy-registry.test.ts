import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { retireLegacyProjectRegistry } from './legacy-registry.js';

const scratchDirectories: string[] = [];

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'void-legacy-registry-'));
  scratchDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('retireLegacyProjectRegistry', () => {
  it('unlinks only a bounded number of regular legacy pointers', async () => {
    const globalDir = scratch();
    const registry = join(globalDir, 'projects');
    mkdirSync(join(registry, 'nested'), { recursive: true });
    writeFileSync(join(registry, 'a.path'), '/project/a\n');
    writeFileSync(join(registry, 'b.path'), '/project/b\n');
    writeFileSync(join(registry, 'keep.txt'), 'project-owned\n');

    const first = await retireLegacyProjectRegistry({ globalDir, limit: 1 });

    expect(first).toEqual({ found: 2, removed: 1, remaining: 1 });
    expect(existsSync(join(registry, 'keep.txt'))).toBe(true);
    expect(existsSync(join(registry, 'nested'))).toBe(true);

    const second = await retireLegacyProjectRegistry({ globalDir, limit: 1 });
    const third = await retireLegacyProjectRegistry({ globalDir, limit: 1 });

    expect(second).toEqual({ found: 1, removed: 1, remaining: 0 });
    expect(third).toEqual({ found: 0, removed: 0, remaining: 0 });
  });

  it('reports a dry run without removing a pointer', async () => {
    const globalDir = scratch();
    const registry = join(globalDir, 'projects');
    mkdirSync(registry);
    writeFileSync(join(registry, 'one.path'), '/project/one\n');

    const result = await retireLegacyProjectRegistry({
      globalDir,
      limit: 10,
      dryRun: true,
    });

    expect(result).toEqual({ found: 1, removed: 0, remaining: 1 });
    expect(existsSync(join(registry, 'one.path'))).toBe(true);
  });

  it('refuses a projects entry that is not a real directory', async () => {
    const globalDir = scratch();
    writeFileSync(join(globalDir, 'projects'), 'not a directory\n');

    await expect(
      retireLegacyProjectRegistry({ globalDir, limit: 10 }),
    ).rejects.toThrow('LEGACY_PROJECT_REGISTRY_UNSAFE');
  });
});
