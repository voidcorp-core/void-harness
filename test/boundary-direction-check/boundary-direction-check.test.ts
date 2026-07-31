/**
 * Tests for packages/core/hooks/boundary-direction-check.sh
 *
 * PreToolUse hook enforcing declared dependencies: a file may import a
 * workspace package its own package.json declares, and not one it does not.
 * Reads the Claude Code tool-call JSON from stdin; exit 0 allows, exit 2
 * blocks.
 *
 * The topology comes from each package's manifest rather than a hardcoded star
 * around @repo/core, so these fixtures write a package.json — without one the
 * hook has nothing to judge against and allows.
 *
 * Claude Code passes ABSOLUTE paths in tool_input.file_path: the hook must
 * normalize them before matching its root-anchored ^packages/ regex,
 * otherwise every check silently fails open (audit 2026-07-09, issue #62).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/boundary-direction-check.sh');

function setupFixture(declared: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'boundary-check-test-'));
  execSync('git init -q', { cwd: dir });
  mkdirSync(join(dir, 'packages/billing/src'), { recursive: true });
  writeFileSync(
    join(dir, 'packages/billing/package.json'),
    JSON.stringify({ name: '@repo/billing', dependencies: declared }, null, 2),
  );
  return dir;
}

function runHook(
  cwd: string,
  file: string,
  content: string,
): { code: number; stderr: string } {
  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: file, content },
  });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

const VIOLATION = `import { mail } from '@repo/email';\nexport const x = 1;\n`;
const CORE_IMPORT = `import { logger } from '@repo/core';\nexport const x = 1;\n`;

describe('boundary-direction-check.sh', () => {
  it('BLOCKS a forbidden cross-package import (relative path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, 'packages/billing/src/invoice.ts', VIOLATION);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('does not declare');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS a forbidden cross-package import (absolute path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'packages/billing/src/invoice.ts'), VIOLATION);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('does not declare');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows an import the package declares (absolute path, exit 0)', () => {
    const dir = setupFixture({ '@repo/core': 'workspace:*' });
    try {
      const result = runHook(dir, join(dir, 'packages/billing/src/invoice.ts'), CORE_IMPORT);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows a file with no manifest to judge against (absolute path, exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'packages/core/src/logger.ts'), VIOLATION);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows files outside packages/ (apps/, exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/page.ts'), VIOLATION);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors the allow-boundary override tag (exit 0)', () => {
    const dir = setupFixture();
    try {
      const tagged = `import { mail } from '@repo/email'; // allow-boundary: adapter wiring\n`;
      const result = runHook(dir, join(dir, 'packages/billing/src/invoice.ts'), tagged);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not block an absolute path outside the project root', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, '/elsewhere/packages/billing/src/invoice.ts', VIOLATION);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
