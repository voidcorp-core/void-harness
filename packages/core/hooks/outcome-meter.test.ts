import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'outcome-meter.sh');
const BASH = process.env.SHELL?.includes('bash') ? process.env.SHELL : '/opt/homebrew/bin/bash';

function runHook(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): { dir: string; outcomes: Record<string, unknown>[] } {
  const dir = mkdtempSync(join(tmpdir(), 'out-meter-'));
  execFileSync(BASH, [script], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
  });
  const path = join(dir, '.void', 'outcomes.jsonl');
  const raw = existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
  const outcomes = raw === '' ? [] : raw.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  return { dir, outcomes };
}

const post = (
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse?: unknown,
): Record<string, unknown> => ({
  hook_event_name: 'PostToolUse',
  session_id: 'sess-1',
  tool_name: toolName,
  tool_input: toolInput,
  ...(toolResponse !== undefined ? { tool_response: toolResponse } : {}),
});

describe('outcome-meter', () => {
  it('records a successful Skill completion as status=ok', () => {
    const { outcomes } = runHook(post('Skill', { skill: 'harness:tdd' }, { success: true }));
    expect(outcomes).toEqual([
      { ts: expect.any(String), event: 'PostToolUse', kind: 'skill', name: 'harness:tdd', status: 'ok', sessionId: 'sess-1' },
    ]);
  });

  it('derives status=error from an is_error tool_response', () => {
    const { outcomes } = runHook(post('Bash', { command: 'x' }, { is_error: true }));
    expect(outcomes[0]).toMatchObject({ kind: 'tool', name: 'Bash', status: 'error' });
  });

  it('derives status=error from a non-null error field', () => {
    const { outcomes } = runHook(post('Bash', { command: 'x' }, { error: 'boom' }));
    expect(outcomes[0]).toMatchObject({ status: 'error' });
  });

  it('records status=unknown when there is no tool_response to judge', () => {
    const { outcomes } = runHook(post('Read', { file_path: 'a.ts' }));
    expect(outcomes[0]).toMatchObject({ kind: 'tool', name: 'Read', status: 'unknown' });
  });

  it('classifies an Agent spawn as kind=agent using subagent_type', () => {
    const { outcomes } = runHook(post('Agent', { subagent_type: 'Explore' }, {}));
    expect(outcomes[0]).toMatchObject({ kind: 'agent', name: 'Explore', status: 'ok' });
  });

  it('writes a Stop marker carrying the session id', () => {
    const { outcomes } = runHook({ hook_event_name: 'Stop', session_id: 'sess-1' });
    expect(outcomes).toEqual([{ ts: expect.any(String), event: 'Stop', sessionId: 'sess-1' }]);
  });

  it('never writes tool content or command text (privacy)', () => {
    const { outcomes } = runHook(post('Bash', { command: 'echo SECRET_TOKEN' }, { stdout: 'SECRET_TOKEN' }));
    expect(JSON.stringify(outcomes)).not.toContain('SECRET_TOKEN');
  });
});
