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
import { type ConfirmationInput, confirmReservation } from '../lib/autopilot/cluster-reservation.js';
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
  type LifecyclePlan,
  type LifecycleTicket,
  planTrackerLifecycle,
} from '../lib/autopilot/tracker-lifecycle.js';
import {
  type BoundaryReading,
  type NextAction,
  nextAction,
  type PullRequestReading,
  type RunSituation,
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
        `known subcommands are scaffold, plan, chain, ${stateful.join(', ')}`,
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
