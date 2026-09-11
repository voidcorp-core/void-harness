import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { protectedFile } from './protected-file.js';

describe('protectedFile', () => {
  it.each([
    'apps/web/.env',
    'CONFIG/.ENV.LOCAL',
    'certs/server.pem',
    '/home/u/.ssh/id_rsa',
    'pnpm-lock.yaml',
    'bun.lock',
    'apps/web/BUN.LOCK',
    'bun.lockb',
    '.git/config',
    'src/Credentials.ts',
  ])('blocks %s', (path) => {
    expect(protectedFile([path]).allow).toBe(false);
  });

  it.each([
    '.env.example',
    'src/feature.ts',
    'docs/byo-credentials.md',
  ])('allows %s', (path) => {
    expect(protectedFile([path]).allow).toBe(true);
  });

  it('blocks a harness asset named by the install manifest and points to void-learn', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-protected-file-'));
    mkdirSync(join(root, '.void'));
    writeFileSync(join(root, '.void/install-manifest.json'), JSON.stringify({
      schemaVersion: 1,
      version: '3.7.1',
      files: [{ path: '.claude/skills/void-tdd/SKILL.md', sha256: 'a'.repeat(64) }],
    }));

    const verdict = protectedFile(['.claude/skills/void-tdd/SKILL.md'], { root });

    expect(verdict.allow).toBe(false);
    expect(verdict.code).toBe('PROTECTED_FILE');
    expect(verdict.message).toContain('void-learn');
    expect(verdict.evidence[0]).toContain('delivered harness asset');
  });

  it('allows a project-owned skill even when a manifest exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-project-skill-'));
    mkdirSync(join(root, '.void'));
    writeFileSync(join(root, '.void/install-manifest.json'), JSON.stringify({
      schemaVersion: 1,
      version: '3.7.1',
      files: [{ path: '.claude/skills/void-tdd/SKILL.md', sha256: 'a'.repeat(64) }],
    }));

    expect(protectedFile(['.claude/skills/project-skill/SKILL.md'], { root }).allow).toBe(true);
  });
});
