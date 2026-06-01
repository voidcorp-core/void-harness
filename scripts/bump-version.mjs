#!/usr/bin/env node
// Lockstep version bumper for the void-harness marketplace.
//
// Reads the current version from .claude-plugin/marketplace.json (first
// plugin, which we treat as the source of truth) and writes a new version
// into every file that carries a plugin version:
//
//   - .claude-plugin/marketplace.json                          (every plugin)
//   - packages/core/.claude-plugin/plugin.json
//   - packages/packs/pack-monorepo/.claude-plugin/plugin.json
//   - packages/packs/pack-nextjs-pwa/.claude-plugin/plugin.json
//
// Usage:
//   node scripts/bump-version.mjs patch
//   node scripts/bump-version.mjs minor
//   node scripts/bump-version.mjs major
//   node scripts/bump-version.mjs 0.2.0   (explicit)
//
// CLI package (`packages/cli/package.json`) is versioned independently via
// changesets — this script does NOT touch it.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MARKETPLACE = resolve(ROOT, '.claude-plugin/marketplace.json');
const PLUGIN_MANIFESTS = [
  resolve(ROOT, 'packages/core/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-monorepo/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-react/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-nextjs/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-server/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-pwa/.claude-plugin/plugin.json'),
  resolve(ROOT, 'packages/packs/pack-mobile/.claude-plugin/plugin.json'),
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
  // Explicit version
  parseVersion(kind);
  return kind;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: bump-version.mjs <patch|minor|major|X.Y.Z>');
    process.exit(2);
  }

  const marketplace = await readJson(MARKETPLACE);
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    throw new Error('marketplace.json has no plugins[]');
  }
  const current = marketplace.plugins[0].version;
  if (!current) throw new Error('marketplace.json plugins[0].version is missing');

  const next = bump(current, arg);
  if (next === current) {
    // No-op for marketplace.json, but other manifests may still be drifted —
    // fall through and re-sync them all.
    console.log(`marketplace already at ${current}, ensuring plugin manifests are aligned`);
  } else {
    console.log(`bumping ${current} → ${next}`);
  }

  // Lockstep sanity check: warn if plugins disagree before bumping.
  const disagree = marketplace.plugins.filter((p) => p.version !== current);
  if (disagree.length > 0) {
    console.warn(
      `warning: marketplace plugins disagree on version. Forcing all to ${next}. Mismatched:`,
    );
    for (const p of disagree) console.warn(`  ${p.name}: ${p.version}`);
  }

  console.log(`bumping ${current} → ${next}`);

  // 1. marketplace.json
  for (const plugin of marketplace.plugins) plugin.version = next;
  await writeJson(MARKETPLACE, marketplace);
  console.log(`  ✓ ${MARKETPLACE.replace(ROOT + '/', '')}`);

  // 2. each plugin.json
  for (const path of PLUGIN_MANIFESTS) {
    if (!existsSync(path)) {
      console.warn(`  ! missing ${path}, skipped`);
      continue;
    }
    const manifest = await readJson(path);
    manifest.version = next;
    await writeJson(path, manifest);
    console.log(`  ✓ ${path.replace(ROOT + '/', '')}`);
  }

  console.log('');
  console.log(`next steps:`);
  console.log(`  1. Review the diff: git diff`);
  console.log(`  2. Commit: git commit -am "chore: release v${next}"`);
  console.log(`  3. Tag: git tag v${next}`);
  console.log(`  4. Push: git push && git push --tags`);
  console.log(`  5. Consumers refresh via /plugin marketplace update in Claude Code.`);
}

main().catch((err) => {
  console.error(`bump-version: ${err.message}`);
  process.exit(1);
});
