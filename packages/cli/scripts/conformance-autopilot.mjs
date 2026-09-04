#!/usr/bin/env node

// Does autopilot exist for someone who installed the package?
//
// Every other proof in this repository runs against the monorepo: the skill is
// read from `packages/core`, the command from `src/commands`, the workflow from
// a path that only exists here. All of it can be green while the published
// tarball ships none of it — a source-only success is exactly the false green
// this script exists to catch.
//
// So it receives the exact packed artifact, installs it into a throwaway project, and asks the
// consumer would: is the skill there for my runtime, is the command routed, does
// the CLI compute without a network, and is the retired surface really gone. It
// asserts on the INSTALLED tree, never on this repository.
//
// It contacts nothing. `autopilot plan` is pure computation over stdin, which is
// what makes a consumer-side proof possible at all without a tracker.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conformanceArtifactFromEnvironment } from './conformance-artifact.mjs';
import {
  conformanceFixtureEnvironment,
  packageManagerCommand,
  requireConformanceExit,
  runConformanceProcess,
} from './conformance-process.mjs';

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
const npm = packageManagerCommand('npm');

try {
  const { manifest, tarball } = await conformanceArtifactFromEnvironment();

  for (const runtime of ['claude', 'codex']) {
    const fixture = join(temporary, `consumer-${runtime}`);
    await mkdir(join(fixture, 'tmp'), { recursive: true });
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
    const environment = conformanceFixtureEnvironment(fixture);

    const installed = await runConformanceProcess({
      command: npm.executable,
      args: [
        ...npm.prefixArguments,
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        tarball,
      ],
      cwd: fixture,
      env: environment,
    });
    requireConformanceExit(installed, `autopilot conformance ${runtime} install`);

    const bin = join(fixture, 'node_modules', 'voidharness', 'bin', 'void-harness.mjs');
    const init = await runConformanceProcess({
      command: process.execPath,
      args: [bin, 'init', '--runtime', runtime, '--no-interactive'],
      cwd: fixture,
      env: environment,
    });
    requireConformanceExit(init, `autopilot conformance ${runtime} init`);

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
    const help = await runConformanceProcess({
      command: process.execPath,
      args: [bin, 'autopilot', '--help'],
      cwd: fixture,
      env: environment,
    });
    requireConformanceExit(help, 'autopilot --help');
    if (!help.stdout.includes('autopilot')) fail('autopilot --help printed no usage');

    const planned = await runConformanceProcess({
      command: process.execPath,
      args: [bin, 'autopilot', 'plan', '--json'],
      cwd: fixture,
      env: environment,
      input: OBSERVATION,
    });
    requireConformanceExit(planned, 'autopilot plan');
    const plan = JSON.parse(planned.stdout);
    if (plan.schemaVersion !== 1) fail(`autopilot plan returned schemaVersion ${plan.schemaVersion}`);
    if (!Array.isArray(plan.cluster) || plan.cluster.length === 0) {
      fail('autopilot plan produced no cluster from two independent ready tickets');
    }

    // Merging is a human gate on the consumer's machine too, not only here.
    const armed = await runConformanceProcess({
      command: process.execPath,
      args: [bin, 'autopilot', 'plan', '--auto-merge'],
      cwd: fixture,
      env: environment,
      input: OBSERVATION,
    });
    if (armed.outcome.kind !== 'exited' || armed.outcome.code === 0) {
      fail('the installed CLI did not refuse --auto-merge with a non-zero exit');
    }

    const retired = await runConformanceProcess({
      command: process.execPath,
      args: [bin, 'backlog-autopilot'],
      cwd: fixture,
      env: environment,
    });
    if (retired.outcome.kind !== 'exited' || retired.outcome.code === 0) {
      fail('the installed CLI did not refuse the retired command with a non-zero exit');
    }

    process.stdout.write(`autopilot conformance passed for ${runtime}.\n`);
  }

  process.stdout.write(
    `autopilot conformance passed (${process.platform}) for ${manifest.sourceSha}.\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
