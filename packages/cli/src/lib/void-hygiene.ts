// Does this project actually keep observed state out of its history?
//
// The ignore block is a declaration, and a declaration is not a proof: a rule can
// be absent, overridden by a later rule, or simply powerless because the file was
// already tracked before the rule existed (git ignores nothing it already
// tracks). So `doctor` asks git rather than assuming, which is the same
// installed/wired/fired distinction the runtime checks already make.
//
// Pure. The caller observes with git; this judges.

import {
  judgeObservedIgnore,
  type ObservedPathObservation,
} from './observed-write-paths.js';
import type { CheckResult } from './prerequisites.js';

export interface ManifestObservation {
  /** Absent, unreadable, or the version it names. */
  readonly kind: 'absent' | 'unreadable' | 'present';
  readonly version?: string;
  /** Files whose bytes differ from the manifest, when it was verifiable. */
  readonly drifted?: number;
}

export interface LayoutObservation {
  /** Observed artifacts still sitting at the pre-split location. */
  readonly pending: readonly string[];
  /** Whether git ignores `.void/machine/`; null when it could not be asked. */
  readonly localIgnored: boolean | null;
  /**
   * Every path observed state can land in, present or not, ignored or not.
   *
   * `localIgnored` answers for the declared location only, and a project can be
   * clean there while a legacy bundle writes elsewhere. This carries the whole
   * surface so the verdict is about where state actually lands.
   */
  readonly observedPaths: readonly ObservedPathObservation[];
  /** Observed paths git currently tracks, which the ignore rule cannot undo. */
  readonly trackedObserved: readonly string[];
  /** What `.void/install-manifest.json` says about this project, if anything. */
  readonly manifest: ManifestObservation;
  /** How many ignorable derived files git still tracks (regenerated content). */
  readonly trackedDerivedCount: number;
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
  if (observation.pending.length === 0) return pass(name, 'observed state is under .void/machine/');
  return fail(
    name,
    `${observation.pending.length} observed path(s) still at the old location: ${observation.pending.join(', ')}`,
    'void-harness update — it moves them under .void/machine/ and never overwrites',
  );
}

function ignoreCheck(observation: LayoutObservation): CheckResult {
  const name = 'void ignore';
  if (observation.localIgnored === null) {
    return unknown(name, 'not a git repository, so nothing ignores anything here', 'run this inside the repository the project ships from');
  }
  return observation.localIgnored
    ? pass(name, '.void/machine/ is ignored')
    : fail(
        name,
        '.void/machine/ is NOT ignored, so telemetry and run journals would be committed',
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

function manifestCheck(observation: LayoutObservation): CheckResult {
  const name = 'void manifest';
  const manifest = observation.manifest;
  if (manifest.kind === 'absent') {
    // Not a failure: a project can run perfectly without ever recording what it
    // expects. It just cannot prove another checkout got the same bytes.
    return {
      name,
      ok: true,
      status: 'advisory',
      message: 'no install manifest — another checkout cannot prove it restored the same assets',
      fix: 'void-harness init writes it; commit .void/install-manifest.json',
    };
  }
  if (manifest.kind === 'unreadable') {
    return fail(name, 'the install manifest is present but not readable', 'restore it from git, or re-run void-harness init');
  }
  // Drift is a real failure: the working tree claims a version it does not hold.
  return (manifest.drifted ?? 0) === 0
    ? pass(name, `assets match manifest ${manifest.version ?? 'unknown'}`)
    : fail(
        name,
        `${manifest.drifted} file(s) differ from manifest ${manifest.version ?? 'unknown'}`,
        `npx voidharness@${manifest.version ?? 'x.y.z'} hydrate — it restores and proves every file`,
      );
}

function derivedCheck(observation: LayoutObservation): CheckResult {
  const name = 'void derived';
  if (observation.trackedDerivedCount === 0) return pass(name, 'no regenerated content in the index');
  // Advisory, not a failure: nothing is broken, and untracking rewrites the
  // project's index — that is the project's call, and it is offered as one
  // explicit command rather than done as a side effect of `update`.
  return {
    name,
    ok: true,
    status: 'advisory',
    message: `git tracks ${observation.trackedDerivedCount} file(s) that \`hydrate\` restores from the manifest`,
    fix: 'void-harness update --untrack-derived (keeps the files on disk, drops them from the index)',
  };
}

/** Every layout-hygiene verdict, in the order a reader should meet them. */
export function judgeLayout(observation: LayoutObservation): readonly CheckResult[] {
  return Object.freeze([
    layoutCheck(observation),
    ignoreCheck(observation),
    // Generalizes the check above from the one declared path to every path the
    // harness can write observed state to, legacy locations included.
    judgeObservedIgnore(observation.observedPaths),
    trackedCheck(observation),
    manifestCheck(observation),
    derivedCheck(observation),
  ]);
}
