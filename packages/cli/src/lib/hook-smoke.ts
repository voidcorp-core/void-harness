import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { voidLocalReadPath } from '@voidcorp/hook-runner';
import { parseEventLine } from '@voidcorp/mission-engine/events';
import type { Runtime } from './runtime.js';

const SMOKE_TIMEOUT_MS = 5_000;
const MAX_EVENT_BYTES = 64 * 1024;

export interface HookSmokeResult {
  readonly fired: boolean | null;
  readonly detail: string;
}

async function executable(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function runHook(
  hookPath: string,
  runtime: Runtime,
  projectRoot: string,
  globalRoot: string,
  missionId: string,
): Promise<{ readonly code: number | null; readonly timedOut: boolean }> {
  return await new Promise((resolveRun) => {
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ code, timedOut });
    };
    const inheritedEnvironment = Object.fromEntries(
      ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']
        .map((name) => [name, process.env[name]])
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const nodeAsset = hookPath.endsWith('.mjs');
    const child = spawn(
      nodeAsset ? process.execPath : hookPath,
      nodeAsset ? [hookPath, 'activation', runtime] : [],
      {
      cwd: projectRoot,
      env: {
        ...inheritedEnvironment,
        CLAUDE_PROJECT_DIR: projectRoot,
        VOID_PROJECT_ROOT: projectRoot,
        VOID_GLOBAL_DIR: globalRoot,
        VOID_AGENT_RUNTIME: runtime,
        VOID_MISSION_ID: missionId,
      },
      shell: false,
      stdio: ['pipe', 'ignore', 'ignore'],
      },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, SMOKE_TIMEOUT_MS);
    child.once('error', () => finish(null));
    child.once('close', finish);
    child.stdin.on('error', () => {
      // A hook that closes stdin early is diagnosed by exit/event postconditions.
    });
    child.stdin.end(JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'void-doctor-smoke',
      tool_name: 'Read',
      tool_input: { file_path: join(projectRoot, 'doctor-smoke.txt') },
    }));
  });
}

/**
 * Execute the installed activation hook against an isolated fixture and require
 * the matching canonical event. A zero exit alone is never proof: telemetry
 * adapters intentionally swallow recorder failures to avoid blocking tools.
 */
export async function smokeInstalledHook(
  hookPath: string,
  runtime: Runtime,
): Promise<HookSmokeResult> {
  const nodeAsset = hookPath.endsWith('.mjs');
  if (nodeAsset) {
    try {
      const info = await lstat(hookPath);
      if (!info.isFile() || info.isSymbolicLink()) {
        return { fired: false, detail: 'hook is not a safe regular file' };
      }
    } catch {
      return { fired: false, detail: 'hook is missing' };
    }
  } else if (!(await executable(hookPath))) {
    return { fired: false, detail: 'hook is not executable' };
  }
  if (process.platform === 'win32' && !nodeAsset) {
    return {
      fired: null,
      detail: 'hook smoke unknown: POSIX wrapper cannot execute on Windows',
    };
  }

  const root = await mkdtemp(join(tmpdir(), 'void-hook-probe-'));
  const globalRoot = join(root, '.global');
  const missionId = `mis_doctor_${randomUUID().replaceAll('-', '')}`;
  try {
    const result = await runHook(hookPath, runtime, root, globalRoot, missionId);
    if (result.timedOut) return { fired: false, detail: 'hook smoke timed out' };
    if (result.code !== 0) {
      return {
        fired: false,
        detail: `hook smoke exited ${result.code === null ? 'without a status' : result.code}`,
      };
    }
    const logPath = join(voidLocalReadPath(root, 'runs'), missionId, 'events.jsonl');
    let body: string;
    try {
      const info = await lstat(logPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_EVENT_BYTES) {
        return { fired: false, detail: 'hook smoke emitted an unsafe or oversized event log' };
      }
      body = await readFile(logPath, 'utf8');
    } catch {
      return { fired: false, detail: 'hook exited cleanly but emitted no matching event' };
    }
    for (const line of body.split(/\r?\n/)) {
      if (line === '') continue;
      const parsed = parseEventLine(line);
      if (
        parsed.ok
        && parsed.value.missionId === missionId
        && parsed.value.source === `runtime:${runtime}`
        && parsed.value.kind === 'runtime.tool.started'
        && parsed.value.subject === 'tool:Read'
      ) {
        return { fired: true, detail: 'installed hook emitted the expected canonical event' };
      }
    }
    return { fired: false, detail: 'hook exited cleanly but emitted no matching event' };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
