// @test-resource filesystem
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readLocalEvidence, availability } from './availability.js';
import { readData } from './read.js';
import type { CatalogEntry } from './catalog.js';

const skill: CatalogEntry = {
  id: 'skill:void-tdd', type: 'skill', name: 'void-tdd', description: 'Test first',
  pack: 'core', runtimes: ['claude', 'codex'], invocations: [], triggers: [], relatedIds: [],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cheatsheet-evidence-'));
  const asset = '.claude/skills/void-tdd/SKILL.md';
  const body = 'PRIVATE CONSUMER CONTENT';
  await mkdir(join(root, '.void/machine/receipts'), { recursive: true });
  await mkdir(join(root, '.claude/skills/void-tdd'), { recursive: true });
  await writeFile(join(root, asset), body);
  await writeFile(join(root, '.void/config.json'), JSON.stringify({ core: '3.7.1', packs: {} }));
  await writeFile(join(root, '.void/machine/receipts/install-v1.json'), JSON.stringify({
    schemaVersion: 1, version: '3.7.1', source: 'local', runtimes: ['claude'],
    files: [{ path: asset, sha256: createHash('sha256').update(body).digest('hex'), mode: 420 }],
  }));
  return root;
}

describe('read-only installation evidence', () => {
  it('separates installed assets, unsupported runtimes and inactive packs', async () => {
    const root = await fixture();
    const evidence = await readLocalEvidence(root, [skill]);
    expect(availability(skill, evidence)).toEqual(expect.arrayContaining([
      expect.objectContaining({ runtime: 'claude', state: 'installed', verified: false }),
      expect.objectContaining({ runtime: 'codex', state: 'absent' }),
    ]));
    expect(availability({ ...skill, runtimes: ['claude'] }, evidence)[1]?.state).toBe('unsupported');
    expect(availability({ ...skill, pack: 'pack-react' }, evidence)[0]?.state).toBe('inactive-pack');
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE CONSUMER CONTENT');
  });

  it('uses explicit Claude off overrides, including local precedence', async () => {
    const root = await fixture();
    await writeFile(join(root, '.claude/settings.json'), JSON.stringify({ skillOverrides: { 'void-tdd': 'off' } }));
    expect(availability(skill, await readLocalEvidence(root, [skill]))[0]?.state).toBe('disabled');
    await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ skillOverrides: { 'void-tdd': 'user-invocable-only' } }));
    expect(availability(skill, await readLocalEvidence(root, [skill]))[0]?.state).toBe('installed');
  });

  it('keeps absent and corrupt evidence distinct, and refuses modified assets', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'cheatsheet-empty-'));
    expect((await readLocalEvidence(empty, [skill])).installation).toBe('absent');
    const root = await fixture();
    await writeFile(join(root, '.claude/skills/void-tdd/SKILL.md'), 'changed');
    expect(availability(skill, await readLocalEvidence(root, [skill]))[0]?.state).toBe('unknown');
    await writeFile(join(root, '.void/machine/receipts/install-v1.json'), '{broken');
    expect((await readLocalEvidence(root, [skill])).installation).toBe('unknown');
  });

  it('bounds reads and refuses symlinks and non-regular files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cheatsheet-bounds-'));
    await writeFile(join(root, 'data'), '12345');
    expect((await readData(root, 'data', 5)).state).toBe('read');
    expect((await readData(root, 'data', 4)).state).toBe('unknown');
    await symlink(join(root, 'data'), join(root, 'link'));
    expect((await readData(root, 'link', 5)).state).toBe('unknown');
    expect((await readData(root, '.', 5)).state).toBe('unknown');
    expect((await readData(root, '../outside', 5)).state).toBe('unknown');
  });
});
