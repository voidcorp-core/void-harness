/**
 * A green suite is an absolute proof, so nothing may re-roll it.
 *
 * `docs/specs/2026-08-31-autonomous-until-develop.md` makes "the full suite
 * passed on the final tree" a proof whose refutation stops an unattended run
 * outright, with no debt path out. That only holds while a failure means a
 * defect. A runner that re-runs a failed test until it passes converts the
 * absolute proof into a probabilistic one: the chain would still stop, but
 * nobody could read what the stop meant.
 *
 * It is also the shape the pressure takes. Five files flaked in two days on
 * 2026-08-30 and 2026-08-31, and the cheapest way to make them stop was always
 * one line of configuration. Both were design defects that load merely revealed
 * -- an assertion on OS scheduling, an observation that never synchronised with
 * its event stream -- and one line would have hidden both.
 *
 * So the rule is mechanical rather than remembered: no test configuration this
 * repository ships, and no command it runs in CI, retries a failing test.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A vitest option that re-runs a failing test, whatever the value. */
const RETRY_OPTION = /(^|[^\w$.'"])retry\s*:/;

/** Asking a test command to re-run its failures from the command line. */
const RETRY_FLAG = /--retry[\s=]/;

/** Marketplace actions whose whole purpose is re-running a failed step. */
const RETRY_ACTIONS = /uses:\s*(nick-fields\/retry|Wandalen\/wretry)/;

/** Every test configuration that governs this repository's own suite. */
function suiteConfigurations(): readonly string[] {
  return globSync(['vitest.config.ts', '{packages,apps}/*/vitest.config.ts'], { cwd: ROOT });
}

/** Every workflow that CI runs on a push or a pull request. */
function workflows(): readonly string[] {
  return globSync('.github/workflows/*.yml', { cwd: ROOT });
}

/** The package scripts that run tests, where a retry flag would hide. */
function testScripts(): readonly { readonly manifest: string; readonly command: string }[] {
  const manifests = ['package.json', ...globSync('{packages,apps}/*/package.json', { cwd: ROOT })];
  return manifests.flatMap((manifest) => {
    const parsed: unknown = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8'));
    const scripts = (parsed as { scripts?: Record<string, string> }).scripts ?? {};
    return Object.entries(scripts)
      .filter(([name]) => name === 'test' || name.startsWith('test:') || name === 'verify')
      .map(([, command]) => ({ manifest, command }));
  });
}

describe('no test retry', () => {
  it('declares no retry option in any suite configuration', () => {
    const offenders = suiteConfigurations().filter((path) =>
      RETRY_OPTION.test(readFileSync(join(ROOT, path), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('passes no retry flag from any test or verify script', () => {
    const offenders = testScripts()
      .filter(({ command }) => RETRY_FLAG.test(command))
      .map(({ manifest, command }) => `${manifest}: ${command}`);
    expect(offenders).toEqual([]);
  });

  it('re-runs no failed step through a retry action in CI', () => {
    const offenders = workflows().filter((path) =>
      RETRY_ACTIONS.test(readFileSync(join(ROOT, path), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
