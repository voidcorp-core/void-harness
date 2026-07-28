import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNpmrc } from './npmrc.js';

const dir = (): Promise<string> => mkdtemp(join(tmpdir(), 'void-npmrc-'));

describe('readNpmrc', () => {
  it('reads the project .npmrc first', async () => {
    const cwd = await dir();
    await writeFile(join(cwd, '.npmrc'), 'registry=https://project.example\n', 'utf8');
    expect(readNpmrc(cwd, {})).toContain('project.example');
  });

  it('falls back to the home .npmrc', async () => {
    const home = await dir();
    await writeFile(join(home, '.npmrc'), 'registry=https://home.example\n', 'utf8');
    expect(readNpmrc(await dir(), { HOME: home })).toContain('home.example');
  });

  it('prefers the project file over the home file', async () => {
    const cwd = await dir();
    const home = await dir();
    await writeFile(join(cwd, '.npmrc'), 'registry=https://project.example\n', 'utf8');
    await writeFile(join(home, '.npmrc'), 'registry=https://home.example\n', 'utf8');
    expect(readNpmrc(cwd, { HOME: home })).toContain('project.example');
  });

  it('returns undefined when neither file exists', async () => {
    expect(readNpmrc(await dir(), { HOME: await dir() })).toBeUndefined();
  });

  it('never throws when a path is unreadable', () => {
    expect(readNpmrc('/nonexistent-void-test', { HOME: '/nonexistent-void-test' })).toBeUndefined();
  });

  it('refuses to load an oversized file rather than reading an arbitrary blob', async () => {
    const cwd = await dir();
    await writeFile(join(cwd, '.npmrc'), 'x'.repeat(200_000), 'utf8');
    expect(readNpmrc(cwd, {})).toBeUndefined();
  });
});
