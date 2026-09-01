/**
 * A filtered run must never judge differently from the full suite.
 *
 * `pnpm test` runs the root `vitest.config.ts` over every package at once.
 * `pnpm --filter <pkg> test` runs the package's own configuration and never
 * reads the root one: a package that declares its own `test:` block inherits
 * nothing from the root, and a package that declares none falls back to
 * vitest's own defaults. Either way the root value does not travel. CI runs the
 * filtered form on `harness-graph` (`.github/workflows/ci.yml`, "ProjectGraph
 * tests"), and anyone debugging one package runs it on any of them.
 *
 * `harness-graph` paid for that on PR #168. The same test passed under
 * `pnpm test` at the root's 10s limit and expired under the filtered run at
 * vitest's 5s default. The failures followed machine speed, so `build.test.ts`
 * reported 6, then 11, then 7 failures out of 48 while the full suite stayed
 * green, and the divergence read as flakiness for several rounds before anyone
 * looked at the configuration.
 *
 * The limit is therefore duplicated per package rather than factored into a
 * shared module, and this test is what makes the duplication safe: the only
 * real cost of duplicating one number is silent drift, and drift is exactly
 * what a mechanical comparison removes. A shared file that every package
 * imports to set a single option would add a repository-root dependency to
 * each package configuration and would still need this test, since a package
 * can always override what it imports.
 *
 * Two things keep the comparison honest. It enumerates from the package
 * manifests rather than from a list of configuration files, so a package that
 * runs vitest through `vite.config.ts`, or through no configuration at all, is
 * judged like the others. And it compares the *effective* limit: a
 * configuration that declares nothing is not in agreement with a root that
 * declares 10s, it silently runs at vitest's default.
 *
 * One test that genuinely needs longer is not a reason to raise one package
 * and diverge again. Vitest takes a per-test limit, `it(name, fn, timeout)`,
 * which is local, visible at the assertion, and identical under both runs.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Vitest's own fallback when a configuration declares no `testTimeout`.
 * vitest 4.1.9, `TestOptions.testTimeout`: "Default timeout of a test in
 * milliseconds, @default 5000".
 */
const VITEST_DEFAULT_TIMEOUT_MS = 5_000;

/** The configuration files vitest loads, in the order it prefers them. */
const CONFIG_CANDIDATES = ['vitest.config.ts', 'vite.config.ts'];

/** Every workspace manifest, the repository root included. */
function manifests(): readonly string[] {
  return ['package.json', ...globSync('{packages,apps}/*/package.json', { cwd: ROOT })].sort();
}

/** The scripts a manifest declares, empty when it declares none. */
function scriptsOf(manifest: string): Record<string, string> {
  const parsed: { scripts?: Record<string, string> } = JSON.parse(
    readFileSync(join(ROOT, manifest), 'utf8'),
  );
  return parsed.scripts ?? {};
}

/** The directory of every package a filtered `pnpm --filter <pkg> test` runs. */
function packagesRunningVitest(): readonly string[] {
  return manifests()
    .filter((manifest) => (scriptsOf(manifest).test ?? '').includes('vitest'))
    .map((manifest) => dirname(manifest));
}

/** The configuration a run inside this directory loads, when there is one. */
function configurationOf(directory: string): string | undefined {
  return CONFIG_CANDIDATES.map((candidate) => join(directory, candidate)).find((path) =>
    existsSync(join(ROOT, path)),
  );
}

/** The limit a run inside this directory actually applies to one test. */
async function effectiveTimeoutMs(directory: string): Promise<number> {
  const configuration = configurationOf(directory);
  if (configuration === undefined) return VITEST_DEFAULT_TIMEOUT_MS;
  const loaded: { default?: { test?: { testTimeout?: number } } } = await import(
    pathToFileURL(join(ROOT, configuration)).href
  );
  return loaded.default?.test?.testTimeout ?? VITEST_DEFAULT_TIMEOUT_MS;
}

/** How a directory reads in a failure, so the offender names its own file. */
function label(directory: string, timeoutMs: number): string {
  return `${configurationOf(directory) ?? `${directory} (no configuration)`}: ${timeoutMs}ms`;
}

describe('suite timeout agreement', () => {
  it('enumerates the repository root and every package that runs vitest alone', () => {
    const directories = packagesRunningVitest();
    expect(directories).toContain('.');
    expect(directories.filter((directory) => directory !== '.').length).toBeGreaterThan(0);
  });

  it('declares an explicit limit at the root, so the comparison has an anchor', async () => {
    const loaded: { default?: { test?: { testTimeout?: number } } } = await import(
      pathToFileURL(join(ROOT, 'vitest.config.ts')).href
    );
    expect(typeof loaded.default?.test?.testTimeout).toBe('number');
  });

  it('applies the root limit to every package run in isolation', async () => {
    const directories = packagesRunningVitest();
    const rootTimeoutMs = await effectiveTimeoutMs('.');
    const measured = await Promise.all(
      directories.map(async (directory) => label(directory, await effectiveTimeoutMs(directory))),
    );
    expect(measured).toEqual(directories.map((directory) => label(directory, rootTimeoutMs)));
  });
});
