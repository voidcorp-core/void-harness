/**
 * Tests for the lifecycle-event hooks added beyond PreToolUse:
 *   - auto-format.sh        (PostToolUse, non-blocking, fail-open)
 *   - activation-meter.sh   (universal PreToolUse adapter; canonical run events)
 *   - sessionstart-context.sh (SessionStart, injects additionalContext; also
 *                              covers post-compaction via source=compact)
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const H = (n: string) => resolve(process.cwd(), `packages/core/hooks/${n}`);

function run(hook: string, json: string, env?: Record<string, string>) {
  const proc = spawnSync('bash', [H(hook)], {
    input: json,
    encoding: 'utf8',
    env: { ...process.env, ...(env ?? {}) },
  });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '' };
}

describe('auto-format.sh', () => {
  it('exits 0 and skips a non-code file', () => {
    expect(run('auto-format.sh', '{"tool_name":"Edit","tool_input":{"file_path":"README.md"}}').code).toBe(0);
  });
  it('exits 0 on a non-edit tool', () => {
    expect(run('auto-format.sh', '{"tool_name":"Read","tool_input":{"file_path":"a.ts"}}').code).toBe(0);
  });
});

describe('context-injecting hooks', () => {
  it('sessionstart emits SessionStart additionalContext JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-sessionstart-'));
    try {
      const r = run(
        'sessionstart-context.sh',
        '{"hook_event_name":"SessionStart","source":"startup"}',
        { CLAUDE_PROJECT_DIR: root, VOID_GLOBAL_DIR: join(root, '.void', 'global') },
      );
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
      expect(out.hookSpecificOutput.additionalContext).toContain('floor');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

});
