// What leaves the machine, and what it costs.
//
// Publication is the first irreversible step of a run: before it, everything
// lives in local branches nobody sees. So it is deliberately narrow.
//
//   - One refspec, written in full, never forced. A worker branch is a private
//     staging area; pushing one publishes unreviewed history under a name that
//     looks official, and the reconciled branch is the only thing anyone should
//     be able to fetch.
//   - Nothing is published on stale proof. The suite is green about a tree, and
//     `proof-invalidation` decides whether that tree is the one being pushed.
//   - One pull request, ever. A second one for the same cluster splits the
//     provenance the body exists to carry.
//
// Merging is not here and must not be: no `gh pr merge`, no `--auto`, no merge
// API. The human merge is the gate the whole design is built around.
//
// Pure. This emits argv and preconditions; the skill runs them and re-observes.

import { autopilotFailure } from './errors.js';
import type { ProofAssessment } from './proof-invalidation.js';

export type PublishStepKind = 'push-branch' | 'create-pull-request';

export interface PublishStep {
  readonly kind: PublishStepKind;
  readonly command: readonly string[];
  /** What must hold before the step runs, checked by the skill. */
  readonly precondition: string;
}

export interface PublishBlock {
  readonly reason: 'proofs-not-sealed';
  readonly detail: string;
}

/** The remote pull request already tracking this branch, as observed. */
export interface ExistingPullRequest {
  readonly number: number;
  readonly headSha: string;
}

export interface PublishInput {
  readonly clusterId: string;
  readonly remote: string;
  readonly base: { readonly branch: string };
  /** Resolved head of the integration branch. */
  readonly integrationSha: string;
  readonly proofs: ProofAssessment;
  /** Local worker branches, named here only so the plan can be proven free of them. */
  readonly workerBranches: readonly string[];
  readonly existingPullRequest?: ExistingPullRequest | null;
}

export interface PublishPlan {
  readonly schemaVersion: 1;
  readonly integrationBranch: string;
  readonly steps: readonly PublishStep[];
  readonly blocked: readonly PublishBlock[];
  readonly pullRequest: {
    /** Number of the pull request already open, or null when it is still to create. */
    readonly number: number | null;
    readonly title: string;
    readonly base: string;
    readonly head: string;
    /** Where the skill writes the rendered body before creating the request. */
    readonly bodyPath: string;
  };
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[0-9a-f]{40}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export function buildPublishPlan(input: PublishInput): PublishPlan {
  if (!SLUG.test(input.clusterId)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the cluster id cannot name an integration branch',
      `\`clusterId\` is ${JSON.stringify(input.clusterId)}`,
      'use a cluster id of letters, digits, dot, dash or underscore',
    );
  }
  if (!SHA.test(input.integrationSha)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the branch to publish has no resolved head',
      `\`integrationSha\` is ${JSON.stringify(input.integrationSha)}`,
      'resolve the integration branch to a full commit id before publishing',
    );
  }
  if (!BRANCH.test(input.base.branch)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the pull request has no base to target',
      `\`base.branch\` is ${JSON.stringify(input.base.branch)}`,
      'set the base branch the cluster was leased against',
    );
  }
  if (!SLUG.test(input.remote)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the push has no usable remote',
      `\`remote\` is ${JSON.stringify(input.remote)}`,
      'name the git remote to publish to, usually `origin`',
    );
  }

  const integrationBranch = `autopilot/${input.clusterId}`;
  const bodyPath = `.void/autopilot/${input.clusterId}/pr-body.md`;
  const title = `autopilot(${input.clusterId}): reconciled integration`;
  const existing = input.existingPullRequest ?? null;
  const pullRequest = {
    number: existing?.number ?? null,
    title,
    base: input.base.branch,
    head: integrationBranch,
    bodyPath,
  };

  if (!input.proofs.sealed) {
    const missing = input.proofs.missing.map((command) => `\`${command.join(' ')}\``).join(', ');
    return {
      schemaVersion: 1,
      integrationBranch,
      steps: [],
      blocked: [
        {
          reason: 'proofs-not-sealed',
          detail:
            missing === ''
              ? 'the local suite produced no proof for this tree'
              : `the local suite has no fresh passing proof for ${missing}`,
        },
      ],
      pullRequest,
    };
  }

  const steps: PublishStep[] = [];

  // The remote already carries this exact tree; pushing again would be a no-op
  // that still costs a CI run on repositories that build on `push`.
  if (existing === null || existing.headSha !== input.integrationSha) {
    steps.push({
      kind: 'push-branch',
      // Both sides written out: a short refspec resolves through the remote's
      // config, and `push origin <branch>` can be made to update several refs.
      command: [
        'git',
        'push',
        input.remote,
        `refs/heads/${integrationBranch}:refs/heads/${integrationBranch}`,
      ],
      precondition: `\`${integrationBranch}\` is at ${input.integrationSha} and the local suite is sealed against it`,
    });
  }

  if (existing === null) {
    steps.push({
      kind: 'create-pull-request',
      command: [
        'gh',
        'pr',
        'create',
        '--base',
        input.base.branch,
        '--head',
        integrationBranch,
        '--title',
        title,
        '--body-file',
        bodyPath,
      ],
      precondition: `the push succeeded and no open pull request already targets \`${input.base.branch}\` from \`${integrationBranch}\``,
    });
  }

  return { schemaVersion: 1, integrationBranch, steps, blocked: [], pullRequest };
}

export type CheckConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'pending'
  | 'neutral'
  | 'skipped';

export interface ObservedCheck {
  readonly name: string;
  /** Whether branch protection requires this check to be green. */
  readonly required: boolean;
  readonly conclusion: CheckConclusion;
  /** Whether the failure is explainable by this diff, and so the run's to fix. */
  readonly ownedByDiff: boolean;
}

export type CheckAction = 'ready' | 'fix' | 'escalate' | 'wait';

export interface CheckResponse {
  readonly action: CheckAction;
  /** Failing required checks this run caused and may correct. */
  readonly owned: readonly string[];
  /** Failing required checks this run did not cause. */
  readonly external: readonly string[];
  readonly detail: string;
}

const FAILED: readonly CheckConclusion[] = ['failure', 'cancelled', 'timed_out'];
const UNSETTLED: readonly CheckConclusion[] = ['pending', 'action_required'];

/**
 * Decide what to do about the checks on the published branch.
 *
 * Never returns "turn it off". A required check that fails for a reason outside
 * the diff is escalated to the human, because the alternative — weakening the
 * gate to make the run finish — is exactly what the gate exists to prevent.
 */
export function planCheckResponse(checks: readonly ObservedCheck[]): CheckResponse {
  const required = checks.filter((check) => check.required);
  const failing = required.filter((check) => FAILED.includes(check.conclusion));
  const owned = failing.filter((check) => check.ownedByDiff).map((check) => check.name);
  const external = failing.filter((check) => !check.ownedByDiff).map((check) => check.name);

  // Owned failures come first even when other checks are still running: the fix
  // invalidates those runs anyway, so waiting for them buys nothing.
  if (owned.length > 0) {
    return {
      action: 'fix',
      owned,
      external,
      detail: `${owned.join(', ')} failed on this diff; correct it locally and push the same branch again`,
    };
  }
  if (external.length > 0) {
    return {
      action: 'escalate',
      owned,
      external,
      detail: `${external.join(', ')} failed for a reason this diff does not explain; report it rather than retry it blindly`,
    };
  }

  const waiting = required.filter((check) => UNSETTLED.includes(check.conclusion));
  if (waiting.length > 0) {
    const approval = waiting.filter((check) => check.conclusion === 'action_required');
    return {
      action: 'wait',
      owned,
      external,
      detail:
        approval.length > 0
          ? `${approval.map((check) => check.name).join(', ')} is waiting for a run approval`
          : `${waiting.map((check) => check.name).join(', ')} has not reported yet`,
    };
  }

  if (required.length === 0) {
    // No required check observed is not a green branch: it is a branch whose
    // protection has not attached its checks yet, or an observation that failed.
    return {
      action: 'wait',
      owned,
      external,
      detail: 'no required check was observed on this branch yet',
    };
  }

  return {
    action: 'ready',
    owned,
    external,
    detail: `${required.length} required check(s) green; the pull request is ready for a human merge`,
  };
}

export interface CiAccountInput {
  /** Runs one push starts, from `planCiTriggers`, or null when undecidable. */
  readonly expectedRunsPerPush: number | null;
  /** Pushes actually made, including those that carried a fix. */
  readonly pushes: number;
  readonly unknowns: readonly string[];
}

export interface CiAccount {
  readonly total: number | null;
  /** False when the number is a guess rather than a count. */
  readonly honest: boolean;
  readonly detail: string;
}

/** Count the remote runs this publication actually cost. */
export function accountCiRuns(input: CiAccountInput): CiAccount {
  if (input.expectedRunsPerPush === null) {
    return {
      total: null,
      honest: false,
      detail: `the trigger budget is undecidable for ${input.unknowns.join(', ')}; the run count cannot be stated`,
    };
  }
  return {
    total: input.expectedRunsPerPush * input.pushes,
    honest: true,
    detail: `${input.pushes} pushes x ${input.expectedRunsPerPush} run(s) each`,
  };
}
