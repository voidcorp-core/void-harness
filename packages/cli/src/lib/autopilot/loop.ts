// The deterministic kernel of the continuous loop: what each slot does next.
//
// Pure. It reads one complete observation (the programme, the tracker state the
// orchestrator hands over, GitHub as `gh` reported it, the stop signal) and
// returns typed actions. It remembers nothing between ticks, so a restart is an
// ordinary tick: the slots are rebuilt from Linear and GitHub, and a ticket that
// already holds one is resumed rather than seated twice.
//
// Agents keep their freedom over the work; every judgment they return is admitted
// by `judgments.ts` before it moves a slot, and one that does not fit is a
// refusal, never a default. Policy stays here: four slots at most, collisions by
// footprint and by `sequential` path, two review rounds, the stop conditions,
// one merge at a time without a merge queue, an ambiguous state to a human.

import { z } from 'zod';
import { autopilotFailure } from './errors.js';
import { areasOverlap, type CompiledArea, compileArea } from './footprint-area.js';
import {
  type Admission,
  admitConflictClass,
  admitCuratorQueue,
  admitReviewVerdict,
  admitTicketReadiness,
  type CuratorQueueEntry,
  FOOTPRINT_AREAS_MAX,
  footprintAreaSchema,
  ticketIdSchema,
} from './judgments.js';
import type { AutopilotConfig, ProgramDescriptor, ProgressStates } from './program.js';
import {
  changedParts,
  fingerprintOf,
  type SharedFingerprint,
  type SharedStateReading,
} from './shared-state.js';
import { sameBranch } from './union-review.js';

/** A tracker scope larger than this is a backlog dump, not a loop observation. */
export const TRACKED_TICKETS_MAX = 256;
/** Outcomes kept for the recap; the stop rule reads only the last three. */
export const RECENT_MAX = 64;
const LIVE_WORKERS_MAX = 16;
/** Three tickets in a row handed to a human means the loop is no longer helping. */
const HUMAN_WAIT_STREAK_MAX = 3;

export type StopSignal = 'none' | 'drain' | 'now';
export type QueueEvent = 'none' | 'queued' | 'ejected';

/** One pull request as `loop-observe` read it from `gh`. */
export interface PullRequestObservation {
  readonly number: number;
  readonly state: 'open' | 'merged' | 'closed';
  readonly draft: boolean;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  /** GitHub reports a conflict with the base (`mergeStateStatus: DIRTY`). */
  readonly conflicted: boolean;
  /** GitHub reports the base moved on (`mergeStateStatus: BEHIND`). */
  readonly behind: boolean;
  readonly autoMerge: boolean;
  /** Every check but the independent review, which `review` carries. */
  readonly checks: 'pending' | 'passing' | 'failing';
  /** The `void/independent-review` commit status on the head commit. */
  readonly review: 'absent' | 'pending' | 'success' | 'failure';
  /** The last merge queue event not followed by a commit. */
  readonly queue: QueueEvent;
}

export interface GithubObservation {
  /** The branch the loop merges into, `auto` already resolved. */
  readonly base: string;
  /** False when the base has no merge queue: merges then run one at a time. */
  readonly mergeQueue: boolean;
  readonly pullRequests: ReadonlyMap<number, PullRequestObservation>;
}

export interface LoopProgram {
  readonly autopilot: AutopilotConfig;
  readonly states: ProgressStates;
}

const trackerTicketSchema = z.strictObject({
  id: ticketIdSchema,
  /** The provider-native status, mapped to a role by the programme. */
  status: z.string().min(1).max(64),
  humanWait: z.boolean(),
  pullRequest: z.int().positive().max(2_147_483_647).optional(),
  branch: z.string().min(1).max(255).optional(),
  footprint: z.array(footprintAreaSchema).min(1).max(FOOTPRINT_AREAS_MAX).optional(),
  // Raw judgments, admitted where they are consumed so one malformed answer
  // refuses its own decision rather than the whole observation.
  readiness: z.unknown().optional(),
  review: z.unknown().optional(),
  conflict: z.unknown().optional(),
});

const recentOutcomeSchema = z.strictObject({
  ticketId: ticketIdSchema,
  outcome: z.enum(['merged', 'human-wait']),
});

const loopTrackerSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    queue: z.unknown(),
    tickets: z.array(trackerTicketSchema).max(TRACKED_TICKETS_MAX),
    recent: z.array(recentOutcomeSchema).max(RECENT_MAX),
    liveWorkers: z.array(ticketIdSchema).max(LIVE_WORKERS_MAX),
    quota: z.enum(['ok', 'low']),
  })
  .superRefine((tracker, context) => {
    const seen = new Set<string>();
    tracker.tickets.forEach((ticket, index) => {
      if (seen.has(ticket.id)) {
        context.addIssue({
          code: 'custom',
          path: ['tickets', index, 'id'],
          message: `reports ${ticket.id} a second time`,
        });
      }
      seen.add(ticket.id);
    });
  });

export type LoopTracker = z.infer<typeof loopTrackerSchema>;
type TrackerTicket = LoopTracker['tickets'][number];

export type WaitReason =
  | 'worker-active'
  | 'awaiting-review'
  | 'merging'
  | 'serial-merge-turn';
export type HandBackReason =
  | 'resume'
  | 'checks-failed'
  | 'review-blocking'
  | 'conflict'
  | 'ejected'
  | 'update-on-base';
export type HumanWaitReason =
  | 'ambiguous-state'
  | 'pull-request-closed'
  | 'semantic-conflict'
  | 'review-rounds-exhausted'
  | 'human-merge-gate'
  | 'deploy-branch-target'
  | 'shared-state-changed';
export type DrainReason = 'requested' | 'quota-low' | 'human-wait-streak' | 'backlog-exhausted';

export type LoopAction =
  | { readonly kind: 'assign'; readonly ticketId: string; readonly footprint: readonly string[] }
  | { readonly kind: 'wait'; readonly ticketId: string; readonly reason: WaitReason }
  | {
      readonly kind: 'hand-back-to-worker';
      readonly ticketId: string;
      readonly reason: HandBackReason;
      readonly pullRequest?: number;
    }
  | {
      readonly kind: 'mark-human-wait';
      readonly ticketId: string;
      readonly reason: HumanWaitReason;
      readonly detail: string;
    }
  | {
      readonly kind: 'enable-auto-merge';
      readonly ticketId: string;
      readonly pullRequest: number;
      readonly headSha: string;
    }
  | { readonly kind: 'drain'; readonly reason: DrainReason }
  | { readonly kind: 'freeze' }
  | {
      readonly kind: 'recap';
      readonly merged: readonly string[];
      readonly humanWait: readonly string[];
    };

/**
 * The shared Git state as git reports it now, and the fingerprint recorded
 * before each ticket's unit began. The current state stays a reading, not a
 * digest, because each record leaves out the upstream of its own branch.
 */
export interface SharedStateObservation {
  readonly current: SharedStateReading;
  readonly before: ReadonlyMap<string, SharedFingerprint>;
}

export interface LoopInput {
  readonly program: LoopProgram;
  readonly tracker: LoopTracker;
  readonly github: GithubObservation;
  readonly signal: StopSignal;
  readonly sharedState: SharedStateObservation;
}

export interface LoopDecision {
  readonly actions: readonly LoopAction[];
  /** Judgments refused this tick, each naming its ticket and field. */
  readonly refusals: readonly string[];
}

/** The programme's consent and state roles, or a refusal naming what is missing. */
export function loopProgramOf(descriptor: ProgramDescriptor): LoopProgram {
  if (descriptor.autopilot === undefined || descriptor.progress === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_PROGRAM',
      'the programme does not consent to the autopilot loop',
      descriptor.autopilotConsentWithheld
        ? '`autopilot.enabled` is false'
        : 'the programme declares no `autopilot` block or no `progress` source',
      'declare an `autopilot` block and a `progress` provider in `.void/program.md`',
    );
  }
  return { autopilot: descriptor.autopilot, states: descriptor.progress.states };
}

export function admitLoopTracker(value: unknown): Admission<LoopTracker> {
  const parsed = loopTrackerSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((issue) => {
      const field = issue.path.length === 0 ? '(root)' : issue.path.join('.');
      return `${field}: ${issue.message}`;
    })
    .join('; ');
  return { ok: false, reason: `tracker observation refused: ${issues}` };
}

/**
 * The local branches a unit must never move: every base `auto` can resolve to,
 * and the branch that deploys. Moving one locally changes what the next
 * worktree, or the next promotion, starts from.
 */
export function protectedBranches(autopilot: AutopilotConfig): string[] {
  const bases = autopilot.base === 'auto' ? ['develop', 'main'] : [autopilot.base];
  const deploy = autopilot.deployBranch === undefined ? [] : [autopilot.deployBranch];
  return [...new Set([...bases, ...deploy])];
}

/** The stop file holds `drain` or `now`; absent is no stop, anything else is refused. */
export function parseStopSignal(text: string | undefined): StopSignal {
  if (text === undefined) return 'none';
  const value = text.trim();
  if (value === 'drain' || value === 'now') return value;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    'the stop signal is unreadable',
    `the stop file holds ${JSON.stringify(value.slice(0, 40))}, not \`drain\` or \`now\``,
    'write it with `void-harness autopilot stop --drain` or `--now`, or delete the file',
  );
}

type Role = 'ready' | 'started' | 'review' | 'done' | 'other';

function roleOf(states: ProgressStates, status: string): Role {
  if (states.done.includes(status)) return 'done';
  if (states.review.includes(status)) return 'review';
  if (states.started.includes(status)) return 'started';
  if (states.ready.includes(status)) return 'ready';
  return 'other';
}

/**
 * The tickets holding a slot: started or in review and not handed to a human,
 * plus any ticket a worker is live on. The second half is what stops a restart
 * from seating twice a ticket Linear has not caught up with yet.
 */
function heldTickets(program: LoopProgram, tracker: LoopTracker): readonly TrackerTicket[] {
  const live = new Set<string>(tracker.liveWorkers);
  return tracker.tickets.filter((ticket) => {
    if (live.has(ticket.id)) return true;
    const role = roleOf(program.states, ticket.status);
    return (role === 'started' || role === 'review') && !ticket.humanWait;
  });
}

/** The pull requests the loop needs GitHub to report, in tracker order. */
export function pullRequestsToObserve(program: LoopProgram, tracker: LoopTracker): number[] {
  return heldTickets(program, tracker).flatMap((ticket) =>
    ticket.pullRequest === undefined ? [] : [ticket.pullRequest],
  );
}

type SlotOutcome =
  | { readonly outcome: 'held'; readonly action: LoopAction }
  | { readonly outcome: 'merged' }
  | { readonly outcome: 'human-wait'; readonly action: LoopAction };

function held(action: LoopAction): SlotOutcome {
  return { outcome: 'held', action };
}

function toHuman(ticketId: string, reason: HumanWaitReason, detail: string): SlotOutcome {
  return { outcome: 'human-wait', action: { kind: 'mark-human-wait', ticketId, reason, detail } };
}

function handBack(ticketId: string, reason: HandBackReason, pullRequest?: number): SlotOutcome {
  return held({
    kind: 'hand-back-to-worker',
    ticketId,
    reason,
    ...(pullRequest === undefined ? {} : { pullRequest }),
  });
}

function wait(ticketId: string, reason: WaitReason): SlotOutcome {
  return held({ kind: 'wait', ticketId, reason });
}

interface SlotContext {
  readonly input: LoopInput;
  readonly live: ReadonlySet<string>;
  /** The one pull request allowed to merge when the base has no merge queue. */
  readonly serialTurn: number | undefined;
}

function conflictOutcome(ticket: TrackerTicket, pr: PullRequestObservation): SlotOutcome {
  if (ticket.conflict === undefined) return handBack(ticket.id, 'conflict', pr.number);
  const admission = admitConflictClass(ticket.conflict);
  if (!admission.ok) return toHuman(ticket.id, 'ambiguous-state', admission.reason);
  if (admission.value.class === 'semantic') {
    return toHuman(ticket.id, 'semantic-conflict', admission.value.reason);
  }
  return handBack(ticket.id, 'conflict', pr.number);
}

function reviewFailureOutcome(ticket: TrackerTicket, pr: PullRequestObservation): SlotOutcome {
  if (ticket.review === undefined) {
    return toHuman(ticket.id, 'ambiguous-state', 'the review failed and no verdict was reported');
  }
  const admission = admitReviewVerdict(ticket.review);
  if (!admission.ok) return toHuman(ticket.id, 'ambiguous-state', admission.reason);
  const verdict = admission.value;
  if (verdict.blocking.length === 0) {
    const detail = 'the review failed on a verdict with no blocking finding';
    return toHuman(ticket.id, 'ambiguous-state', detail);
  }
  if (verdict.round === 2) {
    const first = verdict.blocking[0]?.scenario ?? '';
    const detail = `still blocking after two rounds: ${first}`;
    return toHuman(ticket.id, 'review-rounds-exhausted', detail);
  }
  return handBack(ticket.id, 'review-blocking', pr.number);
}

/** A success status must not travel with a verdict that says otherwise. */
function contradictedApproval(ticket: TrackerTicket): string | undefined {
  if (ticket.review === undefined) return undefined;
  const admission = admitReviewVerdict(ticket.review);
  if (!admission.ok) return admission.reason;
  if (admission.value.blocking.length > 0) return 'the review passed on a verdict that blocks';
  return undefined;
}

/**
 * Publication is refused when the unit changed what its neighbours share, and
 * when nobody recorded that state before it began: an unrecorded baseline cannot
 * tell a clean unit from one that changed everything.
 */
function sharedStateOutcome(
  ticket: TrackerTicket,
  shared: SharedStateObservation,
): SlotOutcome | undefined {
  const before = shared.before.get(ticket.id);
  if (before === undefined) {
    const detail = 'no shared Git state fingerprint was recorded before the unit began';
    return toHuman(ticket.id, 'ambiguous-state', detail);
  }
  if (ticket.branch !== undefined && before.branch !== ticket.branch) {
    const detail =
      `the shared Git state was recorded for ${before.branch}, ` +
      `but the ticket holds ${ticket.branch}`;
    return toHuman(ticket.id, 'ambiguous-state', detail);
  }
  const changed = changedParts(before, fingerprintOf(shared.current, before.branch));
  if (changed.length === 0) return undefined;
  const detail = `the unit changed the shared Git state: ${changed.join(', ')}`;
  return toHuman(ticket.id, 'shared-state-changed', detail);
}

function mergeOutcome(
  ticket: TrackerTicket,
  pr: PullRequestObservation,
  context: SlotContext,
): SlotOutcome {
  if (pr.autoMerge || pr.queue === 'queued') return wait(ticket.id, 'merging');
  const { autopilot } = context.input.program;
  if (autopilot.mergeGate === 'human') {
    return toHuman(ticket.id, 'human-merge-gate', `pull request #${pr.number} is ready to merge`);
  }
  // The programme refuses `base: deployBranch` as declared, but `auto` is only
  // resolved here and can land on the branch that ships. A name that cannot be
  // compared counts as that branch: a false refusal is a merge a person does.
  const base = context.input.github.base;
  if (sameBranch(base, autopilot.deployBranch) !== 'different') {
    const detail = `#${pr.number} targets ${base}, the branch the programme says deploys`;
    return toHuman(ticket.id, 'deploy-branch-target', detail);
  }
  const sharedStateRefusal = sharedStateOutcome(ticket, context.input.sharedState);
  if (sharedStateRefusal !== undefined) return sharedStateRefusal;
  if (!context.input.github.mergeQueue) {
    if (context.serialTurn !== pr.number) return wait(ticket.id, 'serial-merge-turn');
    if (pr.behind) return handBack(ticket.id, 'update-on-base', pr.number);
  }
  return held({
    kind: 'enable-auto-merge',
    ticketId: ticket.id,
    pullRequest: pr.number,
    headSha: pr.headSha,
  });
}

function openPullOutcome(
  ticket: TrackerTicket,
  pr: PullRequestObservation,
  context: SlotContext,
): SlotOutcome {
  if (pr.state === 'closed') {
    return toHuman(ticket.id, 'pull-request-closed', `#${pr.number} was closed without a merge`);
  }
  const base = context.input.github.base;
  const branchDiffers = ticket.branch !== undefined && pr.headRef !== ticket.branch;
  if (pr.baseRef !== base || branchDiffers) {
    return toHuman(
      ticket.id,
      'ambiguous-state',
      `#${pr.number} goes ${pr.headRef} -> ${pr.baseRef}, ` +
        `the loop expects ${ticket.branch ?? '?'} -> ${base}`,
    );
  }
  if (pr.draft) return handBack(ticket.id, 'resume', pr.number);
  if (pr.conflicted) return conflictOutcome(ticket, pr);
  if (pr.queue === 'ejected') return handBack(ticket.id, 'ejected', pr.number);
  if (pr.checks === 'failing') return handBack(ticket.id, 'checks-failed', pr.number);
  if (pr.review === 'failure') return reviewFailureOutcome(ticket, pr);
  if (pr.review !== 'success') return wait(ticket.id, 'awaiting-review');
  const contradiction = contradictedApproval(ticket);
  if (contradiction !== undefined) return toHuman(ticket.id, 'ambiguous-state', contradiction);
  return mergeOutcome(ticket, pr, context);
}

function slotOutcome(ticket: TrackerTicket, context: SlotContext): SlotOutcome {
  const number = ticket.pullRequest;
  const pr = number === undefined ? undefined : context.input.github.pullRequests.get(number);
  if (number !== undefined && pr === undefined) {
    return toHuman(ticket.id, 'ambiguous-state', `pull request #${number} was not observed`);
  }
  if (pr?.state === 'merged') return { outcome: 'merged' };
  if (context.live.has(ticket.id)) return wait(ticket.id, 'worker-active');
  if (pr === undefined) return handBack(ticket.id, 'resume');
  return openPullOutcome(ticket, pr, context);
}

/**
 * Whose turn it is to merge when the base has no merge queue.
 *
 * A pull request already merging keeps the turn; otherwise the oldest open one
 * takes it. Read from GitHub alone, so the turn survives a restart unchanged.
 */
function serialTurnOf(
  tickets: readonly TrackerTicket[],
  github: GithubObservation,
): number | undefined {
  const open = tickets
    .flatMap((ticket) => {
      const number = ticket.pullRequest;
      const pr = number === undefined ? undefined : github.pullRequests.get(number);
      return pr !== undefined && pr.state === 'open' && !pr.draft ? [pr] : [];
    })
    .sort((left, right) => left.number - right.number);
  return (open.find((pr) => pr.autoMerge) ?? open[0])?.number;
}

interface Claim {
  readonly areas: readonly CompiledArea[];
  /** Indices of the `sequential` paths this claim touches. */
  readonly sequential: ReadonlySet<number>;
}

function claimOf(areas: readonly string[], sequential: readonly CompiledArea[]): Claim {
  const compiled = areas.map(compileArea);
  const touched = new Set<number>();
  sequential.forEach((path, index) => {
    if (compiled.some((area) => areasOverlap(area, path))) touched.add(index);
  });
  return { areas: compiled, sequential: touched };
}

function claimsCollide(left: Claim, right: Claim): boolean {
  if ([...left.sequential].some((index) => right.sequential.has(index))) return true;
  return left.areas.some((area) => right.areas.some((other) => areasOverlap(area, other)));
}

interface Assignment {
  readonly actions: readonly LoopAction[];
  /** No queued ticket is ready or preparable: the loop has nothing left to take. */
  readonly exhausted: boolean;
}

type Candidacy = 'skip' | 'preparable' | 'ready';

function candidacyOf(
  entry: CuratorQueueEntry,
  input: LoopInput,
  heldIds: ReadonlySet<string>,
  refusals: string[],
): Candidacy {
  const ticket = input.tracker.tickets.find((candidate) => candidate.id === entry.ticketId);
  if (ticket === undefined || heldIds.has(ticket.id) || ticket.humanWait) return 'skip';
  if (roleOf(input.program.states, ticket.status) === 'done') return 'skip';
  if (ticket.readiness === undefined) return 'preparable';
  const admission = admitTicketReadiness(ticket.readiness);
  if (!admission.ok) {
    refusals.push(`${ticket.id}: ${admission.reason}`);
    return 'preparable';
  }
  if (admission.value.verdict === 'ready') return 'ready';
  return admission.value.verdict === 'needs-enrichment' ? 'preparable' : 'skip';
}

function assignSlots(
  input: LoopInput,
  stillHeld: readonly TrackerTicket[],
  heldIds: ReadonlySet<string>,
  refusals: string[],
): Assignment {
  const queue = admitCuratorQueue(input.tracker.queue);
  if (!queue.ok) {
    refusals.push(queue.reason);
    return { actions: [], exhausted: false };
  }
  const entries = queue.value.entries;
  const sequential = input.program.autopilot.ownership.sequential.map(compileArea);
  const claims: Claim[] = [];
  for (const ticket of stillHeld) {
    const queued = entries.find((entry) => entry.ticketId === ticket.id);
    const footprint = ticket.footprint ?? queued?.footprint;
    // A held ticket whose ground nobody declared could collide with anything.
    if (footprint === undefined) return { actions: [], exhausted: false };
    claims.push(claimOf(footprint, sequential));
  }
  let free = input.program.autopilot.clusterSize - stillHeld.length;
  const actions: LoopAction[] = [];
  let open = false;
  for (const entry of entries) {
    const candidacy = candidacyOf(entry, input, heldIds, refusals);
    if (candidacy !== 'skip') open = true;
    if (candidacy !== 'ready' || free <= 0) continue;
    const claim = claimOf(entry.footprint, sequential);
    if (claims.some((other) => claimsCollide(claim, other))) continue;
    claims.push(claim);
    actions.push({ kind: 'assign', ticketId: entry.ticketId, footprint: entry.footprint });
    free -= 1;
  }
  return { actions, exhausted: !open };
}

function trailingHumanWaits(outcomes: readonly ('merged' | 'human-wait')[]): number {
  const lastMerge = outcomes.lastIndexOf('merged');
  return outcomes.length - 1 - lastMerge;
}

export function decideLoop(input: LoopInput): LoopDecision {
  if (input.signal === 'now') return { actions: [{ kind: 'freeze' }], refusals: [] };
  const refusals: string[] = [];
  const holding = heldTickets(input.program, input.tracker);
  const context: SlotContext = {
    input,
    live: new Set<string>(input.tracker.liveWorkers),
    serialTurn: serialTurnOf(holding, input.github),
  };
  const outcomes = holding.map((ticket) => ({ ticket, slot: slotOutcome(ticket, context) }));
  const slotActions = outcomes.flatMap(({ slot }) => ('action' in slot ? [slot.action] : []));
  const whose = (outcome: SlotOutcome['outcome']) =>
    outcomes.filter(({ slot }) => slot.outcome === outcome).map(({ ticket }) => ticket);
  const stillHeld = whose('held');
  const merged = whose('merged').map((ticket) => ticket.id);
  const waited = whose('human-wait').map((ticket) => ticket.id);
  const recent = input.tracker.recent;
  const history = [
    ...recent.map((entry) => entry.outcome),
    ...merged.map(() => 'merged' as const),
    ...waited.map(() => 'human-wait' as const),
  ];
  let drain: DrainReason | undefined;
  if (input.signal === 'drain') drain = 'requested';
  else if (input.tracker.quota === 'low') drain = 'quota-low';
  else if (trailingHumanWaits(history) >= HUMAN_WAIT_STREAK_MAX) drain = 'human-wait-streak';
  const actions: LoopAction[] = [...slotActions];
  if (drain === undefined) {
    const heldIds = new Set(holding.map((ticket) => ticket.id));
    const assignment = assignSlots(input, stillHeld, heldIds, refusals);
    actions.push(...assignment.actions);
    if (assignment.exhausted) drain = 'backlog-exhausted';
  }
  if (drain !== undefined) {
    actions.push({ kind: 'drain', reason: drain });
    if (stillHeld.length === 0) actions.push(recapOf(recent, merged, waited));
  }
  return { actions, refusals };
}

function recapOf(
  recent: LoopTracker['recent'],
  merged: readonly string[],
  waited: readonly string[],
): LoopAction {
  const of = (outcome: 'merged' | 'human-wait') =>
    recent.filter((entry) => entry.outcome === outcome).map((entry) => entry.ticketId);
  return {
    kind: 'recap',
    merged: [...of('merged'), ...merged],
    humanWait: [...of('human-wait'), ...waited],
  };
}
