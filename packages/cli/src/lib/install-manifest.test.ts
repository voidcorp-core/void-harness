import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInstallManifest,
  INSTALL_MANIFEST_PATH,
  parseInstallManifest,
  verifyInstallManifest,
} from './install-manifest.js';

const temporary: string[] = [];

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'void-manifest-'));
  temporary.push(root);
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, ...path.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('buildInstallManifest', () => {
  it('records an exact version, never a range', () => {
    // The whole point: `config.core` is `^2.5.1` and cannot answer "which bytes".
    const manifest = buildInstallManifest('2.5.1', [{ path: '.claude/skills/tdd/SKILL.md', sha256: sha256('a') }]);

    expect(manifest.version).toBe('2.5.1');
    expect(manifest.version).not.toMatch(/[\^~]/);
  });

  it('sorts files so the same install always yields the same bytes', () => {
    const manifest = buildInstallManifest('2.5.1', [
      { path: 'b.md', sha256: sha256('b') },
      { path: 'a.md', sha256: sha256('a') },
    ]);

    expect(manifest.files.map((file) => file.path)).toEqual(['a.md', 'b.md']);
  });

  it('never records the manifest itself, which cannot hash its own contents', () => {
    const manifest = buildInstallManifest('2.5.1', [
      { path: INSTALL_MANIFEST_PATH, sha256: sha256('x') },
      { path: 'a.md', sha256: sha256('a') },
    ]);

    expect(manifest.files.map((file) => file.path)).toEqual(['a.md']);
  });
});

describe('parseInstallManifest', () => {
  it('rejects a body that is not a manifest rather than half-trusting it', () => {
    for (const body of ['', 'null', '[]', '{}', '{"schemaVersion":2}']) {
      expect(parseInstallManifest(body), body).toBeUndefined();
    }
  });

  it('rejects a non-hex or wrong-length hash', () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      version: '2.5.1',
      files: [{ path: 'a.md', sha256: 'z'.repeat(64) }],
    });

    expect(parseInstallManifest(body)).toBeUndefined();
  });

  it('rejects a path that escapes the project root', () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      version: '2.5.1',
      files: [{ path: '../outside.md', sha256: 'a'.repeat(64) }],
    });

    expect(parseInstallManifest(body)).toBeUndefined();
  });

  it('accepts a well-formed manifest', () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      version: '2.5.1',
      files: [{ path: 'a.md', sha256: 'a'.repeat(64) }],
    });

    expect(parseInstallManifest(body)?.version).toBe('2.5.1');
  });
});

describe('verifyInstallManifest', () => {
  const manifest = (files: Record<string, string>) =>
    buildInstallManifest(
      '2.5.1',
      Object.entries(files).map(([path, body]) => ({ path, sha256: sha256(body) })),
    );

  it('proves a faithful restore', () => {
    const files = { 'a.md': 'alpha', '.claude/skills/tdd/SKILL.md': 'tdd' };
    const root = project(files);

    const report = verifyInstallManifest(root, manifest(files));

    expect(report.ok).toBe(true);
    expect(report.verified).toBe(2);
    expect(report.missing).toEqual([]);
    expect(report.mismatched).toEqual([]);
  });

  it('names a file the restore did not produce', () => {
    const report = verifyInstallManifest(project({ 'a.md': 'alpha' }), manifest({ 'a.md': 'alpha', 'b.md': 'beta' }));

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['b.md']);
  });

  it('names a file whose bytes differ, which is the drift this exists to catch', () => {
    // Same path, other content: an edited or differently-versioned asset. Without
    // the hash this is invisible, and "hydrated" would be a claim nobody checked.
    const root = project({ 'a.md': 'edited by hand' });

    const report = verifyInstallManifest(root, manifest({ 'a.md': 'alpha' }));

    expect(report.ok).toBe(false);
    expect(report.mismatched).toEqual(['a.md']);
    expect(report.missing).toEqual([]);
  });

  it('reports an unreadable file as missing rather than throwing', () => {
    const report = verifyInstallManifest('/nonexistent-root', manifest({ 'a.md': 'alpha' }));

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['a.md']);
  });

  // The doctrine file is created once from a template and the project is told to
  // edit it freely, so its bytes stop matching the manifest the first time anyone
  // writes a rule. Counting that as drift made `doctor` exit non-zero on the
  // intended use of the file, and pointed at `hydrate` as the remedy -- which
  // restores nothing there, it re-stamps the hash over what the project wrote.
  it('separates a co-owned file the project edited from an asset that drifted', () => {
    const root = project({
      '.void/PROJECT-DOCTRINE.md': 'the template, plus a rule the team added',
      '.claude/skills/void-tdd/SKILL.md': 'edited by hand',
    });

    const report = verifyInstallManifest(root, manifest({
      '.void/PROJECT-DOCTRINE.md': 'the template',
      '.claude/skills/void-tdd/SKILL.md': 'tdd',
    }));

    expect(report.coEdited).toEqual(['.void/PROJECT-DOCTRINE.md']);
    expect(report.mismatched).toEqual(['.claude/skills/void-tdd/SKILL.md']);
    expect(report.ok).toBe(false);
  });

  it('stays green when the only difference is a co-owned file carrying project edits', () => {
    const root = project({ 'CLAUDE.md': '# project\n\nplus our own sections' });

    const report = verifyInstallManifest(root, manifest({ 'CLAUDE.md': '# project' }));

    expect(report.ok).toBe(true);
    expect(report.coEditedTotal).toBe(1);
    expect(report.mismatched).toEqual([]);
  });

  // Co-ownership licences writing INTO the file, never removing it: the doctrine
  // is imported by every session, and its absence is a broken install.
  it('still reports a co-owned file that is gone, which is not an edit', () => {
    const report = verifyInstallManifest(project({}), manifest({ '.void/PROJECT-DOCTRINE.md': 'x' }));

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['.void/PROJECT-DOCTRINE.md']);
    expect(report.coEdited).toEqual([]);
  });

  it('bounds what it prints, so a wholesale drift stays readable', () => {
    const files = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}.md`, 'x']));
    const report = verifyInstallManifest(project({}), manifest(files));

    expect(report.missing.length).toBeLessThanOrEqual(20);
    expect(report.missingTotal).toBe(40);
  });
});
