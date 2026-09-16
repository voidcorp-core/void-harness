import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CODEX_FLOOR_SCRIPTS } from './codex-floor.js';
import { wireClaudeLocalAssets } from './runtime-assets.js';
import { hookHealthIssues } from './plugin-cache.js';
import { adapterFor } from './runtime-adapters.js';

it('reports the configured local worker missing even when a healthy marketplace cache exists', async () => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-local-health-'));
  const core = fileURLToPath(new URL('../../../core', import.meta.url));
  const cache = join(root, 'cache');
  cpSync(core, join(cache, 'voidcorp', 'harness', '3.8.0'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ hooks: {
    PreToolUse: [{ hooks: [{ command: 'node "$CLAUDE_PROJECT_DIR/.void/hooks/_void-hook.mjs"' }] }],
  } }));
  const { checks } = await adapterFor('claude').inspect(root, { claudeCacheRoot: cache });
  expect(checks.find((check) => check.name === 'syntax worker')?.ok).toBe(false);
  expect(checks.some((check) => check.name === 'plugin cache')).toBe(false);
});

it('reports an incompatible worker after a partial update', () => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-pair-'));
  mkdirSync(join(root, 'hooks'));
  for (const name of ['_void-hook.mjs', '_syntax-worker.cjs']) {
    cpSync(fileURLToPath(new URL(`../../../core/hooks/${name}`, import.meta.url)), join(root, 'hooks', name));
  }
  const manifest = { hooks: { PreToolUse: [{ hooks: [{ command: 'node hooks/_void-hook.mjs' }] }] } };
  expect(hookHealthIssues(root, manifest)).toEqual([]);
  writeFileSync(join(root, 'hooks/_syntax-worker.cjs'), 'old worker');
  expect(hookHealthIssues(root, manifest).some((issue) => issue.includes('incompatible'))).toBe(true);
});

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
