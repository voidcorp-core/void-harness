import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CODEX_FLOOR_SCRIPTS } from './codex-floor.js';
import { wireClaudeLocalAssets } from './runtime-assets.js';
import { hookHealthIssues } from './plugin-cache.js';

it('delivers the syntax worker with the Codex floor', () => {
  expect(CODEX_FLOOR_SCRIPTS).toContain('_syntax-worker.cjs');
});
it('delivers the syntax worker even though Claude invokes only the parent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-claude-'));
  await wireClaudeLocalAssets(root, fileURLToPath(new URL('../../../core', import.meta.url)), []);
  expect(existsSync(join(root, '.void/hooks/_syntax-worker.cjs'))).toBe(true);
});
it('reports a missing worker in a plugin cache with a present parent', () => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-cache-'));
  mkdirSync(join(root, 'hooks'));
  writeFileSync(join(root, 'hooks/_void-hook.mjs'), '');
  const issues = hookHealthIssues(root, { hooks: { PreToolUse: [{ hooks: [
    { command: 'node hooks/_void-hook.mjs enforce tdd-order' },
  ] }] } });
  expect(issues.some((issue) => issue.includes('_syntax-worker.cjs') && issue.includes('missing'))).toBe(true);
});
