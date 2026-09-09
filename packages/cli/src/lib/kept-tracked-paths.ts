// Does git actually KEEP what the harness declares a clone cannot start without?
//
// `void ignore` and `void observed` ask the question one way round: is what must
// be hidden hidden. This is the mirror, and it is the half that failed silently.
// A project carried, above the managed block and years older than it, its own
// rule:
//
//     .void/*
//     !.void/PROJECT-DOCTRINE.md
//
// git does not descend into an excluded directory, so that rule wins over
// everything the block declares below it. On a fresh clone there was no
// `install-manifest.json` (so `hydrate` could not run), no `config.json` (so no
// pack pins and no `paths.business`), and no `.void/hooks/_void-hook.mjs` --
// while `.claude/settings.json` was committed and named seven hooks pointing at
// it. The enforcement floor had stopped applying, and nothing said a word: the
// check read the lines of the ignore file and never asked git whether they won.
//
// Two measured facts decide the shape of this check, both against git 2.50:
//
//   - `check-ignore -q` answers ignored / not ignored. `-v` answers "a pattern
//     matched", and a NEGATION matches: `-v` exits 0 on a path the block
//     rescues. So the verdict comes from `-q`, and `-v` is asked only after, to
//     name the rule. Reading the exit code of `-v` would report every rescued
//     path as hidden.
//   - a TRACKED file is never reported as ignored (git ignores nothing it
//     already tracks). So "ignored" here already means "ignored and not in the
//     index", which is exactly the harmful state and the only one reported.
//
// Pure. The caller asks git and stats the disk; this decides what that means.

import {
  DERIVED_LOAD_BEARING,
  MATERIALIZED_OWNERSHIP,
  VOID_DIR,
  VOID_OWNERSHIP,
} from '@voidcorp/hook-runner';
import { INSTALL_MANIFEST_PATH } from './install-manifest.js';
import type { CheckResult } from './prerequisites.js';

const CHECK_NAME = 'void kept';

function bare(path: string): string {
  return path.split('\\').join('/').replace(/\/+$/, '');
}

/**
 * Every path the harness declares git must keep, derived from the layout truth
 * table rather than listed by hand: the project-owned half of `.void/`, the
 * install manifest that lets another checkout prove what it restored, the
 * project-owned materialized files, and `DERIVED_LOAD_BEARING` -- the derived
 * paths whose absence is an error rather than a degradation.
 *
 * Deriving it is the point. A list would answer for the layout of the day it was
 * written, and this check exists because a declaration and a fact drifted apart.
 */
export function keptTrackedCandidates(): readonly string[] {
  const paths = new Set<string>(
    [
      ...Object.entries(VOID_OWNERSHIP)
        .filter(([, ownership]) => ownership === 'project')
        .map(([entry]) => `${VOID_DIR}/${entry}`),
      INSTALL_MANIFEST_PATH,
      ...Object.entries(MATERIALIZED_OWNERSHIP)
        .filter(([, ownership]) => ownership === 'project')
        .map(([path]) => path),
      ...DERIVED_LOAD_BEARING,
    ].map(bare),
  );
  return Object.freeze([...paths].sort());
}

export interface KeptTrackedObservation {
  /** The candidate path, as `keptTrackedCandidates` names it. */
  readonly path: string;
  /** Whether it exists in this project. An absent path is never reported. */
  readonly present: boolean;
  /** What `check-ignore -q` answered. `undefined` when git could not be asked. */
  readonly ignored: boolean | undefined;
  /** What `check-ignore -v` named as the winning rule, `source:line:pattern`. */
  readonly rule: string | undefined;
}

const FIX =
  'a project rule wins over the managed block; run git check-ignore -v <path> to see which, '
  + 'then narrow it so these paths stay visible and git add them';

/**
 * The verdict on what a fresh clone would be missing.
 *
 * A measured failure outranks an unmeasured path, for the same reason as the
 * observed-write check: a path this run could not read is not a defect of the
 * project, and it must not soften one git did answer for.
 */
export function judgeKeptTracked(
  observations: readonly KeptTrackedObservation[],
): CheckResult {
  const reportable = observations.filter((observation) => observation.present);
  const hidden = reportable
    .filter((observation) => observation.ignored === true)
    .map((observation) => `${observation.path} (${observation.rule ?? 'rule unknown'})`)
    .sort();
  if (hidden.length > 0) {
    return {
      name: CHECK_NAME,
      ok: false,
      status: 'fail',
      message:
        `git ignores ${String(hidden.length)} path(s) the harness declares a clone cannot start `
        + `without: ${hidden.join(', ')}`,
      fix: FIX,
    };
  }

  const unmeasured = reportable
    .filter((observation) => observation.ignored === undefined)
    .map((observation) => observation.path)
    .sort();
  if (unmeasured.length > 0) {
    return {
      name: CHECK_NAME,
      ok: false,
      status: 'unknown',
      message: `could not ask git about ${unmeasured.join(', ')}, so nothing here is proven either way`,
      fix: 'run this inside the repository the project ships from, with git on the PATH',
    };
  }

  return {
    name: CHECK_NAME,
    ok: true,
    status: 'pass',
    message:
      reportable.length === 0
        ? 'no declared path exists here yet'
        : `git keeps all ${String(reportable.length)} declared path(s) present`,
  };
}
