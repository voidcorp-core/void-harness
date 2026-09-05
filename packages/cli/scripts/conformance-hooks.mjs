#!/usr/bin/env node

import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conformanceArtifactFromEnvironment } from './conformance-artifact.mjs';
import {
  assertCanonicalHookReplay,
  runtimesForMode,
} from './conformance-hooks-lib.mjs';
import {
  conformanceFixtureEnvironment,
  packageManagerCommand,
  requireConformanceExit,
  runConformanceProcess,
} from './conformance-process.mjs';

const MAX_HOOK_INPUT_BYTES = 1024 * 1024;
const HOOK_TIMEOUT_MS = 5_000;

function requireDiagnostic(result, pattern, label) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (!pattern.test(output)) {
    throw new Error(`hook conformance ${label} lacked its expected diagnostic`);
  }
}

async function run(command, args, options) {
  const expectedCodes = options.expectedCodes ?? [0];
  const result = await runConformanceProcess({
    command,
    args,
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    timeoutMs: options.timeoutMs,
  });
  return requireConformanceExit(result, 'hook conformance command', expectedCodes);
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
  return conformanceFixtureEnvironment(fixture, {
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
  await mkdir(join(fixture, 'tmp'), { recursive: true });
  const env = conformanceFixtureEnvironment(fixture, {
    npm_config_cache: npmCache,
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

  const log = join(fixture, '.void', 'machine', 'runs', missionId, 'events.jsonl');
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

const npm = packageManagerCommand('npm');
const temporary = await mkdtemp(join(tmpdir(), 'void hook conformance-'));
try {
  const { manifest, tarball } = await conformanceArtifactFromEnvironment();
  const npmCache = join(temporary, 'npm-cache');
  await mkdir(npmCache, { recursive: true });
  for (const mode of ['claude', 'codex', 'both']) {
    await exerciseFixture(temporary, tarball, npmCache, mode);
  }
  process.stdout.write(
    `hook conformance passed (${process.platform}) for ${manifest.sourceSha}: claude, codex, both\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
