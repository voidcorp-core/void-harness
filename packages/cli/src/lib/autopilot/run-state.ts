// The local run cursor: what this clone knows about a cluster in flight.
//
// It is a CURSOR, not a source of truth. The tracker owns ticket state, GitHub
// owns the PR, git owns the commits; this file only makes resume fast. Every
// field is therefore something the run could rediscover — never something only
// this file knows.
//
// Bounded on purpose. A worker that loops, a blocker message that carries a
// whole stack trace, a branch name derived from a ticket title: each would let
// an unbounded value into a file the next session parses. The schema refuses
// them at the boundary rather than truncating them silently later.

import { autopilotFailure } from './errors.js';

export type TicketPhase = 'pending' | 'running' | 'committed' | 'blocked';
export type PullRequestState = 'none' | 'open' | 'merged' | 'closed';

export interface TicketRunState {
  readonly id: string;
  readonly phase: TicketPhase;
  /** Local worker branch, or null before the worker started. */
  readonly branch: string | null;
  /** Full commit ids attributable to this ticket, in order. */
  readonly commits: readonly string[];
  /** Names of the verification proofs the worker produced. */
  readonly proofs: readonly string[];
  /** Why the ticket stopped, when it did. */
  readonly blocker: string | null;
}

export interface IntegrationRunState {
  readonly branch: string | null;
  readonly headSha: string | null;
  readonly prUrl: string | null;
  readonly prState: PullRequestState;
}

export interface RunState {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly clusterId: string;
  readonly programId: string;
  readonly startedAt: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly tickets: readonly TicketRunState[];
  readonly integration: IntegrationRunState;
  /** True once every ticket's tracker state matches this run's outcome. */
  readonly trackerSynced: boolean;
}

const MAX_TICKETS = 4;
const MAX_COMMITS = 500;
const MAX_PROOFS = 50;
const MAX_BLOCKER_LENGTH = 2000;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const PHASES: readonly TicketPhase[] = ['pending', 'running', 'committed', 'blocked'];
const PR_STATES: readonly PullRequestState[] = ['none', 'open', 'merged', 'closed'];

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

function requireSlug(value: unknown, field: string): string {
  // `..` is refused even though the characters are legal: these slugs become
  // branch names AND worktree path segments, so a `worker/../../etc` would be a
  // directory traversal wearing a branch name.
  if (typeof value !== 'string' || !SLUG.test(value) || value.split('/').includes('..')) {
    invalid(
      `the run state field \`${field}\` is not a usable identifier`,
      `\`${field}\` is ${JSON.stringify(value)}`,
      `derive \`${field}\` from an identifier of letters, digits, dot, dash, slash or underscore`,
    );
  }
  return value;
}

function requireSha(value: unknown, field: string): string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
    invalid(
      `the run state field \`${field}\` is not a full commit id`,
      `\`${field}\` is ${JSON.stringify(value)}`,
      `record \`${field}\` as the full 40-character commit id, never an abbreviation or a ref`,
    );
  }
  return value;
}

function parseTicket(value: unknown, seen: Set<string>): TicketRunState {
  if (typeof value !== 'object' || value === null) {
    invalid('the run state has an unusable ticket entry', 'a ticket entry is not an object', 'rewrite the run state, or abort the run and plan again');
  }
  const ticket = value as Record<string, unknown>;
  const id = requireSlug(ticket.id, 'tickets[].id');
  if (seen.has(id)) {
    invalid(
      `the run state lists \`${id}\` twice`,
      'a run cannot hold the same ticket in two states at once',
      'abort the run and plan again; the cursor cannot be repaired by hand',
    );
  }
  seen.add(id);

  if (!PHASES.includes(ticket.phase as TicketPhase)) {
    invalid(
      `the run state has an unknown phase for \`${id}\``,
      `\`phase\` is ${JSON.stringify(ticket.phase)}; known phases are ${PHASES.join(', ')}`,
      'abort the run and plan again rather than reinterpreting an unknown phase',
    );
  }

  const commits = ticket.commits;
  if (!Array.isArray(commits) || commits.length > MAX_COMMITS) {
    invalid(
      `the run state has an unusable commit list for \`${id}\``,
      `\`commits\` must be an array of at most ${MAX_COMMITS} entries`,
      'abort the run; a commit list this size means the worker did not stop when it should have',
    );
  }
  for (const commit of commits) requireSha(commit, `tickets[${id}].commits[]`);

  const proofs = ticket.proofs;
  if (!Array.isArray(proofs) || proofs.length > MAX_PROOFS || proofs.some((p) => typeof p !== 'string')) {
    invalid(
      `the run state has an unusable proof list for \`${id}\``,
      `\`proofs\` must be an array of at most ${MAX_PROOFS} names`,
      'record proofs as short names such as `build` or `test`',
    );
  }

  const blocker = ticket.blocker;
  if (blocker !== null && (typeof blocker !== 'string' || blocker.length > MAX_BLOCKER_LENGTH)) {
    invalid(
      `the run state has an unusable blocker for \`${id}\``,
      `\`blocker\` must be null or a string of at most ${MAX_BLOCKER_LENGTH} characters`,
      'record the blocker as one bounded sentence and keep the detail in the tracker comment',
    );
  }

  return {
    id,
    phase: ticket.phase as TicketPhase,
    branch: ticket.branch === null ? null : requireSlug(ticket.branch, `tickets[${id}].branch`),
    commits: commits as string[],
    proofs: proofs as string[],
    blocker: blocker as string | null,
  };
}

function parseIntegration(value: unknown): IntegrationRunState {
  if (typeof value !== 'object' || value === null) {
    invalid('the run state has no integration block', '`integration` is not an object', 'abort the run and plan again');
  }
  const integration = value as Record<string, unknown>;

  if (!PR_STATES.includes(integration.prState as PullRequestState)) {
    invalid(
      'the run state has an unknown pull request state',
      `\`integration.prState\` is ${JSON.stringify(integration.prState)}; known states are ${PR_STATES.join(', ')}`,
      'abort the run and re-observe GitHub rather than reinterpreting the cursor',
    );
  }
  const prState = integration.prState as PullRequestState;

  const prUrl = integration.prUrl;
  if (prUrl !== null && (typeof prUrl !== 'string' || !prUrl.startsWith('https://github.com/'))) {
    invalid(
      'the run state has an unusable pull request url',
      `\`integration.prUrl\` is ${JSON.stringify(prUrl)}`,
      'record the https://github.com/... url of the integration pull request, or null',
    );
  }
  if (prState !== 'none' && prUrl === null) {
    // A PR state with no URL cannot be re-observed, so resume could neither
    // confirm nor deny it — the pairing is a contradiction, not a gap.
    invalid(
      'the run state claims a pull request it cannot point to',
      `\`integration.prState\` is \`${prState}\` while \`prUrl\` is null`,
      'record the pull request url alongside its state, or set prState to `none`',
    );
  }

  return {
    branch: integration.branch === null ? null : requireSlug(integration.branch, 'integration.branch'),
    headSha: integration.headSha === null ? null : requireSha(integration.headSha, 'integration.headSha'),
    prUrl: prUrl as string | null,
    prState,
  };
}

export function parseRunState(text: string): RunState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    invalid(
      'the run state file is not valid JSON',
      error instanceof Error ? error.message : String(error),
      'the cursor is unreadable: abort the run so it is rebuilt from the tracker and git',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    invalid('the run state file does not hold an object', 'the parsed body is not a JSON object', 'abort the run and plan again');
  }
  const state = parsed as Record<string, unknown>;

  if (state.schemaVersion !== 1) {
    invalid(
      'the run state uses a schema this CLI cannot read',
      state.schemaVersion === undefined
        ? '`schemaVersion` is absent, which is how the pre-autopilot engine wrote its state'
        : `\`schemaVersion\` is ${String(state.schemaVersion)}`,
      'run `autopilot abort` to release that run, then plan again; the cursor is never migrated by guesswork',
    );
  }

  const base = state.base as { branch?: unknown; sha?: unknown } | undefined;
  if (typeof base !== 'object' || base === null) {
    invalid('the run state has no base', '`base` is not an object', 'abort the run and plan again');
  }

  const tickets = state.tickets;
  if (!Array.isArray(tickets) || tickets.length === 0 || tickets.length > MAX_TICKETS) {
    invalid(
      'the run state has an unusable ticket list',
      `\`tickets\` must hold between 1 and ${MAX_TICKETS} entries, found ${Array.isArray(tickets) ? tickets.length : 'none'}`,
      'abort the run and plan again',
    );
  }

  const startedAt = state.startedAt;
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) {
    invalid(
      'the run state has an unusable start time',
      `\`startedAt\` is ${JSON.stringify(startedAt)}`,
      'record `startedAt` as an ISO-8601 instant',
    );
  }

  const seen = new Set<string>();
  return {
    schemaVersion: 1,
    runId: requireSlug(state.runId, 'runId'),
    clusterId: requireSlug(state.clusterId, 'clusterId'),
    programId: requireSlug(state.programId, 'programId'),
    startedAt,
    base: { branch: requireSlug(base.branch, 'base.branch'), sha: requireSha(base.sha, 'base.sha') },
    tickets: tickets.map((ticket) => parseTicket(ticket, seen)),
    integration: parseIntegration(state.integration),
    trackerSynced: state.trackerSynced === true,
  };
}

/**
 * Serialise deterministically: the same state always produces the same bytes,
 * so an interrupted write can be retried and compared without a diff appearing
 * out of key ordering alone.
 */
export function serializeRunState(state: RunState): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      runId: state.runId,
      clusterId: state.clusterId,
      programId: state.programId,
      startedAt: state.startedAt,
      base: { branch: state.base.branch, sha: state.base.sha },
      tickets: state.tickets.map((ticket) => ({
        id: ticket.id,
        phase: ticket.phase,
        branch: ticket.branch,
        commits: ticket.commits,
        proofs: ticket.proofs,
        blocker: ticket.blocker,
      })),
      integration: {
        branch: state.integration.branch,
        headSha: state.integration.headSha,
        prUrl: state.integration.prUrl,
        prState: state.integration.prState,
      },
      trackerSynced: state.trackerSynced,
    },
    null,
    2,
  )}\n`;
}
