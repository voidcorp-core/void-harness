import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadProfiles,
  MAX_PROFILE_FILE_BYTES,
  parseProfileYaml,
} from './profile-loader.js';

const CORE_PROFILES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'core',
  'profiles',
);

const PROFILE = `schemaVersion: 1
id: project:rust
version: 1
name: rust
technologies:
  - id: rust
    minimumVersion: 1.80.0
    maximumVersionExclusive: 2.0.0
detectors:
  always: false
  technologies: [rust]
  files:
    extensions: [.rs]
    names: [Cargo.toml]
    pathSegments: []
sources:
  - title: Rust documentation
    url: https://doc.rust-lang.org/
reviewedAt: 2026-07-27
expiresAfterDays: 180
invariants:
  - Keep unsafe code isolated and justified.
patterns:
  - id: rust-source
    appliesWhen:
      technologies: [rust]
      files:
        extensions: [.rs]
        names: []
        pathSegments: []
    guidance: Apply Rust guidance only to changed Rust source.
`;

describe('profile YAML loader', () => {
  it('loads the nine bundled core profiles in deterministic order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-profiles-'));
    const profiles = await loadProfiles(root, CORE_PROFILES);

    expect(profiles.map((profile) => profile.name)).toEqual([
      'base',
      'expo',
      'monorepo',
      'nextjs',
      'node-server',
      'pwa',
      'react',
      'sql',
      'typescript',
    ]);
  });

  it('loads only explicit project profile files and refuses identity collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-profiles-'));
    const directory = join(root, '.void', 'profiles');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'rust.profile.yaml'), PROFILE, 'utf8');
    await writeFile(join(directory, 'ignored.policy.yaml'), 'not: a profile', 'utf8');

    await expect(loadProfiles(root, CORE_PROFILES)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'project:rust' })]),
    );

    await writeFile(
      join(directory, 'duplicate.profile.yaml'),
      PROFILE.replace('name: rust', 'name: rust-copy'),
      'utf8',
    );
    await expect(loadProfiles(root, CORE_PROFILES)).rejects.toThrow(/duplicate profile id/i);
  });

  it('rejects aliases, oversized inputs, and project symlink escapes', async () => {
    expect(() => parseProfileYaml('a: &x [1]\nb: *x\n', 'alias.yaml')).toThrow(
      /PROFILE_YAML_INVALID/,
    );
    expect(() => parseProfileYaml('x'.repeat(MAX_PROFILE_FILE_BYTES + 1), 'huge.yaml')).toThrow(
      /exceeds/i,
    );

    const root = await mkdtemp(join(tmpdir(), 'void-profiles-'));
    const outside = await mkdtemp(join(tmpdir(), 'void-profiles-outside-'));
    await writeFile(join(outside, 'escape.profile.yaml'), PROFILE, 'utf8');
    const directory = join(root, '.void', 'profiles');
    await mkdir(directory, { recursive: true });
    await symlink(
      join(outside, 'escape.profile.yaml'),
      join(directory, 'escape.profile.yaml'),
    );

    await expect(loadProfiles(root, CORE_PROFILES)).rejects.toThrow(/PROFILE_PATH_ESCAPE/);
  });
});
