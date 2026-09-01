// `void-harness autopilot` — the deterministic operator surface of the autopilot
// bounded context. NOT yet wired into main.ts: range A builds the destination,
// range D moves the public surface onto it, so no release ever ships two engines.
//
// Functional core, imperative shell: `runAutopilotCommand` is a function of
// (argv, stdin, context) and returns what to print and with which exit code. The
// CLI itself contacts nothing — no tracker, no git, no agent. The skill hydrates
// observations, pipes them in, applies what comes back, and observes again.
//
// The only side effect that exists here is the run cursor under .void/autopilot,
// and it is written at exactly one moment: after a reservation has been proven
// converged by re-observation.

import { type ClusterPlan, type ClusterPlanInput, planCluster } from '../lib/autopilot/cluster-plan.js';
import { type MergedUnit, renderMergeJournal } from '../lib/autopilot/chain.js';
import { selectBase, type BaseObservation, type BaseSelection } from '../lib/autopilot/base-selection.js';
import {
  decideBranchProtection,
  interpretProtectionResponse,
  type ProtectionResponse,
} from '../lib/autopilot/branch-protection.js';
import { verifyRange, type RangeObservation } from '../lib/autopilot/git-observation.js';
import { judgeLiveness, renderRunProgress, type RunBeat } from '../lib/autopilot/run-progress.js';
import {
  buildUnionReviewRequest,
  inconclusiveReview,
  judgeMergeGrant,
  planPostCheckAction,
  type CheckStand,
  type MergeGrant,
  type UnionReview,
} from '../lib/autopilot/union-review.js';
import { judgePanelBeforeWriting, type PanelEvent, type PanelOutcome } from '../lib/autopilot/panel-proof.js';
import {
  renderPullRequestBody,
  type ExcludedTicket,
  type ReconciliationDecision,
  type TicketProvenance,
} from '../lib/autopilot/pr-body.js';
import {
  accountCiRuns,
  buildPublishPlan,
  type ExistingPullRequest,
  type PublishPlan,
} from '../lib/autopilot/publish-plan.js';
import { assessProofs, type ProofAssessment, type ProofContext, type VerificationProof } from '../lib/autopilot/proof-invalidation.js';
import {
  judgeRangeProofs,
  type ProofEvidence,
  type RangeVerdict as ProofRangeVerdict,
  type RequiredProof,
} from '../lib/autopilot/required-proof.js';
import { judgeUnitBudget, type UnitBudgetVerdict, type UnitCeilings, type UnitSpend } from '../lib/autopilot/unit-budget.js';
import {
  buildVerificationPlan,
  judgeVerification,
  type CommandOutcome,
  type VerificationPlan,
  type VerificationVerdict,
} from '../lib/autopilot/verification-plan.js';
import { buildOrchestrationPlan, type OrchestrationPlan } from '../lib/autopilot/orchestration-plan.js';
import { resolveClusterOutcome, type ClusterOutcome, type WorkerFailure } from '../lib/autopilot/partial-success.js';
import { buildReconcilePlan, type ReconcilePlan, type VerifiedRange } from '../lib/autopilot/reconcile-plan.js';
import { parseWorkerResult, type WorkerResult } from '../lib/autopilot/worker-result.js';
import { orderWorkers, type OrderFootprint } from '../lib/autopilot/worker-order.js';
import { planWorktreeSetup, planWorktreeTeardown } from '../lib/autopilot/worktree-lifecycle.js';
import {
  type ConfirmationInput,
  confirmReservation,
  planReservation,
  type ReservationRequest,
} from '../lib/autopilot/cluster-reservation.js';
import { autopilotFailure, renderAutopilotFailure, toAutopilotFailure } from '../lib/autopilot/errors.js';
import { decideChainStep, type ChainObservation } from '../lib/autopilot/chain-step.js';
import { readProgramDescriptor } from '../lib/autopilot/program.js';
import {
  INPUT_SHAPES,
  markerTemplate,
  scaffoldFor,
  validateAgainstShape,
  type AutopilotInputStep,
} from '../lib/autopilot/input-shape.js';
import {
  type PullRequestObservation,
  recoverRemote,
  type RecoveryVerdict,
} from '../lib/autopilot/remote-recovery.js';
import type { RunState, TicketRunState } from '../lib/autopilot/run-state.js';
import { listRunIds, readRun, writeRun } from '../lib/autopilot/state-store.js';
import {
  type ActionReceipt,
  type LifecycleInput,
  type LifecyclePlan,
  type LifecycleTicket,
  planTrackerLifecycle,
  reconcileLifecycle,
} from '../lib/autopilot/tracker-lifecycle.js';
import {
  type BoundaryReading,
  type NextAction,
  nextAction,
  type PullRequestReading,
  type RawReading,
  readBoundary,
  type RunSituation,
  type TrackerReading,
} from '../lib/autopilot/transition-oracle.js';

export interface AutopilotCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: 0 | 2;
}

export interface AutopilotCommandContext {
  /** Project root under which .void/autopilot lives. */
  readonly root: string;
  /** ISO instant used to age leases; injected so the surface stays testable. */
  readonly now: string;
}

const USAGE = `
void-harness autopilot — deterministic planning for the attended cluster mode.

Invoked by the /void-autopilot skill, which hydrates observations from the
tracker and pipes them in. The CLI computes; it never contacts Linear, GitHub or
git, and it spawns no agent.

Usage:
  void-harness autopilot scaffold <plan|start|status|marker> [--json]
  echo '<CandidateObservation>'  | void-harness autopilot plan   [--json]
  echo '<ChainObservation>'      | void-harness autopilot chain  [--for <2h|90m>] [--json]
  echo '<ReservationReceipt>'    | void-harness autopilot start  [--json]
  echo '<RemoteObservation>'     | void-harness autopilot status [--run <id>] [--json]
  echo '<RemoteObservation>'     | void-harness autopilot resume [--run <id>] [--json]
  void-harness autopilot abort [--run <id>] [--json]

--run is optional everywhere. With no run, a single non-terminal run is resumed;
several return competing-runs and nothing is touched.

stdin JSON (CandidateObservation):
  {
    "schemaVersion": 1,
    "tickets":    [{ "id", "ready", "priority", "boardOrder", "blockedByOpen",
                     "dependsOn": [], "estimate": number | null }],
    "footprints": [{ "id", "areas": [], "highRisk": false, "confidence": 0..1 }],
    "clusterSize":   4,    // optional ceiling, 1..4 (default 4)
    "minConfidence": 0.5   // optional; below it a footprint is doubtful
  }

stdin JSON (ReservationReceipt): { "intent", "applied": [], "reobservation" }
stdin JSON (RemoteObservation):  { "tracker", "pullRequest", "workerRefs",
                                   "trackerStates"?, "ticketStates"? }

pullRequest carries either a bare state ("open" | "merged" | "closed") or the
full observation — number, state, headRef, headSha, baseRef, baseSha, mergeSha,
checks. Only the full form yields a recovery verdict: a bare "open" cannot tell a
branch that matches the local tree from one whose base moved underneath it.

Add trackerStates: { "review", "done" } to also get the tracker lifecycle plan.
Without it no transition is planned — the CLI never guesses what your board calls
a state. ticketStates maps a ticket id to its observed state, so a write that
would change nothing is skipped rather than sent.

There is no --auto-merge flag. A machine merge is declared once in the program
(autopilot.mergeGate: union-reviewed, plus deployBranch), and is granted only for
a target that does not deploy and a union review that came back clean.
`.trimStart();

function ok(stdout: string): AutopilotCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr: string): AutopilotCommandResult {
  return { stdout: '', stderr, exitCode: 2 };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      `\`${flag}\` was given without a value`,
      'the flag consumed the next argument, which is another flag or missing',
      `pass a value after \`${flag}\`, or drop the flag entirely`,
    );
  }
  return value;
}

function parseStdin<T>(stdin: string, what: string, step?: AutopilotInputStep): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdin);
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `the ${what} on stdin is not valid JSON`,
      error instanceof Error ? error.message : String(error),
      step === undefined
        ? `pipe the ${what} the skill produced, unmodified, into this command`
        : `run \`void-harness autopilot scaffold ${step}\` for the shape this step accepts`,
    );
  }
  // Validate before the command reads a field. Without this a missing
  // `state.base` surfaced as `Cannot read properties of undefined (reading
  // 'branch')` from wherever it happened to be read, which names neither the
  // field nor where to obtain it.
  if (step !== undefined) validateAgainstShape(parsed, step);
  return parsed as T;
}

/** A run nobody needs to act on again. */
function isTerminal(state: RunState): boolean {
  return state.integration.prState === 'merged' && state.trackerSynced;
}

/**
 * Resolve which run a command acts on.
 *
 * With no `--run`, exactly one non-terminal run may be resumed. Several is
 * `competing-runs` and touches nothing: guessing between two live clusters is
 * how a session adopts work that belongs to another.
 */
function resolveRun(context: AutopilotCommandContext, explicit: string | undefined): RunState {
  if (explicit !== undefined) {
    const state = readRun(context.root, explicit);
    if (state === undefined) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        `this clone knows no run \`${explicit}\``,
        'no cursor for that run exists under .void/autopilot',
        'run `void-harness autopilot status` with no --run to list what this clone knows',
      );
    }
    return state;
  }

  const live = listRunIds(context.root)
    .map((runId) => readRun(context.root, runId))
    .filter((state): state is RunState => state !== undefined && !isTerminal(state));

  if (live.length === 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'this clone has no run in flight',
      'no non-terminal run cursor exists under .void/autopilot',
      'plan a cluster and start it before asking for its status',
    );
  }
  if (live.length > 1) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'competing-runs: this clone holds more than one run in flight',
      `runs ${live.map((state) => state.runId).join(', ')} are all non-terminal`,
      'name the run with --run, or abort the ones that are no longer wanted',
    );
  }
  return live[0] as RunState;
}

/**
 * A remote observation, in either shape the skill may produce.
 *
 * `pullRequest` carries a bare state when nothing more was read, or the full
 * observation once the run has something published to compare against. The
 * detailed form is what recovery needs: a bare `open` cannot tell a branch that
 * matches the local tree from one whose base moved underneath it.
 */
interface RemoteObservation {
  readonly tracker: RunSituation['tracker'];
  readonly pullRequest: BoundaryReading<PullRequestReading | PullRequestObservation>;
  readonly workerRefs: RunSituation['workerRefs'];
  /** Native state names the tracker lifecycle transitions into. */
  readonly trackerStates?: { readonly review: string; readonly done: string };
  /** Native state currently observed per ticket, used to skip redundant writes. */
  readonly ticketStates?: Record<string, string>;
}

interface Resolved {
  readonly situation: RunSituation;
  readonly recovery?: RecoveryVerdict | undefined;
  /** Absent whenever the observation did not name the tracker's own states. */
  readonly lifecycle?: LifecyclePlan | undefined;
}

function isDetailed(value: PullRequestReading | PullRequestObservation): value is PullRequestObservation {
  return typeof value === 'object' && value !== null;
}

/** Reduce a detailed observation to what the transition oracle reasons about. */
function narrow(
  reading: BoundaryReading<PullRequestReading | PullRequestObservation>,
): BoundaryReading<PullRequestReading> {
  if (reading.kind !== 'value') return reading;
  return { kind: 'value', value: isDetailed(reading.value) ? reading.value.state : reading.value };
}

function rangeOf(state: RunState, ticket: TicketRunState): string | undefined {
  const head = ticket.commits[ticket.commits.length - 1];
  return head === undefined ? undefined : `${state.base.sha.slice(0, 12)}..${head.slice(0, 12)}`;
}

function lifecycleTickets(state: RunState, observed: Record<string, string>): LifecycleTicket[] {
  return state.tickets.map((ticket) => {
    const common = {
      id: ticket.id,
      // Unknown rather than assumed: an empty state matches no target, so the
      // write is planned and the tracker itself settles whether it was needed.
      state: observed[ticket.id] ?? '',
    };
    if (ticket.phase !== 'committed') {
      return {
        ...common,
        disposition: 'excluded' as const,
        cause: ticket.blocker ?? `the ticket stopped at phase \`${ticket.phase}\``,
        resume: `resolve the blocker on ${ticket.id}, then plan a new cluster for it`,
      };
    }
    const range = rangeOf(state, ticket);
    return {
      ...common,
      disposition: 'included' as const,
      ...(range === undefined ? {} : { range }),
    };
  });
}

/**
 * Plan the tracker moves this verdict justifies, or none.
 *
 * None is the common answer: without the program's own state names the CLI
 * would have to guess what "review" is called, and a guessed transition is a
 * ticket moved to a state the board does not have.
 */
function lifecycleFor(
  state: RunState,
  observation: RemoteObservation,
  recovery: RecoveryVerdict,
): LifecyclePlan | undefined {
  const states = observation.trackerStates;
  if (states === undefined) return undefined;

  const stage = recovery.kind === 'merged' ? 'merged' : recovery.kind === 'ready' ? 'published' : undefined;
  if (stage === undefined) return undefined;

  return planTrackerLifecycle({
    stage,
    runId: state.runId,
    states,
    pullRequest:
      recovery.pullRequestNumber === null || state.integration.prUrl === null
        ? null
        : { number: recovery.pullRequestNumber, url: state.integration.prUrl },
    mergeSha: recovery.mergeSha,
    tickets: lifecycleTickets(state, observation.ticketStates ?? {}),
  });
}

function situationFrom(state: RunState, stdin: string): Resolved {
  const observation = parseStdin<Partial<RemoteObservation>>(stdin, 'remote observation', 'status');
  if (
    observation?.tracker === undefined ||
    observation?.pullRequest === undefined ||
    observation?.workerRefs === undefined
  ) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the remote observation does not cover every boundary',
      'a remote observation must carry `tracker`, `pullRequest` and `workerRefs`',
      'observe all three boundaries and pass them together; the CLI never fills one in for you',
    );
  }

  const situation: RunSituation = {
    state,
    tracker: observation.tracker,
    pullRequest: narrow(observation.pullRequest),
    workerRefs: observation.workerRefs,
  };

  // Recovery needs something published to compare the remote against. Before
  // reconciliation there is no integration head, and every remote answer would
  // be about a branch this run has not produced yet.
  const detailed =
    observation.pullRequest.kind !== 'value' || isDetailed(observation.pullRequest.value);
  const integration = state.integration;
  if (!detailed || integration.branch === null || integration.headSha === null) {
    return { situation };
  }

  const recovery = recoverRemote({
    expected: {
      integrationBranch: integration.branch,
      integrationSha: integration.headSha,
      baseBranch: state.base.branch,
      baseSha: state.base.sha,
    },
    pullRequest: observation.pullRequest as BoundaryReading<PullRequestObservation>,
  });

  return {
    situation,
    recovery,
    lifecycle: lifecycleFor(state, observation as RemoteObservation, recovery),
  };
}

function renderPlan(plan: ClusterPlan): string {
  const lines: string[] = [];
  lines.push(`cluster (${plan.cluster.length}): ${plan.cluster.join(', ') || 'none'}`);
  lines.push(`  parallel:   ${plan.parallel.join(', ') || 'none'}`);
  lines.push(
    `  sequential: ${
      plan.sequential.map((t) => `${t.id} (${t.reasons.join(', ')})`).join(', ') || 'none'
    }`,
  );

  const budget = plan.reviewBudget;
  lines.push(
    `review budget: ${budget.spent}/${budget.capacity} units, tracker estimate ${budget.totalEstimate} point(s)${
      budget.unestimated.length > 0 ? ` (unestimated: ${budget.unestimated.join(', ')})` : ''
    }`,
  );

  if (plan.excluded.length > 0) {
    lines.push('excluded:');
    for (const excluded of plan.excluded) lines.push(`  ${excluded.id}: ${excluded.cause}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderRun(state: RunState, action: NextAction | undefined, recovery?: RecoveryVerdict): string {
  const lines: string[] = [];
  lines.push(`run ${state.runId} — cluster ${state.clusterId} on ${state.base.branch}@${state.base.sha.slice(0, 7)}`);
  for (const ticket of state.tickets) {
    const commits = ticket.commits.length === 0 ? 'no commit' : `${ticket.commits.length} commit(s)`;
    lines.push(`  ${ticket.id}: ${ticket.phase} (${commits})${ticket.blocker === null ? '' : ` — ${ticket.blocker}`}`);
  }
  lines.push(
    `integration: ${state.integration.branch ?? 'none'} · pull request ${state.integration.prState}${
      state.integration.prUrl === null ? '' : ` (${state.integration.prUrl})`
    }`,
  );
  if (recovery !== undefined) lines.push(`recovery: ${recovery.kind} — ${recovery.detail}`);
  if (action !== undefined) lines.push(`next: ${action.kind} — ${action.detail}`);
  return `${lines.join('\n')}\n`;
}

function emit(json: boolean, value: unknown, human: string): AutopilotCommandResult {
  return ok(json ? `${JSON.stringify(value, null, 2)}\n` : human);
}

function scaffoldCommand(argv: readonly string[], json: boolean): AutopilotCommandResult {
  const step = argv[0];
  // The marker is not a step's payload, it is a comment body, so it is scaffolded
  // here rather than left as the one thing a run still had to read source for.
  if (step === 'marker') {
    return ok(`${markerTemplate()}\n`);
  }
  if (step === undefined || !Object.hasOwn(INPUT_SHAPES, step)) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'scaffold needs the step whose shape you want',
      step === undefined ? 'no step was named' : `\`${step}\` is not a step`,
      `name one of ${Object.keys(INPUT_SHAPES).join(', ')}, marker`,
    );
  }
  const known = step as AutopilotInputStep;
  const shape = INPUT_SHAPES[known];
  const body = `${JSON.stringify(scaffoldFor(known), null, 2)}\n`;
  if (json) return ok(body);
  // The human rendering carries WHERE each field comes from. The JSON is what a
  // caller pipes back in; the notes are what stop them reading the types.
  const notes = shape.fields
    .map((field) => `  ${field.name.padEnd(24)} ${field.from}`)
    .join('\n');
  return ok(`# ${shape.what}\n${body}\n# where each field comes from\n${notes}\n`);
}

function chainCommand(
  argv: readonly string[],
  stdin: string,
  json: boolean,
  context: AutopilotCommandContext,
): AutopilotCommandResult {
  const observation = parseStdin<ChainObservation>(stdin, 'chain observation', 'chain');
  const descriptor = readProgramDescriptor(context.root);
  // A consent taken back is refused here, where the next unit would be taken,
  // and not only reported by doctor. It is the same refusal as an absent block
  // and a different sentence: someone who wrote `enabled: false` is reading a
  // block that is right there, and "carries no autopilot block" would send them
  // hunting for a file problem they do not have.
  if (descriptor?.autopilotConsentWithheld === true) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the programme has taken back its consent to run unattended',
      '`.void/program.md` declares `autopilot.enabled: false`',
      'set `autopilot.enabled: true`, or remove the field; the rest of the block stays as it is',
    );
  }
  if (descriptor?.autopilot === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the chain needs the programme to declare an autopilot block',
      '`.void/program.md` is absent, unreadable, or carries no `autopilot` block',
      'declare `autopilot` in `.void/program.md`; that block is the consent to run unattended',
    );
  }
  const requested = flagValue(argv, '--for');
  const step = decideChainStep(
    { ...observation, ...(requested === undefined ? {} : { requested }) },
    descriptor.autopilot,
  );
  // The disposition is on both arms on purpose. Someone watching a long run
  // should not meet a different surface depending on whether it ended.
  const human = step.decision.kind === 'continue'
    ? `continue: take ${step.nextUnit ?? '(none)'} — ${step.decision.detail}\n${step.disposition}\n`
    : `stop (${step.decision.reason}): ${step.decision.detail}\nfix: ${step.decision.fix}\n`
      + `${step.disposition}\n`;
  return emit(json, step, human);
}

/**
 * What a confirmed cluster becomes: lanes, assignments, and the git commands.
 *
 * The step between "these tickets" and "this worker is running" was prose in the
 * skill, and the four functions that compute it -- ordering, assignment, setup,
 * teardown -- had no caller anywhere. A run that follows a paragraph decides
 * which tickets may write at once by reading, which is the one decision that
 * must not depend on anybody having read carefully.
 *
 * Nothing here touches the repository. It returns argv the caller executes, so
 * the step stays testable without a git tree and the executor stays visible.
 */
interface OrchestrationObservation {
  readonly runId: string;
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly tickets: readonly string[];
  readonly footprints: readonly OrderFootprint[];
  readonly sequentialOwnership?: readonly string[];
  readonly minConfidence?: number;
  readonly clusterSize: number;
  readonly planPath: string;
  readonly specPath: string;
}

interface OrchestrationOutcome {
  readonly schemaVersion: 1;
  readonly plan: OrchestrationPlan;
  /** Why each sequenced ticket lost its parallel slot. */
  readonly reasons: Readonly<Record<string, readonly string[]>>;
  readonly setup: readonly { readonly ticketId: string; readonly command: readonly string[] }[];
  readonly teardown: readonly { readonly ticketId: string; readonly command: readonly string[] }[];
}

function orchestrateCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<OrchestrationObservation>(stdin, 'orchestration observation');
  const order = orderWorkers({
    tickets: observation.tickets,
    footprints: observation.footprints,
    sequentialOwnership: observation.sequentialOwnership ?? [],
    ...(observation.minConfidence === undefined ? {} : { minConfidence: observation.minConfidence }),
  });
  const plan = buildOrchestrationPlan({
    runId: observation.runId,
    clusterId: observation.clusterId,
    base: observation.base,
    parallel: order.parallel,
    sequential: order.sequential,
    clusterSize: observation.clusterSize,
    planPath: observation.planPath,
    specPath: observation.specPath,
  });
  const outcome: OrchestrationOutcome = {
    schemaVersion: 1,
    plan,
    reasons: order.reasons,
    setup: planWorktreeSetup(plan),
    teardown: planWorktreeTeardown(plan),
  };
  const human = [
    `${String(plan.assignments.length)} assignment(s), width ${String(plan.concurrency)}`,
    ...plan.assignments.map((assignment) => {
      const why = order.reasons[assignment.ticketId];
      const because = why === undefined || why.length === 0 ? '' : ` — ${why.join(', ')}`;
      return `  ${assignment.ticketId.padEnd(10)} ${assignment.lane}${because}`;
    }),
    '',
    'before any worker:',
    ...outcome.setup.map((step) => `  ${step.command.join(' ')}`),
    '',
    'once the run is done with them:',
    ...outcome.teardown.map((step) => `  ${step.command.join(' ')}`),
    '',
  ].join('\n');
  return emit(json, outcome, human);
}

/**
 * What the run does with what came back from the workers.
 *
 * Four steps that were a paragraph in the skill: parse each answer, resolve
 * which of them the cluster can integrate, check every range against what GIT
 * says rather than what the worker claimed, and state the merge as commands.
 *
 * The order is the safety. A worker's own report is never evidence: the range
 * is verified against an observation of the repository, and a head the worker
 * claims but git does not have is excluded rather than merged.
 */
interface ReconcileObservation {
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly cluster: readonly string[];
  readonly results: readonly unknown[];
  readonly failures?: readonly WorkerFailure[];
  readonly observations: readonly RangeObservation[];
  readonly reconcileOnly?: readonly string[];
  readonly rebuildCommand?: readonly string[];
  readonly maxCommits?: number;
}

/**
 * A cluster where nothing survived carries no merge plan, and says so.
 *
 * `buildReconcilePlan` refuses an empty range, which is right for a merge but
 * wrong for a cycle: every worker blocked is an ordinary outcome of a run, not
 * a misuse of the command. The shape says which of the two happened rather than
 * handing back an empty plan that reads like a merge with nothing in it.
 */
type ReconcileOutcome =
  | { readonly schemaVersion: 1; readonly outcome: ClusterOutcome; readonly plan: ReconcilePlan }
  | { readonly schemaVersion: 1; readonly outcome: ClusterOutcome };

function reconcileCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<ReconcileObservation>(stdin, 'reconcile observation');
  // Parsed one by one so a malformed answer names its own ticket. A worker whose
  // result cannot be read is not an integration candidate, and pretending it is
  // one would merge a range nobody described.
  const parsed: WorkerResult[] = [];
  const failures: WorkerFailure[] = [...(observation.failures ?? [])];
  for (const raw of observation.results) {
    try {
      parsed.push(parseWorkerResult(raw));
    } catch (error) {
      const ticketId = (raw as { ticketId?: unknown }).ticketId;
      failures.push({
        ticketId: typeof ticketId === 'string' ? ticketId : 'unknown',
        detail: error instanceof Error ? error.message : 'the worker result could not be read',
      });
    }
  }

  const outcome = resolveClusterOutcome({
    cluster: observation.cluster,
    results: parsed,
    failures,
  });

  const observed = new Map(observation.observations.map((entry) => [entry.ticketId, entry]));
  const ranges: VerifiedRange[] = outcome.integrate.map((ticketId) => {
    const result = parsed.find((entry) => entry.ticketId === ticketId);
    const sighting = observed.get(ticketId);
    const verdict = sighting === undefined
      ? {
          kind: 'rejected' as const,
          ticketId,
          reason: 'malformed-observation' as const,
          detail: 'git was never observed for this range, and a claim is not an observation',
        }
      : verifyRange(sighting, {
          declaredCommits: result?.commits ?? [],
          ...(observation.maxCommits === undefined ? {} : { maxCommits: observation.maxCommits }),
        });
    return {
      ticketId,
      branch: result?.branch ?? '',
      headSha: sighting?.headSha ?? '',
      verdict,
      files: result?.files ?? [],
    };
  });

  if (ranges.length === 0) {
    const nothing = [
      `${outcome.kind}: no range survived the cluster`,
      ...outcome.excluded.map((entry) => `  excluded ${entry.ticketId}: ${entry.reason} — ${entry.detail}`),
      '',
      'Every branch the run created is preserved, so nothing is lost by stopping here.',
      '',
    ].join('\n');
    return emit(json, { schemaVersion: 1, outcome } satisfies ReconcileOutcome, nothing);
  }

  const plan = buildReconcilePlan({
    clusterId: observation.clusterId,
    base: observation.base,
    ranges,
    reconcileOnly: observation.reconcileOnly ?? [],
    ...(observation.rebuildCommand === undefined ? {} : { rebuildCommand: observation.rebuildCommand }),
  });

  const human = [
    `${outcome.kind}: ${plan.integrate.length === 0 ? '(nothing)' : plan.integrate.join(', ')}`,
    ...outcome.excluded.map((entry) => `  excluded ${entry.ticketId}: ${entry.reason}`),
    ...plan.excluded.map((entry) => `  excluded ${entry.ticketId}: ${entry.reason}`),
    '',
    `integration branch: ${plan.integrationBranch}`,
    ...plan.steps.map((step) => `  ${step.command.join(' ')}`),
    '',
    'Every branch above is preserved. Nothing here deletes a worker branch.',
    '',
  ].join('\n');
  return emit(json, { schemaVersion: 1, outcome, plan } satisfies ReconcileOutcome, human);
}

/**
 * The suite that decides a merge, stated rather than improvised.
 *
 * Bounded on purpose: a command with no ceiling is how an unattended run spends
 * its whole budget waiting for something that already hung.
 */
interface VerificationObservation {
  readonly integrationSha: string;
  readonly commands: readonly (readonly string[])[];
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

function verifyCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<VerificationObservation>(stdin, 'verification observation');
  const plan = buildVerificationPlan({
    integrationSha: observation.integrationSha,
    commands: observation.commands,
    ...(observation.timeoutMs === undefined ? {} : { timeoutMs: observation.timeoutMs }),
    ...(observation.maxOutputBytes === undefined ? {} : { maxOutputBytes: observation.maxOutputBytes }),
  });
  const human = [
    `on ${plan.integrationSha.slice(0, 7)}, ${String(plan.commands.length)} command(s):`,
    ...plan.commands.map((command) => `  ${command.command.join(' ')} (${String(command.timeoutMs)}ms)`),
    '',
  ].join('\n');
  return emit(json, plan, human);
}

/**
 * Everything a unit must satisfy before its range may merge, judged at once.
 *
 * Four judgements that used to be four paragraphs: did the declared proofs
 * actually run against THIS tree, did the panel speak before the writing, did
 * the unit stay inside its ceilings, and is the evidence still fresh. They are
 * answered together because they answer one question, and a caller who has to
 * remember the fourth is a caller who will forget it.
 *
 * Absence of a record is absence of the act, on every one of them.
 */
interface GateObservation {
  readonly mergedTreeHash: string;
  readonly required: readonly RequiredProof[];
  readonly evidence: readonly ProofEvidence[];
  readonly panel?: readonly PanelEvent[];
  readonly spend?: UnitSpend;
  readonly ceilings?: UnitCeilings;
  readonly outcomes?: readonly CommandOutcome[];
  readonly plan?: VerificationPlan;
  readonly freshness?: { readonly proofs: readonly VerificationProof[]; readonly context: ProofContext };
}

interface GateVerdict {
  readonly schemaVersion: 1;
  readonly proofs: ProofRangeVerdict;
  readonly panel?: PanelOutcome;
  readonly budget?: UnitBudgetVerdict;
  readonly suite?: VerificationVerdict;
  readonly freshness?: ProofAssessment;
}

function gateCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<GateObservation>(stdin, 'gate observation');
  const proofs = judgeRangeProofs(observation.required, observation.evidence, observation.mergedTreeHash);
  const panel = observation.panel === undefined ? undefined : judgePanelBeforeWriting(observation.panel);
  const budget = observation.spend === undefined || observation.ceilings === undefined
    ? undefined
    : judgeUnitBudget(observation.spend, observation.ceilings);
  const suite = observation.plan === undefined || observation.outcomes === undefined
    ? undefined
    : judgeVerification(observation.plan, observation.outcomes);
  const freshness = observation.freshness === undefined
    ? undefined
    : assessProofs(observation.freshness.proofs, observation.freshness.context);

  const verdict: GateVerdict = {
    schemaVersion: 1,
    proofs,
    ...(panel === undefined ? {} : { panel }),
    ...(budget === undefined ? {} : { budget }),
    ...(suite === undefined ? {} : { suite }),
    ...(freshness === undefined ? {} : { freshness }),
  };

  const lines = [
    proofs.kind === 'merge'
      ? `proofs: merge${proofs.debts.length === 0 ? '' : ` with ${String(proofs.debts.length)} debt(s)`}`
      : `proofs: refuse (${proofs.action}) — ${proofs.detail}`,
    ...proofs.debts.map((debt) => `  debt ${debt.proof} (${debt.severity}): ${debt.reason}`),
    ...(panel === undefined ? [] : [`panel: ${panel.kind === 'satisfied' ? 'spoke before the writing' : `${panel.reason} — ${panel.detail}`}`]),
    ...(budget === undefined ? [] : [`budget: ${budget.kind === 'within' ? 'within its ceilings' : `exhausted ${budget.ceiling}`}`]),
    ...(suite === undefined ? [] : [`suite: ${suite.green ? 'green' : `red — ${suite.failures.map((failure) => failure.name).join(', ')}`}`]),
    '',
  ];
  return emit(json, verdict, lines.join('\n'));
}

/**
 * One branch, one explicit refspec, one pull request that carries its own
 * provenance.
 *
 * The body is rendered here rather than written by whoever publishes, because
 * the body IS the account: what merged, on what evidence, what was left out and
 * how to resume it. A summary somebody types afterwards is a different artefact
 * with the same name.
 *
 * The CI count travels through `accountCiRuns` so an undecidable trigger budget
 * comes back as "cannot be stated" rather than as a number a reader would take
 * on trust.
 */
interface PublishObservation {
  readonly clusterId: string;
  readonly remote: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly integrationSha: string;
  readonly proofs: ProofAssessment;
  readonly workerBranches: readonly string[];
  readonly existingPullRequest?: ExistingPullRequest | null;
  readonly included: readonly TicketProvenance[];
  readonly excluded: readonly ExcludedTicket[];
  readonly decisions: readonly ReconciliationDecision[];
  readonly verification: readonly { readonly name: string; readonly passed: boolean }[];
  readonly ci: { readonly expectedRunsPerPush: number | null; readonly pushes: number; readonly unknowns: readonly string[] };
  readonly blockers: readonly string[];
}

function publishCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<PublishObservation>(stdin, 'publish observation');
  const plan: PublishPlan = buildPublishPlan({
    clusterId: observation.clusterId,
    remote: observation.remote,
    base: { branch: observation.base.branch },
    integrationSha: observation.integrationSha,
    proofs: observation.proofs,
    workerBranches: observation.workerBranches,
    ...(observation.existingPullRequest === undefined
      ? {}
      : { existingPullRequest: observation.existingPullRequest }),
  });
  const ci = accountCiRuns(observation.ci);
  const body = renderPullRequestBody({
    clusterId: observation.clusterId,
    base: observation.base,
    integrationSha: observation.integrationSha,
    included: observation.included,
    excluded: observation.excluded,
    decisions: observation.decisions,
    verification: observation.verification,
    ci,
    blockers: observation.blockers,
  });

  const human = [
    `integration branch: ${plan.integrationBranch}`,
    ...plan.steps.map((step) => `  ${step.command.join(' ')}`),
    ...plan.blocked.map((block) => `  BLOCKED ${block.reason}: ${block.detail}`),
    '',
    `pull request: ${plan.pullRequest.number === null ? 'to create' : `#${String(plan.pullRequest.number)}`}`,
    `  body -> ${plan.pullRequest.bodyPath}`,
    '',
  ].join('\n');
  return emit(json, { schemaVersion: 1, plan, ci, body }, human);
}

/**
 * Whether this integration branch may merge itself, and what to do next.
 *
 * The grant is the product's trust boundary, and it fails closed on every input:
 * an unobserved protection reads like an unprotected branch, an unread union
 * reads like a refusal, and the branch that deploys is never a target whatever
 * the reading says.
 *
 * The request a reader would answer travels back with a refusal for
 * `union-unread`, so nobody assembles it by hand -- which is how a reading gets
 * skipped, and a skipped reading is exactly what this refuses.
 */
interface GrantObservation {
  readonly target: string;
  readonly deployBranch: string;
  readonly integrationBranch: string;
  readonly integrationSha: string;
  readonly baseSha: string;
  readonly tickets: readonly string[];
  readonly humanGates: readonly string[];
  readonly protection?: Parameters<typeof judgeMergeGrant>[0]['protection'];
  readonly changedPaths?: readonly string[];
  readonly mergeBlocks?: readonly string[];
  readonly checks: CheckStand;
  /** What the reader returned. `null` says plainly that none ran. */
  readonly review: UnionReview | null;
  readonly declaredLenses: number;
  readonly capability: Parameters<typeof buildUnionReviewRequest>[0]['capability'];
}

function grantCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<GrantObservation>(stdin, 'merge grant observation');
  // An absent reading is not an inconclusive one, and neither is an approval.
  // Both refuse, and they refuse under names that send a reader to different
  // places: one to run the pass, one to read what it could not settle.
  const review = observation.review ?? undefined;
  const grant: MergeGrant = judgeMergeGrant({
    target: observation.target,
    deployBranch: observation.deployBranch,
    integrationSha: observation.integrationSha,
    review,
    tickets: observation.tickets,
    humanGates: observation.humanGates,
    protection: observation.protection,
    changedPaths: observation.changedPaths,
    mergeBlocks: observation.mergeBlocks,
  });
  const action = planPostCheckAction({ checks: observation.checks, grant });
  const request = review === undefined
    ? buildUnionReviewRequest({
        integrationBranch: observation.integrationBranch,
        integrationSha: observation.integrationSha,
        baseSha: observation.baseSha,
        ticketIds: observation.tickets,
        declaredLenses: observation.declaredLenses,
        capability: observation.capability,
      })
    : undefined;

  const human = [
    grant.kind === 'granted'
      ? `grant: granted${grant.advisories.length === 0 ? '' : ` (${String(grant.advisories.length)} advisory finding(s) filed)`}`
      : `grant: refused (${grant.reason}) — ${grant.detail}`,
    `next: ${action.action} — ${action.detail}`,
    ...(request === undefined
      ? []
      : ['', 'the reading nobody ran:', `  ${request.diffCommand.join(' ')}`]),
    '',
  ].join('\n');
  return emit(
    json,
    {
      schemaVersion: 1,
      grant,
      action,
      ...(request === undefined ? {} : { request }),
    },
    human,
  );
}

/**
 * Which branch a run integrates into, and whether it is really protected.
 *
 * The two questions travel together because the answer to the first decides
 * what the second is asked about. And the protection is INTERPRETED from the
 * raw response rather than read off a boolean somebody set: an unauthenticated
 * `gh`, a network blip and a genuinely open branch look identical from the
 * outside, and only one of them is safe to merge into.
 */
interface BaseSelectionObservation extends BaseObservation {
  readonly protection?: ProtectionResponse;
}

function baseCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<BaseSelectionObservation>(stdin, 'base observation');
  const base: BaseSelection = selectBase(observation);
  const protection = observation.protection === undefined || base.kind !== 'selected'
    ? undefined
    : decideBranchProtection(interpretProtectionResponse(observation.protection), base.branch);

  const human = [
    base.kind === 'selected'
      ? `base: ${base.branch} at ${base.sha.slice(0, 7)}`
      : `base: blocked (${base.reason}) — ${base.detail}`,
    ...(protection === undefined
      ? []
      : [`protection: ${protection.allowed ? 'protected' : `refused (${protection.reason})`} — ${protection.detail}`]),
    '',
  ].join('\n');
  return emit(json, { schemaVersion: 1, base, ...(protection === undefined ? {} : { protection }) }, human);
}

/**
 * Classify what each boundary actually answered, before anything reads it.
 *
 * A source that failed AND returned a value is a contradiction, not a value and
 * not a failure; an empty answer is not an absent one. Leaving that
 * classification to whoever observes is how a run resumes on a fact nobody
 * established, so it is code here rather than care there.
 */
interface RawObservation {
  readonly tracker: RawReading<TrackerReading>;
  readonly pullRequest: RawReading<PullRequestReading>;
  readonly workerRefs: RawReading<readonly string[]>;
}

function observeCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const raw = parseStdin<RawObservation>(stdin, 'raw boundary observation');
  const observation = {
    schemaVersion: 1,
    tracker: readBoundary(raw.tracker),
    pullRequest: readBoundary(raw.pullRequest),
    workerRefs: readBoundary(raw.workerRefs),
  };
  const human = [
    `tracker:      ${observation.tracker.kind}`,
    `pullRequest:  ${observation.pullRequest.kind}`,
    `workerRefs:   ${observation.workerRefs.kind}`,
    '',
    'Pipe this into `autopilot resume` or `autopilot status`.',
    '',
  ].join('\n');
  return emit(json, observation, human);
}

/**
 * What the tracker owes once the run is over, and whether it got it.
 *
 * Planned and reconciled by the same command, because the second question is
 * meaningless without the first: a receipt for an action nobody planned is as
 * much a defect as a planned action with no receipt, and only a caller holding
 * both can say so. Receipts are optional -- without them this states the plan.
 *
 * An action whose precondition is not met is reported as skipped rather than
 * silently dropped. A ticket left in the wrong state after a merged run is the
 * residue nobody notices until the next run trips on it.
 */
interface LifecycleObservation extends LifecycleInput {
  readonly receipts?: readonly ActionReceipt[];
}

function lifecycleCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<LifecycleObservation>(stdin, 'lifecycle observation');
  const plan = planTrackerLifecycle(observation);
  const reconciliation = observation.receipts === undefined
    ? undefined
    : reconcileLifecycle(plan, observation.receipts);

  const human = [
    `${plan.stage}: ${String(plan.actions.length)} action(s)`,
    ...plan.actions.map((action) => `  ${action.kind} ${action.ticketId ?? ''}`.trimEnd()),
    ...plan.skipped.map((skip) => `  skipped ${skip.kind} ${skip.ticketId}: ${skip.why}`),
    ...(reconciliation === undefined
      ? []
      : ['', `reconciliation: ${reconciliation.converged ? 'converged' : 'pending'} — ${reconciliation.detail}`]),
    '',
  ].join('\n');
  return emit(
    json,
    { ...plan, ...(reconciliation === undefined ? {} : { reconciliation }) },
    human,
  );
}

/**
 * Whether this run may take the cluster, and what it would do to take it.
 *
 * The moment two launches on one pool would collide. It answers with one of
 * four things -- resume our own lease, reserve a free cluster, name the
 * competing claims, or refuse -- and never with a boolean: "someone else holds
 * it" and "the observation is unusable" lead a person to different places.
 *
 * Nothing is written. The actions come back for the caller to apply, so the
 * decision stays testable without a tracker.
 */
function reserveCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const request = parseStdin<ReservationRequest>(stdin, 'reservation request');
  const outcome = planReservation(request);
  const human = outcome.kind === 'reserve'
    ? [
        `reserve: ${String(outcome.actions.length)} action(s)`,
        ...outcome.actions.map((action) => `  ${action.kind} ${action.issueId ?? ''}`.trimEnd()),
        '',
      ].join('\n')
    : outcome.kind === 'resume'
      ? `resume: this run already holds ${outcome.issues.join(', ')}\n`
      : outcome.kind === 'competing-claims'
        ? [
            'competing claims — nothing was taken:',
            ...outcome.claims.map((claim) => `  ${claim.issueId}: ${claim.reason}`),
            '',
          ].join('\n')
        : `blocked (${outcome.reason}): ${outcome.detail}\n`;
  return emit(json, outcome, human);
}

/**
 * Where the run is, and the commands that put it in front of a reader.
 *
 * The slice before this made the cycle unattended, and its gate -- no human
 * interaction between the launch and the pull request -- is satisfied by a run
 * that stalls at minute ten and contradicted by nothing. This closes that: after
 * every decision the run rewrites the body of a draft pull request, so the one
 * surface a person can read without a terminal is never older than the last
 * thing that happened.
 *
 * Silence is the subject. A quiet run and a dead one look identical, so the
 * body states which it is, judged against the ceiling a single unit may take.
 */
interface ProgressObservation {
  readonly runId: string;
  readonly clusterId: string;
  readonly remote: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly integrationSha: string;
  readonly workerBranches: readonly string[];
  readonly existingPullRequest?: ExistingPullRequest | null;
  readonly beats: readonly RunBeat[];
  readonly merged: readonly MergedUnit[];
  /** ISO instant of this reading. Passed in, never read from a clock here. */
  readonly now: string;
  readonly unitCeilingMs: number;
  readonly ended: boolean;
}

function progressCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const observation = parseStdin<ProgressObservation>(stdin, 'progress observation');
  const liveness = judgeLiveness({
    beats: observation.beats,
    now: observation.now,
    unitCeilingMs: observation.unitCeilingMs,
    ended: observation.ended,
  });
  const body = renderRunProgress({
    runId: observation.runId,
    base: observation.base,
    beats: observation.beats,
    liveness,
    journal: renderMergeJournal(observation.merged),
  });
  // Sealed proofs are what a MERGE owes. A draft owes nothing but honesty, so
  // it is published with an assessment that claims none.
  const plan = buildPublishPlan({
    clusterId: observation.clusterId,
    remote: observation.remote,
    base: { branch: observation.base.branch },
    integrationSha: observation.integrationSha,
    proofs: { schemaVersion: 1, statuses: [], missing: [], sealed: false },
    workerBranches: observation.workerBranches,
    draft: true,
    ...(observation.existingPullRequest === undefined
      ? {}
      : { existingPullRequest: observation.existingPullRequest }),
  });

  const human = [
    `${liveness.kind}: ${liveness.detail}`,
    '',
    `body -> ${plan.pullRequest.bodyPath}`,
    ...plan.steps.map((step) => `  ${step.command.join(' ')}`),
    '',
  ].join('\n');
  return emit(json, { schemaVersion: 1, liveness, body, plan }, human);
}

function planCommand(stdin: string, json: boolean): AutopilotCommandResult {
  const plan = planCluster(parseStdin<ClusterPlanInput>(stdin, 'candidate observation', 'plan'));
  return emit(json, plan, renderPlan(plan));
}

function startCommand(stdin: string, json: boolean, context: AutopilotCommandContext): AutopilotCommandResult {
  const receipt = parseStdin<ConfirmationInput & { readonly state: RunState }>(
    stdin,
    'reservation receipt',
    'start',
  );
  const outcome = confirmReservation({
    intent: receipt.intent,
    applied: receipt.applied ?? [],
    reobservation: receipt.reobservation,
    now: context.now,
  });

  // The cursor is written here and nowhere else: a run only exists locally once
  // the tracker has been re-observed and every ticket converged on our lease.
  if (outcome.kind === 'active') writeRun(context.root, receipt.state);
  return emit(json, outcome, `${outcome.kind}: ${'detail' in outcome ? outcome.detail : outcome.issues.join(', ')}\n`);
}

function statusCommand(
  argv: readonly string[],
  stdin: string,
  json: boolean,
  context: AutopilotCommandContext,
): AutopilotCommandResult {
  const state = resolveRun(context, flagValue(argv, '--run'));
  if (stdin.trim() === '') {
    // Read-only and honest: without a remote observation the CLI can describe
    // the cursor, never what the run should do next.
    const action: NextAction = {
      kind: 'remote-required',
      detail: 'no remote observation was provided, so only the local cursor is reported',
    };
    return emit(json, { state, next: action }, renderRun(state, action));
  }
  const { situation, recovery, lifecycle } = situationFrom(state, stdin);
  const action = nextAction(situation);
  return emit(
    json,
    { state, next: action, recovery, lifecycle },
    renderRun(state, action, recovery),
  );
}

function resumeCommand(
  argv: readonly string[],
  stdin: string,
  json: boolean,
  context: AutopilotCommandContext,
): AutopilotCommandResult {
  const state = resolveRun(context, flagValue(argv, '--run'));
  if (stdin.trim() === '') {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'resume was called without a remote observation',
      'resuming from the local cursor alone would act on a view nothing confirmed',
      'observe the tracker, the pull request and the worker refs, then pipe them into `autopilot resume`',
    );
  }
  const { situation, recovery, lifecycle } = situationFrom(state, stdin);
  const action = nextAction(situation);
  const human = [
    recovery === undefined ? undefined : `recovery: ${recovery.kind} — ${recovery.detail}`,
    `next: ${action.kind} — ${action.detail}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
  return emit(json, { runId: state.runId, next: action, recovery, lifecycle }, `${human}\n`);
}

function abortCommand(
  argv: readonly string[],
  json: boolean,
  context: AutopilotCommandContext,
): AutopilotCommandResult {
  const state = resolveRun(context, flagValue(argv, '--run'));
  // Abort releases the CLAIM, never the work: branches, commits and the cursor
  // stay exactly where they are so nothing is lost by giving the cluster back.
  const release = {
    runId: state.runId,
    clusterId: state.clusterId,
    releaseTickets: state.tickets.map((ticket) => ticket.id),
    preserved: {
      workerBranches: state.tickets.map((ticket) => ticket.branch).filter((branch): branch is string => branch !== null),
      integrationBranch: state.integration.branch,
      cursor: '.void/autopilot/<runId>/state.json',
    },
  };
  const human = [
    `abort ${state.runId}: release the lease on ${release.releaseTickets.join(', ')}`,
    `preserved: ${release.preserved.workerBranches.join(', ') || 'no worker branch'}${
      release.preserved.integrationBranch === null ? '' : `, ${release.preserved.integrationBranch}`
    }`,
    'nothing is deleted; the cursor is kept for inspection',
  ].join('\n');
  return emit(json, release, `${human}\n`);
}

export function runAutopilotCommand(
  argv: readonly string[],
  stdin: string,
  context?: AutopilotCommandContext,
): AutopilotCommandResult {
  const json = argv.includes('--json');

  try {
    if (argv.includes('--auto-merge')) {
      // Still refused on every path, and the capability existing now is why it
      // matters more, not less. Consent to a machine merge is a durable
      // declaration in the program -- same reasoning as `autopilot.enabled` --
      // never a switch someone can put on one invocation and forget.
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        'autopilot does not accept --auto-merge',
        'granting a merge is declared in the program, not passed to a run',
        'set `autopilot.mergeGate: union-reviewed` with a `deployBranch` in the program; the grant then needs a clean union review too',
      );
    }
    if (argv.includes('--help') || argv.includes('-h')) return ok(USAGE);

    const [subcommand] = argv.filter((arg) => !arg.startsWith('-') && argv[argv.indexOf(arg) - 1] !== '--run');
    if (subcommand === undefined) {
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        'autopilot was invoked without a subcommand',
        'the command cannot infer what you meant to do',
        'run `void-harness autopilot plan` with the observation on stdin, or --help',
      );
    }

    if (subcommand === 'plan') return planCommand(stdin, json);
    if (subcommand === 'orchestrate') return orchestrateCommand(stdin, json);
    if (subcommand === 'reconcile') return reconcileCommand(stdin, json);
    if (subcommand === 'verify') return verifyCommand(stdin, json);
    if (subcommand === 'gate') return gateCommand(stdin, json);
    if (subcommand === 'publish') return publishCommand(stdin, json);
    if (subcommand === 'progress') return progressCommand(stdin, json);
    if (subcommand === 'grant') return grantCommand(stdin, json);
    if (subcommand === 'reserve') return reserveCommand(stdin, json);
    if (subcommand === 'base') return baseCommand(stdin, json);
    if (subcommand === 'observe') return observeCommand(stdin, json);
    if (subcommand === 'lifecycle') return lifecycleCommand(stdin, json);
    if (subcommand === 'chain') {
      if (context === undefined) {
        throw autopilotFailure(
          'AUTOPILOT_CONTRACT',
          '`chain` needs a project root and a clock',
          'the command was invoked without an execution context',
          'invoke autopilot through the CLI entry point rather than calling it directly',
        );
      }
      return chainCommand(argv, stdin, json, context);
    }
    if (subcommand === 'scaffold') {
      const rest = argv.slice(argv.indexOf(subcommand) + 1).filter((arg) => !arg.startsWith('-'));
      return scaffoldCommand(rest, json);
    }

    const stateful = ['start', 'status', 'resume', 'abort'];
    if (!stateful.includes(subcommand)) {
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        `autopilot has no '${subcommand}' subcommand`,
        `known subcommands are scaffold, plan, orchestrate, reconcile, verify, gate, publish, progress, grant, base, observe, reserve, lifecycle, chain, ${stateful.join(', ')}`,
        'run `void-harness autopilot --help` for the full contract',
      );
    }
    if (context === undefined) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        `\`${subcommand}\` needs a project root and a clock`,
        'the command was invoked without an execution context',
        'invoke autopilot through the CLI entry point rather than calling it directly',
      );
    }

    switch (subcommand) {
      case 'start':
        return startCommand(stdin, json, context);
      case 'status':
        return statusCommand(argv, stdin, json, context);
      case 'resume':
        return resumeCommand(argv, stdin, json, context);
      default:
        return abortCommand(argv, json, context);
    }
  } catch (error) {
    return fail(renderAutopilotFailure(toAutopilotFailure(error), json));
  }
}

/**
 * The imperative shell around the pure surface above.
 *
 * `runAutopilotCommand` is a function of (argv, stdin, context); this reads the
 * two things it cannot — the pipe and the clock — writes what comes back, and
 * propagates the exit code. Everything decidable stays on the other side of that
 * line, which is why the whole contract is testable without a process.
 *
 * stdin is read only for the subcommands that take it. `plan` without a pipe
 * would otherwise hang on a terminal, waiting for input nobody is going to type.
 */
export async function autopilot(argv: readonly string[]): Promise<void> {
  const wantsStdin = argv.some((arg) => ['plan', 'chain', 'start', 'status', 'resume'].includes(arg));
  const stdin = wantsStdin && !process.stdin.isTTY ? await readAllStdin() : '';

  const result = runAutopilotCommand(argv, stdin, {
    root: process.cwd(),
    now: new Date().toISOString(),
  });

  if (result.stdout !== '') process.stdout.write(result.stdout);
  if (result.stderr !== '') process.stderr.write(result.stderr);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
