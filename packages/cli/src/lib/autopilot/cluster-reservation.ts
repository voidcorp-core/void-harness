// Reserving a cluster: claim several tracker issues as one unit, knowing the
// tracker offers no multi-issue transaction.
//
// The protocol is therefore logically atomic rather than transactionally atomic:
// observe everything, emit an ordered plan of idempotent actions with a
// precondition each, let the skill apply them, then RE-OBSERVE and decide. The
// re-observation is the authority — what the API replied is only used to notice
// that we do not know, never to conclude that we do.
//
// Two rules make the whole thing safe:
//
//   1. A ticket we cannot prove is ours is not ours. An unmarked started ticket,
//      a foreign lease, a lease we cannot parse — all competing claims.
//   2. Partial success is not success. If the cluster does not fully converge we
//      release what we took, because half a cluster fans out workers whose
//      integration PR can never be complete.

import { isExpired, type LeaseMarker, renderLeaseMarker } from './linear-marker.js';
import {
  isUnblocked,
  isWellFormedObservation,
  leaseOf,
  type ObservedIssue,
  type TrackerObservation,
} from './tracker-observation.js';

export interface ProgramStates {
  /** Native states from which work may be started. */
  readonly ready: readonly string[];
  /** Native state meaning "claimed and in flight". */
  readonly started: string;
  /** Native states meaning complete. */
  readonly done: readonly string[];
}

export interface ReservationRequest {
  readonly programId: string;
  readonly runId: string;
  readonly clusterId: string;
  /** Ticket ids the planner selected, in run order. */
  readonly cluster: readonly string[];
  readonly assigneeId: string;
  readonly baseBranch: string;
  readonly baseSha: string;
  readonly integrationBranch: string;
  readonly expiresAt: string;
  readonly states: ProgramStates;
  readonly observation: TrackerObservation;
}

export type ActionKind = 'refetch' | 'transition' | 'assign' | 'comment';

export type ActionPrecondition =
  | { readonly kind: 'state-in'; readonly states: readonly string[] }
  | { readonly kind: 'assignee-free-or'; readonly assigneeId: string }
  | { readonly kind: 'no-foreign-lease'; readonly runId: string };

export interface ReservationAction {
  readonly issueId: string;
  readonly kind: ActionKind;
  /** Stable across retries of the same run, unique across runs. */
  readonly idempotencyKey: string;
  readonly precondition: ActionPrecondition;
  /** Target state for a transition. */
  readonly state?: string;
  /** Target assignee for an assignment. */
  readonly assigneeId?: string;
  /** Comment body for the lease marker. */
  readonly body?: string;
}

export interface ReservationIntent {
  readonly schemaVersion: 1;
  readonly programId: string;
  readonly runId: string;
  readonly clusterId: string;
  readonly cluster: readonly string[];
  readonly assigneeId: string;
  readonly states: ProgramStates;
  readonly marker: LeaseMarker;
}

export type ClaimReason = 'foreign-lease' | 'expired-foreign-lease' | 'unmarked-claim';

export interface CompetingClaim {
  readonly issueId: string;
  readonly reason: ClaimReason;
  /** Run holding the ticket, or null when the claim carries no marker. */
  readonly holder: string | null;
}

export type ReservationBlock =
  | 'empty-cluster'
  | 'malformed-observation'
  | 'unobserved-ticket'
  | 'not-ready'
  | 'blocked-dependency'
  | 'lease-already-expired';

export type ReservationOutcome =
  | { readonly kind: 'resume'; readonly marker: LeaseMarker; readonly issues: readonly string[] }
  | { readonly kind: 'reserve'; readonly intent: ReservationIntent; readonly actions: readonly ReservationAction[] }
  | { readonly kind: 'competing-claims'; readonly claims: readonly CompetingClaim[] }
  | { readonly kind: 'blocked'; readonly reason: ReservationBlock; readonly detail: string };

export interface ApplyOutcome {
  readonly issueId: string;
  readonly kind: ActionKind;
  /** `unknown` means the write may or may not have landed. */
  readonly result: 'applied' | 'failed' | 'unknown';
  readonly detail?: string;
}

export type CompensationKind = 'release-comment' | 'restore-state';

export interface CompensationAction {
  readonly issueId: string;
  readonly kind: CompensationKind;
  readonly idempotencyKey: string;
  /** State to restore the ticket to. */
  readonly state?: string;
}

export type ConfirmationOutcome =
  | { readonly kind: 'active'; readonly marker: LeaseMarker; readonly issues: readonly string[] }
  | {
      readonly kind: 'compensate';
      readonly actions: readonly CompensationAction[];
      readonly competingClaims: readonly CompetingClaim[];
      readonly detail: string;
    }
  | { readonly kind: 'reobserve'; readonly detail: string }
  | { readonly kind: 'blocked'; readonly reason: 'reservation-not-converged' | 'lease-expired'; readonly detail: string };

function blocked(reason: ReservationBlock, detail: string): ReservationOutcome {
  return { kind: 'blocked', reason, detail };
}

function key(runId: string, issueId: string, kind: string): string {
  return `${runId}:${issueId}:${kind}`;
}

function markerOf(request: ReservationRequest): LeaseMarker {
  return {
    schemaVersion: 1,
    programId: request.programId,
    runId: request.runId,
    clusterId: request.clusterId,
    baseBranch: request.baseBranch,
    baseSha: request.baseSha,
    integrationBranch: request.integrationBranch,
    expiresAt: request.expiresAt,
  };
}

/** Is this lease ours — same run, same cluster, same program? */
function isOurs(lease: LeaseMarker, request: Pick<ReservationRequest, 'runId' | 'clusterId' | 'programId'>): boolean {
  return (
    lease.runId === request.runId &&
    lease.clusterId === request.clusterId &&
    lease.programId === request.programId
  );
}

function claimOf(
  issue: ObservedIssue,
  request: Pick<ReservationRequest, 'runId' | 'clusterId' | 'programId' | 'states'>,
  now: string,
): CompetingClaim | undefined {
  const lease = leaseOf(issue);
  if (lease === undefined) {
    // A started ticket with no readable lease belongs to whoever started it —
    // a human, an older tool, a run whose marker was edited away.
    return issue.state === request.states.started
      ? { issueId: issue.id, reason: 'unmarked-claim', holder: null }
      : undefined;
  }
  if (isOurs(lease, request)) return undefined;
  return {
    issueId: issue.id,
    // An expired foreign lease is still not ours to take: its commits may live
    // on a machine we cannot see, and overwriting the marker would strand them.
    reason: isExpired(lease, now) ? 'expired-foreign-lease' : 'foreign-lease',
    holder: lease.runId,
  };
}

function actionsFor(request: ReservationRequest, issueId: string, marker: LeaseMarker): readonly ReservationAction[] {
  return [
    {
      issueId,
      kind: 'refetch',
      idempotencyKey: key(request.runId, issueId, 'refetch'),
      precondition: { kind: 'no-foreign-lease', runId: request.runId },
    },
    {
      issueId,
      kind: 'transition',
      idempotencyKey: key(request.runId, issueId, 'transition'),
      precondition: { kind: 'state-in', states: request.states.ready },
      state: request.states.started,
    },
    {
      issueId,
      kind: 'assign',
      idempotencyKey: key(request.runId, issueId, 'assign'),
      precondition: { kind: 'assignee-free-or', assigneeId: request.assigneeId },
      assigneeId: request.assigneeId,
    },
    {
      issueId,
      kind: 'comment',
      idempotencyKey: key(request.runId, issueId, 'comment'),
      precondition: { kind: 'no-foreign-lease', runId: request.runId },
      body: renderLeaseMarker(marker),
    },
  ];
}

export function planReservation(request: ReservationRequest): ReservationOutcome {
  if (request.cluster.length === 0) {
    return blocked('empty-cluster', 'the planner selected no ticket, so there is nothing to reserve');
  }
  if (!isWellFormedObservation(request.observation)) {
    return blocked(
      'malformed-observation',
      'the tracker observation does not match the contract; re-observe the cluster and pass the result unmodified',
    );
  }

  const now = request.observation.observedAt;
  if (isExpired(markerOf(request), now)) {
    return blocked(
      'lease-already-expired',
      `the requested lease expires at ${request.expiresAt}, which is not after the observation at ${now}`,
    );
  }

  const byId = new Map(request.observation.issues.map((issue) => [issue.id, issue]));
  const issues: ObservedIssue[] = [];
  for (const id of request.cluster) {
    const issue = byId.get(id);
    if (issue === undefined) {
      return blocked(
        'unobserved-ticket',
        `\`${id}\` is in the cluster but absent from the observation; a ticket that was not seen is never claimed`,
      );
    }
    issues.push(issue);
  }

  // Competing claims win over everything: they mean the plan was built on a
  // view of the world that no longer holds.
  const claims = issues
    .map((issue) => claimOf(issue, request, now))
    .filter((claim): claim is CompetingClaim => claim !== undefined);
  if (claims.length > 0) return { kind: 'competing-claims', claims };

  const marker = markerOf(request);
  const held: string[] = [];
  const missing: ObservedIssue[] = [];
  for (const issue of issues) {
    const lease = leaseOf(issue);
    const converged =
      lease !== undefined && isOurs(lease, request) && !isExpired(lease, now) && issue.state === request.states.started;
    if (converged) held.push(issue.id);
    else missing.push(issue);
  }

  if (missing.length === 0) {
    return { kind: 'resume', marker, issues: held };
  }

  for (const issue of missing) {
    // Only tickets we still have to claim need to be ready: one already held is
    // legitimately sitting in the started state.
    if (issue.state !== request.states.started && !request.states.ready.includes(issue.state)) {
      return blocked(
        'not-ready',
        `\`${issue.id}\` is in state \`${issue.state}\`, which the program does not list as ready`,
      );
    }
    if (!isUnblocked(issue, request.states.done)) {
      const open = issue.blockedBy.filter((relation) => !request.states.done.includes(relation.state));
      return blocked(
        'blocked-dependency',
        `\`${issue.id}\` is still blocked by ${open.map((relation) => relation.id).join(', ')}`,
      );
    }
  }

  return {
    kind: 'reserve',
    intent: {
      schemaVersion: 1,
      programId: request.programId,
      runId: request.runId,
      clusterId: request.clusterId,
      cluster: request.cluster,
      assigneeId: request.assigneeId,
      states: request.states,
      marker,
    },
    actions: missing.flatMap((issue) => actionsFor(request, issue.id, marker)),
  };
}

export interface ConfirmationInput {
  readonly intent: ReservationIntent;
  /** What the skill reported for each action it applied. */
  readonly applied: readonly ApplyOutcome[];
  readonly reobservation: TrackerObservation;
  readonly now: string;
}

export function confirmReservation(input: ConfirmationInput): ConfirmationOutcome {
  const { intent, reobservation, now } = input;

  if (!isWellFormedObservation(reobservation)) {
    return {
      kind: 'reobserve',
      detail: 'the re-observation does not match the contract, so it cannot settle the reservation',
    };
  }

  const unknown = input.applied.filter((outcome) => outcome.result === 'unknown');
  if (unknown.length > 0) {
    // A write whose result we do not know makes the whole picture untrustworthy,
    // even if the re-observation looks converged: the two may simply have raced.
    return {
      kind: 'reobserve',
      detail: `${unknown.length} write(s) returned an unknown result (${unknown
        .map((outcome) => `${outcome.issueId}:${outcome.kind}${outcome.detail === undefined ? '' : ` — ${outcome.detail}`}`)
        .join('; ')}); observe again before deciding`,
    };
  }

  const byId = new Map(reobservation.issues.map((issue) => [issue.id, issue]));
  const absent = intent.cluster.filter((id) => !byId.has(id));
  if (absent.length > 0) {
    return { kind: 'reobserve', detail: `the re-observation is missing ${absent.join(', ')}` };
  }

  if (isExpired(intent.marker, now)) {
    return {
      kind: 'blocked',
      reason: 'lease-expired',
      detail: `the lease expired at ${intent.marker.expiresAt} before the cluster converged; plan a new run rather than starting workers under a stale claim`,
    };
  }

  const held: string[] = [];
  const claims: CompetingClaim[] = [];
  for (const id of intent.cluster) {
    const issue = byId.get(id) as ObservedIssue;
    const lease = leaseOf(issue);
    if (lease !== undefined && isOurs(lease, intent) && issue.state === intent.states.started) {
      held.push(id);
      continue;
    }
    const claim = claimOf(issue, { ...intent, states: intent.states }, now);
    if (claim !== undefined) claims.push(claim);
  }

  if (held.length === intent.cluster.length) {
    return { kind: 'active', marker: intent.marker, issues: held };
  }

  const failures = input.applied
    .filter((outcome) => outcome.result === 'failed')
    .map((outcome) => `${outcome.issueId}:${outcome.kind}${outcome.detail === undefined ? '' : ` — ${outcome.detail}`}`);

  if (held.length === 0) {
    return {
      kind: 'blocked',
      reason: 'reservation-not-converged',
      detail: `no ticket of the cluster was claimed, so there is nothing to release${
        failures.length > 0 ? ` (${failures.join('; ')})` : ''
      }`,
    };
  }

  // Releasing the marker always applies; restoring the state needs somewhere to
  // restore TO. With no declared ready state, leaving the ticket started and
  // unmarked is more honest than inventing a transition.
  const restoreState = intent.states.ready[0];
  return {
    kind: 'compensate',
    actions: held.flatMap((id) => {
      const release: CompensationAction = {
        issueId: id,
        kind: 'release-comment',
        idempotencyKey: key(intent.runId, id, 'release-comment'),
      };
      if (restoreState === undefined) return [release];
      return [
        release,
        {
          issueId: id,
          kind: 'restore-state',
          idempotencyKey: key(intent.runId, id, 'restore-state'),
          state: restoreState,
        },
      ];
    }),
    competingClaims: claims,
    detail: `only ${held.length} of ${intent.cluster.length} tickets converged; releasing them keeps the cluster all-or-nothing${
      failures.length > 0 ? ` (${failures.join('; ')})` : ''
    }`,
  };
}
