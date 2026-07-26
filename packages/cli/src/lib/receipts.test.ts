import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildInstallReceipt,
  encodeReceipt,
  parseReceipt,
  removeReceiptOwnedFiles,
} from './receipts.js';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'void-receipt-'));
}

describe('install receipts', () => {
  it('round-trips a deterministic, sorted ownership manifest', () => {
    const receipt = buildInstallReceipt({
      version: '2.0.2',
      source: 'local',
      runtimes: ['codex', 'claude'],
      files: [
        { path: '.void/hooks/z.mjs', content: Buffer.from('z'), mode: 0o755 },
        { path: '.void/hooks/a.mjs', content: Buffer.from('a'), mode: 0o644 },
      ],
    });

    const encoded = encodeReceipt(receipt);
    const parsed = parseReceipt(encoded);

    expect(parsed).toEqual(receipt);
    expect(parsed?.runtimes).toEqual(['claude', 'codex']);
    expect(parsed?.files.map((file) => file.path)).toEqual([
      '.void/hooks/a.mjs',
      '.void/hooks/z.mjs',
    ]);
    expect(encoded).not.toContain('installedAt');
  });

  it.each(['../secret', '/absolute', '.void/../secret', 'C:\\outside'])(
    'rejects unsafe owned path %s',
    (path) => {
      const unsafe = JSON.stringify({
        schemaVersion: 1,
        version: '2.0.2',
        source: 'local',
        runtimes: ['codex'],
        files: [{ path, sha256: 'a'.repeat(64), mode: 420 }],
      });
      expect(parseReceipt(unsafe)).toBeUndefined();
    },
  );

  it('removes only unchanged receipt-owned files and preserves adjacent or modified files', async () => {
    const root = scratch();
    const owned = join(root, '.agents/skills/tdd/SKILL.md');
    const modified = join(root, '.void/hooks/guard.mjs');
    const adjacent = join(root, '.agents/skills/private/SKILL.md');
    mkdirSync(join(root, '.agents/skills/tdd'), { recursive: true });
    mkdirSync(join(root, '.agents/skills/private'), { recursive: true });
    mkdirSync(join(root, '.void/hooks'), { recursive: true });
    writeFileSync(owned, '# TDD\n');
    writeFileSync(modified, 'original\n');
    writeFileSync(adjacent, '# private\n');
    const receipt = buildInstallReceipt({
      version: '2.0.2',
      source: 'local',
      runtimes: ['codex'],
      files: [
        { path: '.agents/skills/tdd/SKILL.md', content: Buffer.from('# TDD\n'), mode: 0o644 },
        { path: '.void/hooks/guard.mjs', content: Buffer.from('original\n'), mode: 0o755 },
      ],
    });
    writeFileSync(modified, 'user changed\n');

    const result = await removeReceiptOwnedFiles(root, receipt);

    expect(result.removed).toEqual(['.agents/skills/tdd/SKILL.md']);
    expect(result.preserved).toEqual(['.void/hooks/guard.mjs']);
    expect(existsSync(owned)).toBe(false);
    expect(readFileSync(modified, 'utf8')).toBe('user changed\n');
    expect(readFileSync(adjacent, 'utf8')).toBe('# private\n');
  });
});
