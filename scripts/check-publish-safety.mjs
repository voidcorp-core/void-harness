#!/usr/bin/env node
// Publish safety: fail if any publishable package.json uses the `workspace:`
// protocol in a dependency field.
//
// Internal @voidcorp/* deps must use explicit ^ ranges (kept current by
// bump-version.mjs) so the published npm tarball is correct regardless of the
// publish tool. `npm pack`/`npm publish` do NOT rewrite the workspace protocol,
// so a leaked `workspace:` would ship a broken package. This gate makes that a
// hard failure instead of a runtime surprise for consumers.
//
// Run by the `release` script (before publish) and in CI.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// Packages that publish to npm (mirror NPM_PACKAGES in bump-version.mjs).
const PACKAGES = [
  'packages/cli',
  'packages/packs/pack-monorepo',
  'packages/packs/pack-nextjs',
];

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const failures = [];

for (const rel of PACKAGES) {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, rel, 'package.json'), 'utf8'));
  for (const field of DEP_FIELDS) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (String(range).startsWith('workspace:')) {
        failures.push(`${rel}: ${field}.${name} = "${range}"`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('check-publish-safety: workspace: protocol found in a publishable package.json:');
  for (const f of failures) console.error(`  ${f}`);
  console.error('Use an explicit ^ range (bump-version.mjs keeps it current); workspace: leaks to npm.');
  process.exit(1);
}

console.log(`check-publish-safety: ${PACKAGES.length} package(s) clean, no workspace: protocol.`);
