import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  recordHookEvent,
  recordRuntimeEvent,
} from './record.js';
import { voidMachinePath } from './void-layout.js';

describe('recordRuntimeEvent', () => {
  it('writes one canonical event and never persists raw session or tool content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-record-'));
    const globalDir = await mkdtemp(join(tmpdir(), 'void-global-'));
    const recorded = await recordRuntimeEvent({
      root,
      globalDir,
      runtime: 'codex',
      phase: 'activation',
      rawInput: {
        session_id: 'private-runtime-session',
        tool_name: 'shell',
        hook_event_name: 'PreToolUse',
        tool_input: { command: 'echo TOP_SECRET' },
      },
    });

    expect(recorded).toMatchObject({
      seq: 1,
      source: 'runtime:codex',
      kind: 'runtime.tool.started',
      subject: 'tool:shell',
    });
    if (recorded === undefined) return;
    const body = await readFile(
      join(voidMachinePath(root, 'runs'), recorded.missionId, 'events.jsonl'),
      'utf8',
    );
    expect(body).not.toContain('private-runtime-session');
    expect(body).not.toContain('TOP_SECRET');
    const pointers = await readdir(join(globalDir, 'projects'));
    expect(pointers).toHaveLength(1);
    expect(
      await readFile(join(globalDir, 'projects', pointers[0] ?? ''), 'utf8'),
    ).toBe(`${await realpath(root)}\n`);
  });
});

describe('recordHookEvent', () => {
  it('records a redacted canonical hook outcome', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-hook-event-'));
    const globalDir = await mkdtemp(join(tmpdir(), 'void-global-'));
    const recorded = await recordHookEvent({
      root,
      globalDir,
      runtime: 'codex',
      hook: 'typecheck',
      status: 'degraded',
      rawInput: { session_id: 'private-session', tool_response: 'TOP_SECRET' },
      details: { reason: 'timeout', durationMs: 45_000 },
    });

    expect(recorded).toMatchObject({
      kind: 'hook.completed',
      subject: 'hook:typecheck',
      payload: {
        status: 'degraded',
        reason: 'timeout',
        durationMs: 45_000,
      },
    });
    if (recorded === undefined) return;
    const body = await readFile(
      join(voidMachinePath(root, 'runs'), recorded.missionId, 'events.jsonl'),
      'utf8',
    );
    expect(body).not.toContain('private-session');
    expect(body).not.toContain('TOP_SECRET');
  });
});
