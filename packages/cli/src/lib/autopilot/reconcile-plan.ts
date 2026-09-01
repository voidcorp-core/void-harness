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
   * It is what decides whether the audit has a question to answer: a ticket that
   * was blocked, excluded or never spawned still holds its claim, and it is
   * usually the one whose work got absorbed.
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
   * prove ran.
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

export function buildReconcilePlan(input: ReconcileInput): ReconcilePlan {
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

  const integrationBranch = `autopilot/${input.clusterId}`;
  const footprints = input.footprints ?? [];
  // Alone, a range has no neighbour to rob: the audit answers nothing, and
  // demanding an observation to answer nothing would stall a run for ceremony.
  const audited = input.cluster.length > 1;
  if (audited) {
    const undeclared = input.cluster.filter((id) => !footprints.some((entry) => entry.id === id));
    if (undeclared.length > 0) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        'this cluster declared no footprint for every ticket it holds',
        `${undeclared.join(', ')} reached reconciliation without a declared area`,
        'pass `footprints` exactly as `orchestrate` returned them; the audit cannot be skipped by omitting them',
      );
    }
  }
  const excluded: ExcludedRange[] = [];
  const integrate: VerifiedRange[] = [];

  for (const range of input.ranges) {
    if (range.verdict.kind !== 'usable') {
      excluded.push({
        ticketId: range.ticketId,
        reason: 'unverified-range',
        detail: range.verdict.detail,
      });
      continue;
    }
    if (range.verdict.commits.length === 0) {
      excluded.push({
        ticketId: range.ticketId,
        reason: 'no-usable-commit',
        detail: `\`${range.ticketId}\` verified clean but carries no commit to integrate`,
      });
      continue;
    }
    if (audited) {
      // The same rule ancestry already follows: what the worker says it touched
      // is a claim, and a claim cannot clear a range of carrying somebody else's
      // work. An empty list is the same silence in another shape -- the range
      // carries a commit, so git reported files for it.
      if (range.observedFiles === undefined || range.observedFiles.length === 0) {
        excluded.push({
          ticketId: range.ticketId,
          reason: 'footprint-unobserved',
          detail:
            range.observedFiles === undefined
              ? `\`${range.ticketId}\` was never read from git for the files it touches, and the` +
                " worker's own list is not an observation"
              : `\`${range.ticketId}\` carries ${String(range.verdict.commits.length)} commit(s) and an` +
                ' empty observed file list, which is not an observation git produces',
        });
        continue;
      }
      const audit = auditFootprint(
        { ticketId: range.ticketId, files: range.observedFiles },
        { footprints, exempt: input.reconcileOnly },
      );
      if (audit.kind === 'breach') {
        excluded.push({ ticketId: range.ticketId, reason: 'footprint-breach', detail: audit.detail });
        continue;
      }
    }
    integrate.push(range);
  }

  const sharedPaths = [
    ...new Set(
      integrate.flatMap((range) =>
        (range.observedFiles ?? range.files).filter((file) => matchesAny(file, input.reconcileOnly)),
      ),
    ),
  ].sort();

  const steps: ReconcileStep[] = [
    {
      kind: 'create-branch',
      ticketId: null,
      // From the pinned SHA: the base branch may have moved since the lease, and
      // every worker built on this exact tree.
      command: ['git', 'checkout', '-b', integrationBranch, input.base.sha],
      precondition: `no local branch \`${integrationBranch}\` exists, or it already points at ${input.base.sha}`,
    },
  ];

  for (const range of integrate) {
    steps.push({
      kind: 'merge-range',
      ticketId: range.ticketId,
      // --no-ff keeps each ticket's range identifiable in the history, which is
      // what lets the pull request body claim per-ticket provenance honestly.
      command: ['git', 'merge', '--no-ff', '--no-edit', range.headSha],
      precondition: `\`${range.ticketId}\` was verified usable and ${range.headSha} is reachable`,
    });
  }

  if (sharedPaths.length > 0) {
    steps.push({
      kind: 'strip-shared',
      ticketId: null,
      command: ['git', 'checkout', input.base.sha, '--', ...sharedPaths],
      precondition: 'every range merged; shared artefacts revert to the base before one rebuild',
    });

    if (input.rebuildCommand !== undefined && input.rebuildCommand.length > 0) {
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
    }
  }

  return {
    schemaVersion: 1,
    integrationBranch,
    integrate: integrate.map((range) => range.ticketId),
    excluded,
    steps,
    sharedPaths,
  };
}
