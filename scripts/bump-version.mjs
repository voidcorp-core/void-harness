#!/usr/bin/env node
// Lockstep version bumper for void-harness. Pre-1.0, ONE version governs
// everything: each plugin's plugin.json, each npm package
// in packages/. CLI, runtime helpers, and Claude Code skills ship together.
//
// Files touched (any that exist):
//   - packages/core/.claude-plugin/plugin.json
//   - packages/packs/<pack>/.claude-plugin/plugin.json         (six packs)
//   - packages/cli/package.json                                (npm)
//   - packages/packs/<pack>/package.json                       (npm — three current)
//
// Usage:
//   node scripts/bump-version.mjs patch
//   node scripts/bump-version.mjs minor
//   node scripts/bump-version.mjs major
//   node scripts/bump-version.mjs 0.6.0   (explicit)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');


const PLUGIN_MANIFESTS = [
  resolve(ROOT, 'packages/core/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-monorepo/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-react/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-nextjs/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-server/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-pwa/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-mobile/.claude-plugin/plugin.json'),
];

const NPM_PACKAGES = [
  resolve(ROOT, 'packages/cli/package.json'),
  // harness-graph is a versioned, publishable package (the CLI depends on it via workspace:*);
  // release-please + version:check track it, so the manual fallback bump must too.
  resolve(ROOT, 'packages/harness-graph/package.json'),
  resolve(ROOT, 'packages/packs/pack-monorepo/package.json'),
  resolve(ROOT, 'packages/packs/pack-nextjs/package.json'),
  // pack-react / pack-server / pack-pwa / pack-mobile are skill-only packs
  // (no npm package.json yet). When they grow runtime code, add them here.
];

// The frozen certification manifest is keyed by `harnessVersion` (the only
// version-bearing field in it). It is a DERIVED artifact, but its single version
// stamp must move in lockstep so `certification:check` passes after a bump —
// otherwise every release breaks CI until someone remembers to rebuild. Both the
// source and the shipped core-assets mirror carry it. release-please bumps these
// via extra-files ($.harnessVersion); this manual fallback mirrors that.
const CERTIFICATION_FILES = [
  resolve(ROOT, 'packages/harness-graph/certification.json'),
  resolve(ROOT, 'packages/cli/core-assets/data/certification.json'),
];

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`not a M.m.p semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function bump(current, kind) {
  const [maj, min, patch] = parseVersion(current);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${patch + 1}`;
  parseVersion(kind);   // validate explicit version
  return kind;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function setVersion(path, next, label) {
  if (!existsSync(path)) {
    console.warn(`  ! missing ${label}, skipped`);
    return;
  }
  const json = await readJson(path);
  json.version = next;
  await writeJson(path, json);
  console.log(`  ✓ ${label}`);
}

async function setHarnessVersion(path, next, label) {
  if (!existsSync(path)) {
    console.warn(`  ! missing ${label}, skipped`);
    return;
  }
  const json = await readJson(path);
  json.harnessVersion = next;
  await writeJson(path, json);
  console.log(`  ✓ ${label} (harnessVersion)`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: bump-version.mjs <patch|minor|major|X.Y.Z>');
    process.exit(2);
  }

  const core = await readJson(PLUGIN_MANIFESTS[0]);
  const current = core.version;
  if (!current) throw new Error('packages/core plugin.json version is missing');

  const next = bump(current, arg);
  if (next === current) {
    console.log(`already at ${current}, ensuring all manifests aligned`);
  } else {
    console.log(`bumping ${current} → ${next}`);
  }

  // 1. each plugin manifest
  for (const path of PLUGIN_MANIFESTS) {
    await setVersion(path, next, path.replace(ROOT + '/', ''));
  }

  // 2. each npm package.json (CLI + runtime packs)
  for (const path of NPM_PACKAGES) {
    await setVersion(path, next, path.replace(ROOT + '/', ''));
  }

  // 3. the certification manifest's harnessVersion stamp (source + mirror)
  for (const path of CERTIFICATION_FILES) {
    await setHarnessVersion(path, next, path.replace(ROOT + '/', ''));
  }

  console.log('');
  console.log(`next steps:`);
  console.log(`  1. Review the diff: git diff`);
  console.log(`  2. Commit: git commit -am "chore: release v${next}"`);
  console.log(`  3. Tag: git tag v${next}`);
  console.log(`  4. Push: git push && git push --tags`);
  console.log(`  5. (when npm publishing) pnpm -r --filter './packages/**' publish`);
  console.log(`  6. Consumers refresh via void-harness update.`);
}

main().catch((err) => {
  console.error(`bump-version: ${err.message}`);
  process.exit(1);
});
