import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nativeSpecialistFixture,
  specialistRelativePaths,
} from './native-specialists.js';

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'void-native-specialists-'));
  roots.push(root);
  return root;
}

function seedRuntime(root: string, runtime: 'claude' | 'codex'): void {
  for (const path of specialistRelativePaths(runtime)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${runtime}:${path}\n`);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native specialist fixture', () => {
  it.each(['claude', 'codex'] as const)(
    'loads only the three installed %s team specialists',
    (runtime) => {
      const root = scratch();
      seedRuntime(root, runtime);
      const fixture = nativeSpecialistFixture(root, runtime);

      expect(Object.keys(fixture)).toEqual(specialistRelativePaths(runtime));
      expect(Object.values(fixture)).toHaveLength(3);
    },
  );

  it('rejects a missing installed specialist', () => {
    const root = scratch();
    seedRuntime(root, 'claude');
    rmSync(join(root, specialistRelativePaths('claude')[0] as string));

    expect(() => nativeSpecialistFixture(root, 'claude')).toThrow(
      /native specialist.*missing/i,
    );
  });

  it('rejects a symlink in the installed specialist boundary', () => {
    const root = scratch();
    seedRuntime(root, 'codex');
    const path = join(root, specialistRelativePaths('codex')[0] as string);
    const target = join(root, 'outside.toml');
    writeFileSync(target, 'untrusted\n');
    rmSync(path);
    symlinkSync(target, path);

    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(() => nativeSpecialistFixture(root, 'codex')).toThrow(
      /regular file/i,
    );
  });
});
