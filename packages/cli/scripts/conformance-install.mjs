#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerCommand } from './conformance-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const PACKAGE_ROOT = resolve(HERE, '..');

async function run(command, args, cwd, env = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function requireFailure(command, args, cwd, expected) {
  try {
    await run(command, args, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expected.test(message)) throw error;
    return;
  }
  throw new Error(`${command} ${args.join(' ')} unexpectedly succeeded`);
}

function requirePath(path, label) {
  if (!existsSync(path)) throw new Error(`conformance missing ${label}: ${path}`);
}

const temporary = await mkdtemp(join(tmpdir(), 'void-install-conformance-'));
const npmCache = join(temporary, 'npm-cache');
const pnpm = packageManagerCommand('pnpm');
const npm = packageManagerCommand('npm');
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
  REPO_ROOT,
);
const tarballName = (await readdir(temporary)).find((name) => name.endsWith('.tgz'));
if (tarballName === undefined) throw new Error('conformance pack produced no tarball');
const tarball = join(temporary, tarballName);
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
    requirePath(join(fixture, '.claude', 'skills', 'tdd', 'SKILL.md'), `${runtime} Claude skill`);
    requirePath(join(fixture, '.claude', 'agents', 'doctrine-critic.md'), `${runtime} Claude agent`);
  }
  if (runtime !== 'claude') {
    requirePath(join(fixture, '.agents', 'skills', 'tdd', 'SKILL.md'), `${runtime} Codex skill`);
    requirePath(join(fixture, '.codex', 'hooks.json'), `${runtime} Codex hooks`);
  }

  // Regression: 3.0.0 forwarded update's public --force to generic init,
  // replacing project path scopes, while a parked receipt with exact hashes was
  // ignored and left retired skills loading beside their replacements.
  const configPath = join(fixture, '.void', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const customBusiness = ['apps/*/src/**', 'packages/*/src/**'];
  config.paths.business = customBusiness;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const activeReceipt = JSON.parse(
    await readFile(join(fixture, '.void', 'machine', 'receipts', 'install-v1.json'), 'utf8'),
  );
  const manifestRecoveredPath = runtime === 'codex'
    ? '.codex/agents/solution-architect.toml'
    : '.claude/agents/solution-architect.md';
  activeReceipt.files = activeReceipt.files.filter((file) => file.path !== manifestRecoveredPath);
  await writeFile(
    join(fixture, '.void', 'machine', 'receipts', 'install-v1.json'),
    `${JSON.stringify(activeReceipt, null, 2)}\n`,
  );
  const retiredPath = runtime === 'codex'
    ? '.agents/skills/retired-v2/SKILL.md'
    : '.claude/skills/retired-v2/SKILL.md';
  const retiredAbsolute = join(fixture, ...retiredPath.split('/'));
  const retiredContent = Buffer.from('# retired v2 skill\n');
  await mkdir(dirname(retiredAbsolute), { recursive: true });
  await writeFile(retiredAbsolute, retiredContent);
  const retiredMode = (await stat(retiredAbsolute)).mode & 0o777;
  await writeFile(
    join(fixture, '.void', 'machine', 'receipts', 'install-v1.json.legacy'),
    `${JSON.stringify({
      schemaVersion: 1,
      version: '2.5.1',
      source: 'local',
      runtimes: activeReceipt.runtimes,
      files: [{
        path: retiredPath,
        sha256: createHash('sha256').update(retiredContent).digest('hex'),
        mode: retiredMode,
      }],
    }, null, 2)}\n`,
  );

  const forceConflictPath = runtime === 'codex'
    ? '.codex/agents/migration-planner.toml'
    : '.claude/agents/migration-planner.md';
  const forceConflictAbsolute = join(fixture, ...forceConflictPath.split('/'));
  const localConflict = '# project-owned collision\n';
  await writeFile(forceConflictAbsolute, localConflict);

  await requireFailure(process.execPath, [bin, 'update'], fixture, /unowned asset conflict/);
  if ((await readFile(forceConflictAbsolute, 'utf8')) !== localConflict) {
    throw new Error(`${runtime} update without force changed an unowned managed asset`);
  }
  const configAfterRefusal = JSON.parse(await readFile(configPath, 'utf8'));
  if (JSON.stringify(configAfterRefusal.paths.business) !== JSON.stringify(customBusiness)) {
    throw new Error(`${runtime} refused update replaced project business paths`);
  }

  await run(process.execPath, [bin, 'update', '--force'], fixture);
  const updatedConfig = JSON.parse(await readFile(configPath, 'utf8'));
  if (JSON.stringify(updatedConfig.paths.business) !== JSON.stringify(customBusiness)) {
    throw new Error(`${runtime} forced update replaced project business paths`);
  }
  if (existsSync(retiredAbsolute)) {
    throw new Error(`${runtime} forced update kept an exact receipt-owned retired asset`);
  }
  if ((await readFile(forceConflictAbsolute, 'utf8')) === localConflict) {
    throw new Error(`${runtime} forced update kept an unowned managed asset conflict`);
  }
  const recoveredReceipt = JSON.parse(
    await readFile(join(fixture, '.void', 'machine', 'receipts', 'install-v1.json'), 'utf8'),
  );
  if (!recoveredReceipt.files.some((file) => file.path === manifestRecoveredPath)) {
    throw new Error(`${runtime} update did not recover ownership from its exact manifest`);
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
