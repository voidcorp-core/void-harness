#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packageManagerCommand,
  resolveConformanceTarball,
  runConformanceProcess,
  safeConformanceDiagnostic,
} from './conformance-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

async function run(command, args, cwd, env = {}) {
  const result = await runConformanceProcess({ command, args, cwd, environment: env });
  if (
    result.outcome.kind === 'exited'
    && result.outcome.code === 0
    && !result.outputExceeded
  ) return;
  const detail = safeConformanceDiagnostic(`${result.stdout}\n${result.stderr}`.trim());
  throw new Error([
    `install conformance command failed: ${result.outcome.kind}`,
    result.outputExceeded ? 'output limit exceeded' : undefined,
    detail === '' ? undefined : detail,
  ].filter(Boolean).join('\n'));
}

function requirePath(path, label) {
  if (!existsSync(path)) throw new Error(`conformance missing ${label}: ${path}`);
}

const temporary = await mkdtemp(join(tmpdir(), 'void-install-conformance-'));
const npmCache = join(temporary, 'npm-cache');
const pnpm = packageManagerCommand('pnpm');
const npm = packageManagerCommand('npm');
try {
  await mkdir(npmCache, { recursive: true });
  const externalTarball = resolveConformanceTarball();
  if (externalTarball === undefined) {
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
      REPO_ROOT,
    );
  }
  const packedName = externalTarball === undefined
    ? (await readdir(temporary)).find((name) => name.endsWith('.tgz'))
    : undefined;
  if (externalTarball === undefined && packedName === undefined) {
    throw new Error('conformance pack produced no tarball');
  }
  const tarball = externalTarball ?? join(temporary, packedName);
  const tarballName = basename(tarball);
  const durations = [];

  for (const runtime of ['claude', 'codex', 'both']) {
    const fixture = join(temporary, `fixture-${runtime}`);
    await mkdir(fixture, { recursive: true });
    const started = performance.now();
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
      fixture,
      { npm_config_cache: npmCache },
    );
    const bin = join(fixture, 'node_modules', 'voidharness', 'bin', 'void-harness.mjs');
    await run(process.execPath, [bin, 'init', '--runtime', runtime, '--no-interactive'], fixture);
    durations.push(performance.now() - started);

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

    const adjacent = join(fixture, runtime === 'codex' ? '.agents' : '.claude', 'skills', 'private', 'SKILL.md');
    await mkdir(dirname(adjacent), { recursive: true });
    await writeFile(adjacent, '# private user skill\n');
    await run(process.execPath, [bin, 'init', '--runtime', runtime, '--no-interactive'], fixture);
    if ((await readFile(adjacent, 'utf8')) !== '# private user skill\n') {
      throw new Error(`${runtime} update changed an adjacent user file`);
    }
  }

  durations.sort((a, b) => a - b);
  const medianMs = durations[Math.floor(durations.length / 2)] ?? Number.POSITIVE_INFINITY;
  if (medianMs >= 60_000) throw new Error(`local install TTHW p50 ${Math.round(medianMs)}ms exceeds 60s`);
  process.stdout.write(
    `install conformance passed (${process.platform}): claude, codex, both; p50 ${Math.round(medianMs)}ms; tarball ${tarballName}\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
