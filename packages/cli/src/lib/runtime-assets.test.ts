import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compileClaudeHooks,
  wireClaudeLocalAssets,
} from './runtime-assets.js';

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'core');
const CLAUDE_PLUGIN_ROOT = '$' + '{CLAUDE_PLUGIN_ROOT}';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'void-claude-assets-'));
}

describe('compileClaudeHooks', () => {
  it('rewrites plugin roots to the account-free project-local hook directory', () => {
    const hooks = compileClaudeHooks({
      PreToolUse: [{
        matcher: '*',
        hooks: [{
          type: 'command',
          command: `VOID_AGENT_RUNTIME=claude ${CLAUDE_PLUGIN_ROOT}/hooks/activation-meter.sh`,
        }],
      }],
    });

    expect(JSON.stringify(hooks)).toContain('$CLAUDE_PROJECT_DIR/.void/hooks/activation-meter.sh');
    expect(JSON.stringify(hooks)).not.toContain('CLAUDE_PLUGIN_ROOT');
  });

  it('compiles the native Node floor with one quoted path on every platform', () => {
    const hooks = compileClaudeHooks({
      PreToolUse: [{
        matcher: 'Edit|Write',
        hooks: [{
          type: 'command',
          command: `node "${CLAUDE_PLUGIN_ROOT}/hooks/_void-hook.mjs" enforce protected-file`,
        }],
      }],
    });

    expect(JSON.stringify(hooks)).toContain(
      'node \\"$CLAUDE_PROJECT_DIR/.void/hooks/_void-hook.mjs\\" enforce protected-file',
    );
    expect(JSON.stringify(hooks)).not.toContain('node \\"\\"');
  });
});

describe('wireClaudeLocalAssets', () => {
  it('stages native Claude surfaces from the bundled source only', async () => {
    const root = scratch();

    const result = await wireClaudeLocalAssets(root, CORE_ROOT, []);

    expect(result.skills).toBeGreaterThan(20);
    expect(result.agents).toBe(5);
    expect(existsSync(join(root, '.claude/skills/tdd/SKILL.md'))).toBe(true);
    expect(existsSync(join(root, '.claude/agents/doctrine-critic.md'))).toBe(true);
    expect(existsSync(join(root, '.claude/commands/void-doctor.md'))).toBe(true);
    expect(existsSync(join(root, '.void/hooks/_void-hook.mjs'))).toBe(true);
    expect(existsSync(join(root, '.void/hooks/_hooklib.sh'))).toBe(false);
    expect(result.hooks).toBe(1);
    expect(readFileSync(join(root, '.claude/skills/tdd/SKILL.md'), 'utf8')).toContain('runtimes: [claude, codex]');
  });
});
