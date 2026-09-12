import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverProjectRoot } from './enforcement/runner.js';
import {
  recordHookEvent,
  recordRuntimeEvent,
  recordRuntimeEventFromCli,
} from './record.js';
import { voidMachinePath } from './void-layout.js';

const scratchDirectories: string[] = [];

async function scratch(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratchDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    scratchDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('recordRuntimeEvent', () => {
  it('writes only project-local evidence, never a user-global project pointer', async () => {
    const root = await scratch('void-record-');
    const home = await scratch('void-record-home-');
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    const recorded = await recordRuntimeEvent({
      root,
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
    await expect(readdir(join(home, '.void'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('recordHookEvent', () => {
  it('records a redacted canonical hook outcome', async () => {
    const root = await scratch('void-hook-event-');
    const recorded = await recordHookEvent({
      root,
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

// Runtime hooks discover the durable project, including from nested directories.
describe('recordRuntimeEventFromCli', () => {
  it('uses the project identity when started from a nested directory', async () => {
    const root = await realpath(await scratch('void-cwd-'));
    await mkdir(join(root, '.void'), { recursive: true });
    await writeFile(join(root, '.void', 'config.json'), '{}');
    const nested = join(root, 'packages', 'worker');
    await mkdir(nested, { recursive: true });
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
        {},
      );
    } finally {
      process.chdir(previous);
    }

    expect(await readdir(voidMachinePath(root, 'runs'))).toHaveLength(1);
    await expect(readdir(voidMachinePath(nested, 'runs'))).rejects.toThrow();
  });
});
