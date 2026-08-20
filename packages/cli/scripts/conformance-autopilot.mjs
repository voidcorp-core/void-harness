#!/usr/bin/env node

// Does autopilot exist for someone who installed the package?
//
// Every other proof in this repository runs against the monorepo: the skill is
// read from `packages/core`, the command from `src/commands`, the workflow from
// a path that only exists here. All of it can be green while the published
// tarball ships none of it — a source-only success is exactly the false green
// this script exists to catch.
//
// So it packs, installs into a throwaway project, and asks the questions a
// consumer would: is the skill there for my runtime, is the command routed, does
// the CLI compute without a network, and is the retired surface really gone. It
// asserts on the INSTALLED tree, never on this repository.
//
// It contacts nothing. `autopilot plan` is pure computation over stdin, which is
// what makes a consumer-side proof possible at all without a tracker.

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerCommand } from './conformance-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

function run(command, args, cwd, { stdin = '', env = {} } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', rejectRun);
    child.once('close', (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

function fail(message) {
  throw new Error(`autopilot conformance: ${message}`);
}

function requirePath(path, label) {
  if (!existsSync(path)) fail(`the installed tree has no ${label} (${path})`);
}

/** A candidate observation the CLI can plan from, with no tracker involved. */
const OBSERVATION = JSON.stringify({
  schemaVersion: 1,
  tickets: [
    { id: 'DEV-1', ready: true, priority: 2, boardOrder: 0, blockedByOpen: false, dependsOn: [], estimate: 3 },
    { id: 'DEV-2', ready: true, priority: 2, boardOrder: 1, blockedByOpen: false, dependsOn: [], estimate: 3 },
  ],
  footprints: [
    { id: 'DEV-1', areas: ['src/a'], highRisk: false, confidence: 0.9 },
    { id: 'DEV-2', areas: ['src/b'], highRisk: false, confidence: 0.9 },
  ],
});

const temporary = await mkdtemp(join(tmpdir(), 'void-autopilot-conformance-'));
const npmCache = join(temporary, 'npm-cache');
const pnpm = packageManagerCommand('pnpm');
const npm = packageManagerCommand('npm');

try {
  await mkdir(npmCache, { recursive: true });
  const packed = await run(
    pnpm.executable,
    [...pnpm.prefixArguments, '--filter', 'voidharness', 'pack', '--pack-destination', temporary],
    REPO_ROOT,
  );
  if (packed.code !== 0) fail(`pack exited ${packed.code}\n${packed.stderr}`);
  const tarballName = (await readdir(temporary)).find((name) => name.endsWith('.tgz'));
  if (tarballName === undefined) fail('pack produced no tarball');

  for (const runtime of ['claude', 'codex']) {
    const fixture = join(temporary, `consumer-${runtime}`);
    await mkdir(fixture, { recursive: true });
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));

    const installed = await run(
      npm.executable,
      [...npm.prefixArguments, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, tarballName)],
      fixture,
      { env: { npm_config_cache: npmCache } },
    );
    if (installed.code !== 0) fail(`install exited ${installed.code}\n${installed.stderr}`);

    const bin = join(fixture, 'node_modules', 'voidharness', 'bin', 'void-harness.mjs');
    const init = await run(process.execPath, [bin, 'init', '--runtime', runtime, '--no-interactive'], fixture);
    if (init.code !== 0) fail(`init exited ${init.code} for ${runtime}\n${init.stderr}`);

    // The skill and its adapter, in the directory this runtime actually reads.
    const home = runtime === 'codex' ? '.agents' : '.claude';
    requirePath(join(fixture, home, 'skills', 'void-autopilot', 'SKILL.md'), `${runtime} autopilot skill`);
    requirePath(
      join(fixture, home, 'skills', 'void-autopilot', 'workflows', 'autopilot.workflow.js'),
      `${runtime} autopilot workflow`,
    );
    // No `.claude/commands/` assertion. Claude Code merged custom commands into
    // skills, and the install stopped writing that directory at all — a command
    // file was Claude-only while the harness targets three runtimes.

    // The retired surface must be gone from the shipped assets too, not only
    // from the source tree — a stale bundled asset is the failure mode a green
    // source suite cannot see.
    for (const stale of [
      join(fixture, home, 'skills', 'backlog-autopilot'),
      join(fixture, home, 'skills', 'autopilot'),
      join(fixture, '.claude', 'commands'),
    ]) {
      if (existsSync(stale)) fail(`the installed tree still ships the retired surface (${stale})`);
    }

    const skill = await readFile(join(fixture, home, 'skills', 'void-autopilot', 'SKILL.md'), 'utf8');
    if (/packages\/core|packages\/cli/.test(skill)) {
      fail(`${runtime} skill references a monorepo path, so it was not written for a consumer`);
    }
    if (/in construction/i.test(skill)) fail(`${runtime} skill still announces itself as unfinished`);

    // The CLI computes, offline, from the installed package.
    const help = await run(process.execPath, [bin, 'autopilot', '--help'], fixture);
    if (help.code !== 0) fail(`autopilot --help exited ${help.code}\n${help.stderr}`);
    if (!help.stdout.includes('autopilot')) fail('autopilot --help printed no usage');

    const planned = await run(process.execPath, [bin, 'autopilot', 'plan', '--json'], fixture, {
      stdin: OBSERVATION,
    });
    if (planned.code !== 0) fail(`autopilot plan exited ${planned.code}\n${planned.stderr}`);
    const plan = JSON.parse(planned.stdout);
    if (plan.schemaVersion !== 1) fail(`autopilot plan returned schemaVersion ${plan.schemaVersion}`);
    if (!Array.isArray(plan.cluster) || plan.cluster.length === 0) {
      fail('autopilot plan produced no cluster from two independent ready tickets');
    }

    // Merging is a human gate on the consumer's machine too, not only here.
    const armed = await run(process.execPath, [bin, 'autopilot', 'plan', '--auto-merge'], fixture, {
      stdin: OBSERVATION,
    });
    if (armed.code === 0) fail('the installed CLI accepted --auto-merge');

    const retired = await run(process.execPath, [bin, 'backlog-autopilot'], fixture);
    if (retired.code === 0) fail('the installed CLI still answers the retired command');

    process.stdout.write(`autopilot conformance passed for ${runtime}.\n`);
  }

  process.stdout.write(`autopilot conformance passed (${process.platform}) from ${tarballName}.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
