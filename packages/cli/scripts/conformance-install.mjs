#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { conformanceArtifactFromEnvironment } from './conformance-artifact.mjs';
import {
  conformanceFixtureEnvironment,
  packageManagerCommand,
  requireConformanceExit,
  runConformanceProcess,
} from './conformance-process.mjs';

async function run(label, command, args, cwd, env) {
  const result = await runConformanceProcess({ command, args, cwd, env });
  return requireConformanceExit(result, `install conformance ${label}`);
}

function requirePath(path, label) {
  if (!existsSync(path)) throw new Error(`conformance missing ${label}: ${path}`);
}

async function exerciseRuntime(temporary, tarball, runtime) {
  const fixture = join(temporary, `fixture-${runtime}`);
  await mkdir(join(fixture, 'tmp'), { recursive: true });
  const environment = conformanceFixtureEnvironment(fixture);
  const npm = packageManagerCommand('npm');
  const started = performance.now();
  await run(
    `${runtime} install`,
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
    fixture,
    environment,
  );
  const bin = join(fixture, 'node_modules', 'voidharness', 'bin', 'void-harness.mjs');
  await run(
    `${runtime} init`,
    process.execPath,
    [bin, 'init', '--runtime', runtime, '--no-interactive'],
    fixture,
    environment,
  );

  requirePath(join(fixture, '.void', 'machine', 'receipts', 'install-v1.json'), `${runtime} receipt`);
  requirePath(join(fixture, '.void', 'hooks', '_void-hook.mjs'), `${runtime} hook runner`);
  if (runtime !== 'codex') {
    requirePath(join(fixture, '.claude', 'skills', 'void-tdd', 'SKILL.md'), `${runtime} Claude skill`);
    requirePath(join(fixture, '.claude', 'agents', 'doctrine-critic.md'), `${runtime} Claude agent`);
  }
  if (runtime !== 'claude') {
    requirePath(join(fixture, '.agents', 'skills', 'void-tdd', 'SKILL.md'), `${runtime} Codex skill`);
    requirePath(join(fixture, '.codex', 'hooks.json'), `${runtime} Codex hooks`);
  }

  const skillRoot = runtime === 'codex' ? '.agents' : '.claude';
  const adjacent = join(fixture, skillRoot, 'skills', 'private', 'SKILL.md');
  await mkdir(dirname(adjacent), { recursive: true });
  await writeFile(adjacent, '# private user skill\n');
  await run(
    `${runtime} update`,
    process.execPath,
    [bin, 'init', '--runtime', runtime, '--no-interactive'],
    fixture,
    environment,
  );
  if ((await readFile(adjacent, 'utf8')) !== '# private user skill\n') {
    throw new Error(`${runtime} update changed an adjacent user file`);
  }
  return performance.now() - started;
}

const { manifest, tarball } = await conformanceArtifactFromEnvironment();
const temporary = await mkdtemp(join(tmpdir(), 'void-install-conformance-'));
try {
  const durations = [];
  for (const runtime of ['claude', 'codex', 'both']) {
    durations.push(await exerciseRuntime(temporary, tarball, runtime));
  }
  durations.sort((left, right) => left - right);
  const medianMs = Math.round(durations[Math.floor(durations.length / 2)] ?? 0);
  process.stdout.write(
    `install conformance passed (${process.platform}) for ${manifest.sourceSha}; observed p50 ${medianMs}ms\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
