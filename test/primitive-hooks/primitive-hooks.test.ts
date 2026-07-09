/**
 * Tests for the lifecycle-event hooks added beyond PreToolUse:
 *   - auto-format.sh        (PostToolUse, non-blocking, fail-open)
 *   - activation-meter.sh   (universal PreToolUse meter; usage.log for skills, activations.jsonl for all)
 *   - sessionstart-context.sh (SessionStart, injects additionalContext; also
 *                              covers post-compaction via source=compact)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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

describe('activation-meter.sh', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'void-meter-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('records a Skill invocation to activations.jsonl and never the legacy usage.log (#70)', () => {
    const r = run('activation-meter.sh', '{"tool_name":"Skill","tool_input":{"skill":"tdd"}}', {
      CLAUDE_PROJECT_DIR: dir,
      VOID_GLOBAL_DIR: join(dir, "_global"),
    });
    expect(r.code).toBe(0);
    // activations.jsonl is now the single source of truth.
    const jsonl = join(dir, '.void', 'activations.jsonl');
    expect(existsSync(jsonl)).toBe(true);
    expect(readFileSync(jsonl, 'utf8')).toContain('"name":"tdd"');
    // The legacy usage.log writer is gone: the meter must not recreate it.
    expect(existsSync(join(dir, '.void', 'usage.log'))).toBe(false);
  });

  it('records a non-Skill tool as kind=tool and writes no usage.log', () => {
    run('activation-meter.sh', '{"tool_name":"Bash","tool_input":{"command":"ls"}}', {
      CLAUDE_PROJECT_DIR: dir,
      VOID_GLOBAL_DIR: join(dir, "_global"),
    });
    const jsonl = join(dir, '.void', 'activations.jsonl');
    expect(readFileSync(jsonl, 'utf8')).toContain('"kind":"tool"');
    expect(existsSync(join(dir, '.void', 'usage.log'))).toBe(false);
  });

  it('appends one valid JSON event to activations.jsonl', () => {
    const payload = JSON.stringify({
      tool_name: 'Skill',
      tool_input: { skill: 'harness:tdd' },
      hook_event_name: 'PreToolUse',
      session_id: 'test-session-1',
    });
    const r = run('activation-meter.sh', payload, { CLAUDE_PROJECT_DIR: dir, VOID_GLOBAL_DIR: join(dir, "_global") });
    expect(r.code).toBe(0);
    const jsonlPath = join(dir, '.void', 'activations.jsonl');
    expect(existsSync(jsonlPath)).toBe(true);
    const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const ev = JSON.parse(lines[0] ?? '{}');
    expect(ev).toMatchObject({ kind: 'skill', name: 'harness:tdd', event: 'PreToolUse' });
    expect(typeof ev.ts).toBe('string');
  });

  it('exits 0 even when .void dir is unwritable (best-effort)', () => {
    const r = run(
      'activation-meter.sh',
      '{"tool_name":"Skill","tool_input":{"skill":"harness:tdd"}}',
      { CLAUDE_PROJECT_DIR: '/dev/null/nonexistent' },
    );
    expect(r.code).toBe(0);
  });
});

describe('context-injecting hooks', () => {
  it('sessionstart emits SessionStart additionalContext JSON', () => {
    const r = run('sessionstart-context.sh', '{}');
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('floor');
  });

});
