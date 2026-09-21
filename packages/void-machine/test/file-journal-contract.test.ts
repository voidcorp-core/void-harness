import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createFileJournal } from '../src/adapters/store/file-journal.js';
import { contentsDigest } from './doctor-fixture.js';

function journalFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'machine-journal-')));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const store = join(root, 'store');
  return { root, store, journal: createFileJournal({ root: store }) };
}

describe('file journal revisions', () => {
  it('reports a mission that was never written as missing', async () => {
    const f = journalFixture();
    expect(await f.journal.read('mission-1')).toEqual({ kind: 'missing' });
  });

  it('grants one revision to exactly one writer', async () => {
    const f = journalFixture();
    expect(await f.journal.append('mission-1', 0, { step: 'first' }))
      .toEqual({ kind: 'appended', revision: 1 });
    expect(await f.journal.append('mission-1', 0, { step: 'rival' })).toEqual({ kind: 'conflict' });
    expect(await f.journal.append('mission-1', 1, { step: 'second' }))
      .toEqual({ kind: 'appended', revision: 2 });
    expect(await f.journal.read('mission-1'))
      .toEqual({ kind: 'records', records: [{ step: 'first' }, { step: 'second' }] });
  });

  it('creates private directories and records', async () => {
    const f = journalFixture();
    await f.journal.append('mission-1', 0, { step: 'first' });
    expect(statSync(join(f.store, 'mission-1')).mode & 0o777).toBe(0o700);
    expect(statSync(join(f.store, 'mission-1', '000001.json')).mode & 0o777).toBe(0o600);
  });

  it('ignores and keeps an orphan temporary file', async () => {
    const f = journalFixture();
    await f.journal.append('mission-1', 0, { step: 'first' });
    const orphan = join(f.store, 'mission-1', '.tmp-orphan');
    writeFileSync(orphan, 'partial');
    expect(await f.journal.read('mission-1')).toEqual({ kind: 'records', records: [{ step: 'first' }] });
    expect(existsSync(orphan)).toBe(true);
  });

  it.each([
    ['a revision gap', '000003.json', '{}'],
    ['an oversized record', '000002.json', `"${'x'.repeat(262_144)}"`],
    ['invalid JSON', '000002.json', '{"step":'],
  ])('refuses %s on read without altering bytes', async (_label, name, bytes) => {
    const f = journalFixture();
    await f.journal.append('mission-1', 0, { step: 'first' });
    writeFileSync(join(f.store, 'mission-1', name), bytes);
    const before = contentsDigest(f.store);
    expect(await f.journal.read('mission-1')).toMatchObject({ kind: 'unreadable' });
    expect(contentsDigest(f.store)).toBe(before);
  });

  it('refuses an oversized append as a storage failure', async () => {
    const f = journalFixture();
    await f.journal.append('mission-1', 0, { step: 'first' });
    expect(await f.journal.append('mission-1', 1, { text: 'x'.repeat(262_144) }))
      .toMatchObject({ kind: 'failed' });
    expect(await f.journal.read('mission-1')).toEqual({ kind: 'records', records: [{ step: 'first' }] });
  });

  it('refuses a mission identifier that could leave the store', async () => {
    const f = journalFixture();
    expect(await f.journal.append('../escape', 0, { step: 'first' })).toMatchObject({ kind: 'failed' });
    expect(readdirSync(f.root)).not.toContain('escape');
  });

  it('refuses a mission directory that is a symbolic link and leaves its target untouched', async () => {
    const f = journalFixture();
    const outside = join(f.root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, '000001.json'), '{"step":"outside"}');
    mkdirSync(f.store);
    symlinkSync(outside, join(f.store, 'mission-1'));
    const before = contentsDigest(outside);
    expect(await f.journal.read('mission-1')).toMatchObject({ kind: 'unreadable' });
    expect(await f.journal.append('mission-1', 1, { step: 'second' })).toMatchObject({ kind: 'failed' });
    expect(contentsDigest(outside)).toBe(before);
  });

  // Permission bits do not bind a root process, so the failure cannot be produced there.
  it.skipIf(process.getuid?.() === 0)('reports an unwritable mission as a storage failure, not a conflict', async () => {
    const f = journalFixture();
    await f.journal.append('mission-1', 0, { step: 'first' });
    const directory = join(f.store, 'mission-1');
    chmodSync(directory, 0o500);
    try {
      expect(await f.journal.append('mission-1', 1, { step: 'second' })).toMatchObject({ kind: 'failed' });
    } finally {
      chmodSync(directory, 0o700);
    }
    expect(await f.journal.read('mission-1')).toEqual({ kind: 'records', records: [{ step: 'first' }] });
  });
});
