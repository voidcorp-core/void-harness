import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverProjectRoot } from './enforcement/runner.js';
import {
  recordHookEvent,
  recordRuntimeEvent,
  recordRuntimeEventFromCli,
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

// The runtime-event writer takes the directory it was told to write in, and
// discovers nothing. The enforcement path does walk up to the tree
// (`discoverProjectRoot`), and the two coincide wherever a hook is started at
// the root, which is where Claude and Codex start them. They part company in a
// subdirectory, and the ADR of 2026-09-02 says why the writer stays as it is:
// it runs on every tool call of every runtime, and paying a walk up the tree
// there would be paid by every project for the one case an adapter should
// close by exporting the root (DEV-738).
describe('recordRuntimeEventFromCli', () => {
  it('writes where it stands, without walking up to the project root', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'void-cwd-')));
    await mkdir(join(root, '.void'), { recursive: true });
    await writeFile(join(root, '.void', 'config.json'), '{}');
    const nested = join(root, 'packages', 'worker');
    await mkdir(nested, { recursive: true });
    const globalDir = await mkdtemp(join(tmpdir(), 'void-global-'));
    // The fixture is only worth anything if the two answers differ here.
    expect(discoverProjectRoot(nested)).toBe(root);

    const previous = process.cwd();
    process.chdir(nested);
    try {
      await recordRuntimeEventFromCli(
        {
          session_id: 'private-runtime-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: 'README.md' },
        },
        ['node', 'void-hook-runner', 'activation', 'claude'],
        { VOID_GLOBAL_DIR: globalDir },
      );
    } finally {
      process.chdir(previous);
    }

    expect(await readdir(voidMachinePath(nested, 'runs'))).toHaveLength(1);
    await expect(readdir(voidMachinePath(root, 'runs'))).rejects.toThrow();
  });
});
