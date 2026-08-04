// Does this project actually keep observed state out of its history?
//
// The ignore block is a declaration, and a declaration is not a proof: a rule can
// be absent, overridden by a later rule, or simply powerless because the file was
// already tracked before the rule existed (git ignores nothing it already
// tracks). So `doctor` asks git rather than assuming, which is the same
// installed/wired/fired distinction the runtime checks already make.
//
// Pure. The caller observes with git; this judges.

import type { CheckResult } from './prerequisites.js';

export interface LayoutObservation {
  /** Observed artifacts still sitting at the pre-split location. */
  readonly pending: readonly string[];
  /** Whether git ignores `.void/local/`; null when it could not be asked. */
  readonly localIgnored: boolean | null;
  /** Observed paths git currently tracks, which the ignore rule cannot undo. */
  readonly trackedObserved: readonly string[];
}

function pass(name: string, message: string): CheckResult {
  return { name, ok: true, status: 'pass', message };
}

function fail(name: string, message: string, fix: string): CheckResult {
  return { name, ok: false, status: 'fail', message, fix };
}

function unknown(name: string, message: string, fix: string): CheckResult {
  return { name, ok: false, status: 'unknown', message, fix };
}

function layoutCheck(observation: LayoutObservation): CheckResult {
  const name = 'void layout';
  if (observation.pending.length === 0) return pass(name, 'observed state is under .void/local/');
  return fail(
    name,
    `${observation.pending.length} observed path(s) still at the old location: ${observation.pending.join(', ')}`,
    'void-harness update — it moves them under .void/local/ and never overwrites',
  );
}

function ignoreCheck(observation: LayoutObservation): CheckResult {
  const name = 'void ignore';
  if (observation.localIgnored === null) {
    return unknown(name, 'not a git repository, so nothing ignores anything here', 'run this inside the repository the project ships from');
  }
  return observation.localIgnored
    ? pass(name, '.void/local/ is ignored')
    : fail(
        name,
        '.void/local/ is NOT ignored, so telemetry and run journals would be committed',
        'void-harness update — it writes the managed block; check no later rule re-includes .void/',
      );
}

function trackedCheck(observation: LayoutObservation): CheckResult {
  const name = 'void tracked';
  if (observation.trackedObserved.length === 0) return pass(name, 'no observed state in the index');
  // Worth its own check: an ignore rule has no effect on an already-tracked file,
  // so this is the one failure the block cannot fix by itself.
  return fail(
    name,
    `git tracks ${observation.trackedObserved.length} observed path(s): ${observation.trackedObserved.join(', ')}`,
    `git rm --cached -r ${observation.trackedObserved.join(' ')} — the ignore rule cannot untrack what is already in the index`,
  );
}

/** Every layout-hygiene verdict, in the order a reader should meet them. */
export function judgeLayout(observation: LayoutObservation): readonly CheckResult[] {
  return Object.freeze([layoutCheck(observation), ignoreCheck(observation), trackedCheck(observation)]);
}
