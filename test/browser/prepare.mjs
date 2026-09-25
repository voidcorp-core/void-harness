// Source-only CI setup. Never consumes a developer's exported HTML or browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PRODUCT_IDENTITY } from '../../scripts/product-identity.mjs';
import { conformanceArtifactFromEnvironment } from '../../packages/cli/scripts/conformance-artifact.mjs';
import {
  conformanceFixtureEnvironment,
  runConformanceStep,
} from '../../packages/cli/scripts/conformance-process.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'browser fixture generation belongs on GitHub CI');
assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required');
const root = resolve(process.env.RUNNER_TEMP, 'cheatsheet-fixture');
const { manifest, tarball } = await conformanceArtifactFromEnvironment();
assert.equal(manifest.sourceSha, process.env.GATE_SHA);
await mkdir(root);
const installation = join(root, 'package');
await mkdir(join(installation, 'tmp'), { recursive: true });
// npm's --package-lock=false and --ignore-scripts keep this disposable installation inert.
// https://docs.npmjs.com/cli/v11/commands/npm-install/
await runConformanceStep('browser fixture package install', {
  command: 'npm',
  args: ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--no-save', '--package-lock=false', tarball],
  cwd: installation,
  env: conformanceFixtureEnvironment(installation),
});
const bin = join(installation, 'node_modules', PRODUCT_IDENTITY.packageName, 'bin', `${PRODUCT_IDENTITY.commands.primary}.mjs`);
const documents = {};
for (const name of ['absent', 'installed']) {
  const cwd = join(root, name);
  await mkdir(join(cwd, 'tmp'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), '{"name":"synthetic-consumer","private":true}\n');
  const env = conformanceFixtureEnvironment(cwd);
  const run = (args) => runConformanceStep('browser fixture CLI', {
    command: process.execPath, args: [bin, ...args], cwd, env,
  });
  if (name === 'installed') {
    await run(['init', '--runtime', 'both', '--no-interactive']);
    await writeFile(join(cwd, '.claude', 'settings.local.json'),
      '{"skillOverrides":{"void-tdd":"off"}}\n', { flag: 'wx' });
  }
  const exported = await run(['cheatsheet', '--format', 'json']);
  const document = JSON.parse(exported.stdout);
  assert.equal(document.installation, name);
  assert.ok(document.entries.length > 0);
  const html = (await run(['cheatsheet'])).stdout;
  assert.ok(html.startsWith('<!doctype html>'));
  assert.equal(html.includes(root), false, 'export must not leak fixture paths');
  await writeFile(join(root, `${name}.json`), exported.stdout);
  await writeFile(join(root, `${name}.html`), html);
  documents[name] = {
    entries: document.entries.length,
    htmlSha256: createHash('sha256').update(html).digest('hex'),
    jsonSha256: createHash('sha256').update(exported.stdout).digest('hex'),
  };
}
const tooling = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
await writeFile(join(root, 'evidence.json'), `${JSON.stringify({
  ...manifest, documents, tooling: { ...tooling.dependencies, ...tooling.overrides },
}, undefined, 2)}\n`);
process.stdout.write(`browser fixtures generated from ${manifest.sourceSha}\n`);
