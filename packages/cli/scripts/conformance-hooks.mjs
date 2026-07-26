#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCanonicalHookReplay,
  runtimesForMode,
} from './conformance-hooks-lib.mjs';
import { packageManagerCommand } from './conformance-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_HOOK_INPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 120_000;
const HOOK_TIMEOUT_MS = 5_000;

function childEnvironment(extra = {}) {
  const allowed = [
    'APPDATA',
    'CI',
    'ComSpec',
    'LANG',
    'LC_ALL',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR',
  ];
  return Object.fromEntries([
    ...allowed
      .map((name) => [name, process.env[name]])
      .filter((entry) => entry[1] !== undefined),
    ...Object.entries(extra),
  ]);
}

function safeDiagnostic(value) {
  return value
    .replace(/(\bBearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(
      /(\b(?:api[-_]?key|authorization|password|secret|token)\b\s*[:=]\s*)[^\s&,;]+/gi,
      '$1[REDACTED]',
    )
    .slice(0, MAX_OUTPUT_BYTES);
}

function requireDiagnostic(result, pattern, label) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (!pattern.test(output)) {
    throw new Error(`hook conformance ${label} lacked its expected diagnostic`);
  }
}

async function run(command, args, options) {
  const expectedCodes = options.expectedCodes ?? [0];
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let spawnError;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

    const capture = (target) => (chunk) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill('SIGKILL');
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (
        spawnError === undefined
        && !timedOut
        && !outputExceeded
        && code !== null
        && expectedCodes.includes(code)
      ) {
        resolveRun(result);
        return;
      }
      const detail = safeDiagnostic(
        `${result.stdout}\n${result.stderr}`.trim(),
      );
      rejectRun(new Error(
        [
          `hook conformance command failed: ${command} ${args.join(' ')}`,
          spawnError === undefined ? undefined : `spawn: ${spawnError.message}`,
          timedOut ? 'timed out' : undefined,
          outputExceeded ? `output exceeded ${MAX_OUTPUT_BYTES} bytes` : undefined,
          `exit: ${String(code)}`,
          detail === '' ? undefined : detail,
        ].filter(Boolean).join('\n'),
      ));
    });
    child.stdin.on('error', () => {
      // Exit status and replay postconditions remain authoritative.
    });
    child.stdin.end(options.input);
  });
}

async function requireRegularFile(path, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`hook conformance unsafe ${label}: ${path}`);
  }
}

function payloadFor(runtime, fixture) {
  if (runtime === 'claude') {
    return {
      hook_event_name: 'PreToolUse',
      session_id: 'hook-conformance-claude',
      tool_name: 'Write',
      tool_input: {
        file_path: join(fixture, 'example.py'),
        content: 'print("safe")\n',
      },
    };
  }
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'hook-conformance-codex',
    tool_name: 'apply_patch',
    tool_input: {
      patch: [
        '*** Begin Patch',
        '*** Update File: example.py',
        '@@',
        '-print("safe")',
        '+print("still safe")',
        '*** End Patch',
      ].join('\n'),
    },
  };
}

function hookEnvironment(fixture, missionId, runtime) {
  return childEnvironment({
    CLAUDE_PROJECT_DIR: fixture,
    VOID_AGENT_RUNTIME: runtime,
    VOID_GLOBAL_DIR: join(fixture, '.void', 'global'),
    VOID_MISSION_ID: missionId,
    VOID_PROJECT_ROOT: fixture,
  });
}

async function exerciseRuntime(runner, fixture, missionId, runtime) {
  const env = hookEnvironment(fixture, missionId, runtime);
  const payload = payloadFor(runtime, fixture);
  await run(process.execPath, [runner, 'activation', runtime], {
    cwd: fixture,
    env,
    input: JSON.stringify(payload),
    timeoutMs: HOOK_TIMEOUT_MS,
  });
  await run(process.execPath, [runner, 'enforce', 'no-console', runtime], {
    cwd: fixture,
    env,
    input: JSON.stringify(payload),
    timeoutMs: HOOK_TIMEOUT_MS,
  });
  const blocked = await run(
    process.execPath,
    [runner, 'enforce', 'dangerous-command', runtime],
    {
      cwd: fixture,
      env,
      input: JSON.stringify({
        ...payload,
        tool_name: runtime === 'claude' ? 'Bash' : 'shell',
        tool_input: { command: 'rm -rf /' },
      }),
      expectedCodes: [2],
      timeoutMs: HOOK_TIMEOUT_MS,
    },
  );
  requireDiagnostic(blocked, /DANGEROUS_COMMAND/, `${runtime} blocked command`);
  const invalid = await run(
    process.execPath,
    [runner, 'enforce', 'dangerous-command', runtime],
    {
      cwd: fixture,
      env,
      input: '{not-json}',
      expectedCodes: [2],
      timeoutMs: HOOK_TIMEOUT_MS,
    },
  );
  requireDiagnostic(invalid, /HOOK_INPUT_REJECTED/, `${runtime} invalid input`);
  const oversized = await run(
    process.execPath,
    [runner, 'enforce', 'dangerous-command', runtime],
    {
      cwd: fixture,
      env,
      input: Buffer.alloc(MAX_HOOK_INPUT_BYTES + 1, 0x61),
      expectedCodes: [2],
      timeoutMs: HOOK_TIMEOUT_MS,
    },
  );
  requireDiagnostic(
    oversized,
    /HOOK_RUNNER_FAILED: HOOK_INPUT_TOO_LARGE/,
    `${runtime} oversized input`,
  );
}

async function assertBrokenWiring(bin, fixture, mode, env) {
  const relativeManifest = mode === 'claude'
    ? join('.claude', 'settings.json')
    : join('.codex', 'hooks.json');
  const manifest = join(fixture, relativeManifest);
  const broken = `${manifest}.broken`;
  await rename(manifest, broken);
  try {
    const result = await run(process.execPath, [bin, 'doctor', '--no-remote'], {
      cwd: fixture,
      env,
      expectedCodes: [1],
    });
    requireDiagnostic(
      result,
      mode === 'claude' ? /settings\.json missing/ : /hooks\.json missing/,
      `${mode} broken wiring`,
    );
  } finally {
    await rename(broken, manifest);
  }
}

async function exerciseFixture(temporary, tarball, npmCache, mode) {
  const fixture = join(temporary, `fixture ${mode}`);
  await mkdir(fixture, { recursive: true });
  const env = childEnvironment({
    npm_config_cache: npmCache,
    npm_config_offline: 'true',
  });
  await run(
    npm.executable,
    [
      ...npm.prefixArguments,
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    { cwd: fixture, env },
  );
  const bin = join(
    fixture,
    'node_modules',
    'voidharness',
    'bin',
    'void-harness.mjs',
  );
  await requireRegularFile(bin, `${mode} installed CLI`);
  await writeFile(join(fixture, 'example.py'), 'print("safe")\n', 'utf8');
  await run(
    process.execPath,
    [bin, 'init', '--runtime', mode, '--no-interactive'],
    { cwd: fixture, env },
  );

  const runner = join(fixture, '.void', 'hooks', '_void-hook.mjs');
  await requireRegularFile(runner, `${mode} installed runner`);
  const runtimes = runtimesForMode(mode);
  const missionId = `mis_conformance_${mode}`;
  await Promise.all(
    runtimes.map((runtime) =>
      exerciseRuntime(runner, fixture, missionId, runtime),
    ),
  );

  const log = join(fixture, '.void', 'runs', missionId, 'events.jsonl');
  await requireRegularFile(log, `${mode} canonical event log`);
  assertCanonicalHookReplay(await readFile(log, 'utf8'), {
    missionId,
    runtimes,
  });

  await run(process.execPath, [bin, 'doctor', '--no-remote'], {
    cwd: fixture,
    env,
  });
  await assertBrokenWiring(bin, fixture, mode, env);
  await run(process.execPath, [bin, 'doctor', '--no-remote'], {
    cwd: fixture,
    env,
  });
}

const pnpm = packageManagerCommand('pnpm');
const npm = packageManagerCommand('npm');
const temporary = await mkdtemp(join(tmpdir(), 'void hook conformance-'));
try {
  const npmCache = join(temporary, 'npm-cache');
  await mkdir(npmCache, { recursive: true });
  await run(
    pnpm.executable,
    [
      ...pnpm.prefixArguments,
      '--filter',
      'voidharness',
      'pack',
      '--pack-destination',
      temporary,
    ],
    { cwd: REPO_ROOT, env: childEnvironment() },
  );
  const tarballName = (await readdir(temporary))
    .find((name) => name.endsWith('.tgz'));
  if (tarballName === undefined) {
    throw new Error('hook conformance pack produced no tarball');
  }
  const tarball = join(temporary, tarballName);
  for (const mode of ['claude', 'codex', 'both']) {
    await exerciseFixture(temporary, tarball, npmCache, mode);
  }
  process.stdout.write(
    `hook conformance passed (${process.platform}): claude, codex, both; installed tarball ${tarballName}\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
