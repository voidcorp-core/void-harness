/**
 * Tests for the lifecycle-event hooks added beyond PreToolUse:
 *   - auto-format.sh        (PostToolUse, non-blocking, fail-open)
 *   - skill-usage-meter.sh  (PreToolUse on Skill, telemetry for `audit`)
 *   - sessionstart-context.sh (SessionStart, injects additionalContext)
 *   - precompact-doctrine.sh  (PreCompact, re-injects the floor)
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

describe('skill-usage-meter.sh', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'void-meter-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('logs a Skill invocation to .void/usage.log', () => {
    const r = run('skill-usage-meter.sh', '{"tool_name":"Skill","tool_input":{"skill":"tdd"}}', {
      CLAUDE_PROJECT_DIR: dir,
    });
    expect(r.code).toBe(0);
    const log = join(dir, '.void', 'usage.log');
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, 'utf8')).toContain('tdd');
  });

  it('ignores non-Skill tools (no log)', () => {
    run('skill-usage-meter.sh', '{"tool_name":"Bash","tool_input":{"command":"ls"}}', {
      CLAUDE_PROJECT_DIR: dir,
    });
    expect(existsSync(join(dir, '.void', 'usage.log'))).toBe(false);
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

  it('precompact re-injects the floor', () => {
    const r = run('precompact-doctrine.sh', '{}');
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreCompact');
    expect(out.hookSpecificOutput.additionalContext).toContain('Safety');
  });
});
