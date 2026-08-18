// Is the CLI running this check older than the layout it is checking?
//
// `doctor` reads the project's structure through whatever layout its own
// version knows. When the binary is behind the installed harness, every path it
// looks up is the previous one, so it reports healthy files as missing and hands
// out remedies that would damage a correct install. The version gap is the only
// real finding in that situation; the checks below it are artefacts of it.
//
// The comparison is anchored on `.void/install-manifest.json`, whose path is
// committed and has survived every layout change. Anchoring on anything under
// `.void/machine/` would reintroduce the bug being fixed: a stale CLI cannot
// find a file it does not know has moved.

import { compareVersions, normalizeVersion } from './version.js';
import type { CheckResult } from './prerequisites.js';

export type RunnerStaleness =
  | { readonly state: 'current' }
  | { readonly state: 'ahead'; readonly running: string; readonly recorded: string }
  | { readonly state: 'stale'; readonly running: string; readonly recorded: string }
  | { readonly state: 'unknown'; readonly reason: StalenessUnknownReason };

export type StalenessUnknownReason =
  | 'no-running-version'
  | 'no-recorded-version'
  | 'unparseable-version';

export interface RunnerStalenessInput {
  /** Version of the CLI executing this check. */
  readonly running?: string;
  /** Version the project's install manifest records for its installed harness. */
  readonly recorded?: string;
}

/** `2.7.0` and `v2.7.0` are the same version; `nightly` is not a version at all. */
function parsable(version: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(normalizeVersion(version));
}

export function judgeRunnerStaleness(input: RunnerStalenessInput): RunnerStaleness {
  const { running, recorded } = input;
  if (running === undefined || running.trim().length === 0) {
    return { state: 'unknown', reason: 'no-running-version' };
  }
  if (recorded === undefined || recorded.trim().length === 0) {
    return { state: 'unknown', reason: 'no-recorded-version' };
  }
  if (!parsable(running) || !parsable(recorded)) {
    return { state: 'unknown', reason: 'unparseable-version' };
  }
  const order = compareVersions(running, recorded);
  if (order === 0) return { state: 'current' };
  if (order > 0) return { state: 'ahead', running, recorded };
  return { state: 'stale', running, recorded };
}

/**
 * Only a stale runner invalidates the structural checks. A newer CLI against an
 * older project is the ordinary state between a publish and that project's
 * `update`, and an unknown pair is not evidence of anything.
 */
export function suspendsStructureChecks(verdict: RunnerStaleness): boolean {
  return verdict.state === 'stale';
}

/**
 * The check line, or nothing at all when the pair is healthy. A list people scan
 * under time pressure does not gain a line for a non-event.
 */
export function runnerStalenessCheck(verdict: RunnerStaleness): CheckResult | undefined {
  if (verdict.state !== 'stale') return undefined;
  return {
    name: 'harness version',
    ok: false,
    status: 'fail',
    message:
      `this CLI is ${verdict.running}, the installed harness is ${verdict.recorded}`
      + ' — it reads the previous layout, so the checks below it would be wrong',
    fix: 'npx voidharness@latest doctor, or upgrade the global CLI',
  };
}

/** What `doctor` prints in place of the checks it declined to run. */
export function suspendedStructureNote(verdict: RunnerStaleness): CheckResult {
  const recorded = verdict.state === 'stale' ? verdict.recorded : 'a newer version';
  return {
    name: 'structure checks',
    ok: true,
    status: 'unprobed',
    message: `suspended — re-run with ${recorded} to judge this project's structure`,
  };
}
