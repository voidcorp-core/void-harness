// The order and the actions that turn several verified worker ranges into one
// integration branch.
//
// Pure: this emits argv and preconditions, it merges nothing. The skill runs
// the commands and observes the result, because a merge that reports success
// still has to be checked against what actually landed (see `git-observation`).
//
// Three rules shape the plan:
//
//   1. Nothing integrates unverified. A range whose ancestry was not proven is
//      excluded before the branch is even created.
//   2. Shared artefacts belong to the reconciler alone. A file the active
//      program marks `reconcileOnly` is stripped from every worker range and
//      rebuilt once, at the end, from the integrated tree — four workers each
//      regenerating the same lockfile is four conflicts and one wrong answer.
//   3. Order is declared, not discovered. Sequential tickets keep their lane
//      order so a rerun produces the same branch.
//   4. A range carries only what its own ticket claimed. Ancestry says a range
//      is the history it says it is; it says nothing about whose files are in
//      it, and two disjoint footprints merge without a conflict either way.
//      `footprint-audit` answers the second question, and a breach is excluded
//      rather than merged.

import { autopilotFailure } from './errors.js';
import { normaliseArea } from './footprint-area.js';
import { auditFootprint, type DeclaredFootprint } from './footprint-audit.js';
import type { RangeVerdict } from './git-observation.js';

export type IntegrationExclusion =
  | 'unverified-range'
  | 'not-green'
  | 'no-usable-commit'
  | 'footprint-breach'
  | 'footprint-unobserved';

export interface ExcludedRange {
  readonly ticketId: string;
  readonly reason: IntegrationExclusion;
  readonly detail: string;
}

export type ReconcileStepKind =
  | 'create-branch'
  | 'merge-range'
  | 'strip-shared'
  | 'rebuild-shared'
  | 'commit-shared';

export interface ReconcileStep {
  readonly kind: ReconcileStepKind;
  /** Ticket the step integrates, or null for cluster-wide steps. */
  readonly ticketId: string | null;
  readonly command: readonly string[];
  /** What must hold before the step runs, checked by the skill. */
  readonly precondition: string;
}

export interface VerifiedRange {
  readonly ticketId: string;
  readonly branch: string;
  readonly headSha: string;
  readonly verdict: RangeVerdict;
  /** Files the worker said it touched. A claim, kept only as a fallback. */
  readonly files: readonly string[];
  /** Files git reported for the range. The only evidence the audit accepts. */
  readonly observedFiles?: readonly string[];
}

export interface ReconcileInput {
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  /** Verified ranges, in the integration order the plan declared. */
  readonly ranges: readonly VerifiedRange[];
  /**
   * Every ticket the run reserved, not only those that came back.
   *
   * A ticket that was blocked, excluded or never spawned still holds its claim,
   * and it is usually the one whose work got absorbed. This list no longer
   * decides on its own whether the audit has a question to answer: it is checked
   * against `footprints` both ways, so shrinking it to the tickets that returned
   * is a refusal rather than a quiet exemption.
   */
  readonly cluster: readonly string[];
  /** Path patterns only the reconciler may write, from the active program. */
  readonly reconcileOnly: readonly string[];
  /**
   * What every ticket of the cluster declared, ran or not.
   *
   * Optional in the shape, mandatory in fact for a cluster of more than one:
   * absence is refused below rather than read as "nothing to audit". An empty
   * `excluded` after a skipped audit is byte for byte an empty `excluded` after
   * a clean one, so an audit that can be off by omission is an audit nobody can
   * prove ran -- and an entry declaring `areas: []` is that same omission
   * written as a value.
   */
  readonly footprints?: readonly DeclaredFootprint[];
  /** argv that regenerates the shared artefacts, run once at the end. */
  readonly rebuildCommand?: readonly string[];
}

export interface ReconcilePlan {
  readonly schemaVersion: 1;
  readonly integrationBranch: string;
  readonly integrate: readonly string[];
  readonly excluded: readonly ExcludedRange[];
  readonly steps: readonly ReconcileStep[];
  /** Shared paths stripped from worker ranges, rebuilt once instead. */
  readonly sharedPaths: readonly string[];
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function matchesAny(path: string, patterns: readonly string[]): boolean {
  // Deliberately literal: a prefix or an exact path. Glob matching lives in
  // worker-order, where the active program's own patterns are compiled; here a
  // pattern arrives already resolved to concrete paths by the caller. Spelling
  // still goes through the one normaliser, so a trailing slash cannot make the
  // strip step and the audit exemption disagree about the same list.
  return patterns
    .map(normaliseArea)
    .some((pattern) => path === pattern || path.startsWith(`${pattern}/`));
}

/**
 * Every ticket in play is declared, and every declaration names a ticket in play.
 *
 * The cross-check used to run one way only, and the switch above it was computed
 * from `cluster` alone. So the audit was disarmed by *shrinking* the payload:
 * pass the tickets that came back rather than the ones the run reserved, and a
 * range carrying the absent ticket's file came back with an empty `excluded` --
 * byte for byte what a clean audit returns. The proof of the under-declaration
 * was in the same payload, in `footprints`, and nobody read it.
 *
 * Both directions are refusals rather than repairs. A declaration for a ticket
 * the cluster does not hold and a cluster ticket nobody declared are the same
 * contradiction seen from either end, and neither end says which of the two
 * lists is the wrong one. Guessing would pick a merge over a question.
 *
 * An `areas: []` entry counts as no declaration, and it gets its own refusal.
 * The two are not the same mistake. An absent entry is a payload assembled
 * wrong, and the repair is to pass what `orchestrate` returned. An entry that
 * arrived declaring nothing IS what `orchestrate` returned -- it emits the areas
 * verbatim -- so sending that caller back for the payload named the gesture that
 * had just succeeded, at the last step of a run whose workers had all finished,
 * with both remaining moves forbidden: invent an area, or shrink `cluster` past
 * `requireClusterCoversRun`. `plan` now excludes such a ticket before any worker
 * starts, so this is a backstop for a hand-built cluster -- and a backstop still
 * has to name a move the caller can make.
 */
function requireSymmetricDeclaration(
  cluster: readonly string[],
  footprints: readonly DeclaredFootprint[],
): void {
  const declared = new Map(footprints.map((entry) => [entry.id, entry.areas]));
  const absent = cluster.filter((id) => !declared.has(id));
  if (absent.length > 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'this cluster declared no footprint for every ticket it holds',
      `${absent.join(', ')} reached reconciliation without a declared area`,
      'pass `footprints` exactly as `orchestrate` returned them; the audit cannot be skipped by omitting them',
    );
  }

  const unnamed = cluster.filter((id) => (declared.get(id) ?? []).length === 0);
  if (unnamed.length > 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'this cluster holds a ticket whose declaration names no area',
      `${unnamed.join(', ')} declared \`areas: []\`, which is ground no audit can protect`,
      'declare the areas on the ticket and let `plan` build the cluster again, which now refuses a footprint naming none; for a run whose workers already finished, reconcile each range as its own cluster of one -- that is exactly the coverage a ticket claiming nothing ever had',
    );
  }

  const unreserved = [
    ...new Set(footprints.map((entry) => entry.id).filter((id) => !cluster.includes(id))),
  ];
  if (unreserved.length > 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'this cluster declared a footprint for a ticket it says it never reserved',
      `${unreserved.join(', ')} declared an area but is absent from \`cluster\``,
      'pass `cluster` as EVERY ticket the run reserved, blocked ones included; a ticket that vanishes from that list takes its claim with it',
    );
  }
}

type RangeObservation =
  | { readonly kind: 'observed'; readonly files: readonly string[] }
  | { readonly kind: 'unobserved'; readonly detail: string };

/**
 * Git's reading of what this range touches, or why there is not one.
 *
 * The declared type is `readonly string[] | undefined`, and it crossed a JSON
 * boundary where a type is a wish. Missing, empty, a string, and a list holding
 * something that is not a path are four spellings of the same silence, and only
 * one of them announces itself: a string has a `length` and iterates, so the
 * audit walks it character by character, matches no area with any character,
 * and returns `within-scope` -- its own word for approval.
 */
function readObservation(range: VerifiedRange, commits: number): RangeObservation {
  const observed: unknown = range.observedFiles;
  const unobserved = (detail: string): RangeObservation => ({ kind: 'unobserved', detail });

  if (observed === undefined) {
    return unobserved(
      `\`${range.ticketId}\` was never read from git for the files it touches, and the` +
        " worker's own list is not an observation",
    );
  }
  if (!Array.isArray(observed)) {
    return unobserved(
      `\`${range.ticketId}\` carries \`observedFiles\` as ${typeof observed}, and only a list of` +
        ' paths is an observation git produces',
    );
  }
  if (observed.length === 0) {
    return unobserved(
      `\`${range.ticketId}\` carries ${String(commits)} commit(s) and an empty observed file list,` +
        ' which is not an observation git produces',
    );
  }
  const files = observed.filter((file): file is string => typeof file === 'string' && file.trim() !== '');
  if (files.length !== observed.length) {
    return unobserved(
      `\`${range.ticketId}\` carries an entry in \`observedFiles\` that is not a file path`,
    );
  }
  return { kind: 'observed', files };
}

/**
 * The paths the strip step reads, or a refusal naming the field it could not read.
 *
 * The observation when there is one, the worker's own claim otherwise -- a range
 * that reached here unaudited is a cluster of one, where the claim is the
 * documented fallback. The comment used to promise the fallback was safe and the
 * code still read `.filter` off whatever arrived, so a `files` that came back as
 * a string turned a strip step into a raw TypeError. Silently treating it as
 * empty is worse than refusing: the shared artefact would then never be stripped
 * and the worker's own copy would ride into the merge.
 */
function strippableFiles(range: VerifiedRange): readonly string[] {
  const observed = range.observedFiles;
  if (Array.isArray(observed)) {
    return observed.filter((file): file is string => typeof file === 'string');
  }
  const claimed: unknown = range.files;
  if (!Array.isArray(claimed) || claimed.some((file) => typeof file !== 'string')) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'a range carries no readable file list for the shared-artefact strip',
      `\`files\` for \`${range.ticketId}\` is ${typeof claimed === 'string' ? 'a string' : 'not a list of paths'}`,
      "pass `git diff --name-only base..head` as `observedFiles`; the worker's own list is the fallback for a cluster of one, and it is still a list of paths",
    );
  }
  return claimed as readonly string[];
}

/** The two shapes that are a misuse of the command rather than a run outcome. */
function requireReconcilableInput(input: ReconcileInput): void {
  if (!SLUG.test(input.clusterId)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the cluster id cannot name an integration branch',
      `\`clusterId\` is ${JSON.stringify(input.clusterId)}`,
      'use a cluster id of letters, digits, dot, dash or underscore',
    );
  }
  if (input.ranges.length === 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'there is no range to reconcile',
      'the cluster produced no worker range',
      'resolve the cluster outcome first; a run with nothing green opens no pull request',
    );
  }
}

/**
 * Why this range does not merge, or `undefined` when it does.
 *
 * Ancestry first, then what the range actually carries. Both are exclusions
 * rather than throws: one bad range costs its own ticket, never the cluster.
 */
function excludeRange(
  range: VerifiedRange,
  audited: boolean,
  footprints: readonly DeclaredFootprint[],
  exempt: readonly string[],
): ExcludedRange | undefined {
  if (range.verdict.kind !== 'usable') {
    return { ticketId: range.ticketId, reason: 'unverified-range', detail: range.verdict.detail };
  }
  if (range.verdict.commits.length === 0) {
    return {
      ticketId: range.ticketId,
      reason: 'no-usable-commit',
      detail: `\`${range.ticketId}\` verified clean but carries no commit to integrate`,
    };
  }
  if (!audited) return undefined;

  // The same rule ancestry already follows: what the worker says it touched is a
  // claim, and a claim cannot clear a range of carrying somebody else's work.
  // Missing, empty and malformed are the same silence in three shapes -- the
  // range carries a commit, so git reported paths for it.
  const observation = readObservation(range, range.verdict.commits.length);
  if (observation.kind === 'unobserved') {
    return { ticketId: range.ticketId, reason: 'footprint-unobserved', detail: observation.detail };
  }
  const audit = auditFootprint(
    { ticketId: range.ticketId, files: observation.files },
    { footprints, exempt },
  );
  return audit.kind === 'breach'
    ? { ticketId: range.ticketId, reason: 'footprint-breach', detail: audit.detail }
    : undefined;
}

/** The merge, then the one rebuild of everything the reconciler owns. */
function planSteps(
  input: ReconcileInput,
  integrationBranch: string,
  integrate: readonly VerifiedRange[],
  sharedPaths: readonly string[],
): readonly ReconcileStep[] {
  const steps: ReconcileStep[] = [
    {
      kind: 'create-branch',
      ticketId: null,
      // From the pinned SHA: the base branch may have moved since the lease, and
      // every worker built on this exact tree.
      command: ['git', 'checkout', '-b', integrationBranch, input.base.sha],
      precondition: `no local branch \`${integrationBranch}\` exists, or it already points at ${input.base.sha}`,
    },
    ...integrate.map((range): ReconcileStep => ({
      kind: 'merge-range',
      ticketId: range.ticketId,
      // --no-ff keeps each ticket's range identifiable in the history, which is
      // what lets the pull request body claim per-ticket provenance honestly.
      command: ['git', 'merge', '--no-ff', '--no-edit', range.headSha],
      precondition: `\`${range.ticketId}\` was verified usable and ${range.headSha} is reachable`,
    })),
  ];

  if (sharedPaths.length === 0) return steps;
  steps.push({
    kind: 'strip-shared',
    ticketId: null,
    command: ['git', 'checkout', input.base.sha, '--', ...sharedPaths],
    precondition: 'every range merged; shared artefacts revert to the base before one rebuild',
  });

  if (input.rebuildCommand === undefined || input.rebuildCommand.length === 0) return steps;
  steps.push({
    kind: 'rebuild-shared',
    ticketId: null,
    command: [...input.rebuildCommand],
    precondition: 'shared artefacts reverted to the base state',
  });
  steps.push({
    kind: 'commit-shared',
    ticketId: null,
    command: ['git', 'commit', '-m', `chore(autopilot): rebuild shared artefacts for ${input.clusterId}`, '--', ...sharedPaths],
    precondition: 'the rebuild produced a change; nothing to commit is not a failure',
  });
  return steps;
}

export function buildReconcilePlan(input: ReconcileInput): ReconcilePlan {
  requireReconcilableInput(input);

  const integrationBranch = `autopilot/${input.clusterId}`;
  const footprints = input.footprints ?? [];
  // Armed by every ticket in play, which is what the run reserved AND what the
  // payload declared. Reading `cluster` alone let the switch be turned off by a
  // list one step shorter than the truth. Alone, a range has no neighbour to
  // rob: the audit answers nothing, and demanding an observation to answer
  // nothing would stall a run for ceremony.
  const inPlay = new Set([...input.cluster, ...footprints.map((entry) => entry.id)]);
  const audited = inPlay.size > 1;
  if (audited) requireSymmetricDeclaration(input.cluster, footprints);

  const excluded: ExcludedRange[] = [];
  const integrate: VerifiedRange[] = [];
  for (const range of input.ranges) {
    const exclusion = excludeRange(range, audited, footprints, input.reconcileOnly);
    if (exclusion === undefined) integrate.push(range);
    else excluded.push(exclusion);
  }

  const sharedPaths = [
    ...new Set(
      integrate.flatMap((range) =>
        strippableFiles(range).filter((file) => matchesAny(file, input.reconcileOnly)),
      ),
    ),
  ].sort();

  return {
    schemaVersion: 1,
    integrationBranch,
    integrate: integrate.map((range) => range.ticketId),
    excluded,
    steps: planSteps(input, integrationBranch, integrate, sharedPaths),
    sharedPaths,
  };
}
