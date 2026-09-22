import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePullRequestView } from './loop-observe.js';
import {
  admitLoopTracker,
  decideLoop,
  type GithubObservation,
  type LoopAction,
  type LoopInput,
  type LoopTracker,
  loopProgramOf,
  parseStopSignal,
  type PullRequestObservation,
  protectedBranches,
  pullRequestsToObserve,
  type QueueEvent,
  type StopSignal,
} from './loop.js';
import { parseProgramDescriptor } from './program.js';
import { fingerprintOf, type SharedFingerprint, type SharedStateReading } from './shared-state.js';

// The kernel decides what each slot does from what Linear and GitHub say, and
// from nothing else: no memory of the previous tick, no session state. Every
// test therefore describes a complete observation and reads the actions back,
// which is also what a restart looks like to the loop.

function programText(options: { clusterSize?: number; mergeGate?: string } = {}): string {
  const gate =
    (options.mergeGate ?? 'union-reviewed') === 'human'
      ? 'mergeGate: human'
      : 'mergeGate: union-reviewed\n  deployBranch: main';
  return `---
schemaVersion: 1
status: executing
program: loop
plan: docs/plans/p.md
spec: docs/specs/s.md
progress:
  provider: linear
  scope: voidcorp/DEV
  order: [DEV-1]
  states:
    ready: [Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done, Canceled]
autopilot:
  schemaVersion: 1
  clusterSize: ${options.clusterSize ?? 4}
  base: develop
  ${gate}
  ownership:
    sequential:
      - pnpm-lock.yaml
      - packages/cli/core-assets/**
---
`;
}

const program = (options?: { clusterSize?: number; mergeGate?: string }) =>
  loopProgramOf(parseProgramDescriptor(programText(options)));

interface TicketSpec {
  readonly id: string;
  readonly status?: string;
  readonly humanWait?: boolean;
  readonly pullRequest?: number;
  readonly branch?: string;
  readonly footprint?: readonly string[] | undefined;
  readonly readiness?: unknown;
  readonly review?: unknown;
  readonly conflict?: unknown;
}

const ready = { verdict: 'ready', reason: 'Scope, footprint and acceptance are explicit.' };

/** A queued ticket, ready, owning its own directory unless told otherwise. */
function queued(id: string, footprint: readonly string[] = [`packages/${id.toLowerCase()}`]): TicketSpec {
  return { id, status: 'Todo', footprint, readiness: ready };
}

/** A ticket already holding a slot, as Linear reports it after `assign`. */
function started(id: string, extra: Partial<TicketSpec> = {}): TicketSpec {
  return { id, status: 'In Progress', footprint: [`packages/${id.toLowerCase()}`], ...extra };
}

interface TrackerSpec {
  readonly tickets: readonly TicketSpec[];
  readonly queue?: unknown;
  readonly recent?: readonly { ticketId: string; outcome: 'merged' | 'human-wait' }[];
  readonly liveWorkers?: readonly string[];
  readonly quota?: 'ok' | 'low';
}

function trackerRaw(spec: TrackerSpec): Record<string, unknown> {
  const queue = spec.queue ?? {
    entries: spec.tickets
      .filter((ticket) => ticket.status === 'Todo')
      .map((ticket) => ({
        ticketId: ticket.id,
        justification: 'Unblocks the next slice of the loop.',
        footprint: ticket.footprint ?? ['packages/x'],
      })),
  };
  return {
    schemaVersion: 1,
    queue,
    tickets: spec.tickets.map(({ humanWait, ...ticket }) => ({ humanWait: humanWait ?? false, ...ticket })),
    recent: spec.recent ?? [],
    liveWorkers: spec.liveWorkers ?? [],
    quota: spec.quota ?? 'ok',
  };
}

function tracker(spec: TrackerSpec): LoopTracker {
  const admission = admitLoopTracker(trackerRaw(spec));
  if (!admission.ok) throw new Error(admission.reason);
  return admission.value;
}

type Raw = Record<string, unknown>;
const openView = (): Raw =>
  JSON.parse(readFileSync(new URL('./__fixtures__/gh/pr-view-open.json', import.meta.url), 'utf8')) as Raw;
const statusShape = (): Raw =>
  (
    JSON.parse(
      readFileSync(new URL('./__fixtures__/gh/status-contexts.json', import.meta.url), 'utf8'),
    ) as Raw[]
  )[1] as Raw;

interface PullSpec {
  readonly number: number;
  readonly branch: string;
  readonly state?: 'OPEN' | 'MERGED' | 'CLOSED';
  readonly draft?: boolean;
  readonly base?: string;
  readonly mergeState?: string;
  readonly autoMerge?: boolean;
  readonly failingCheck?: boolean;
  readonly review?: 'SUCCESS' | 'FAILURE' | 'PENDING' | undefined;
  readonly queue?: QueueEvent;
}

/** A pull request read through the real parser from a real `gh pr view` capture. */
function pull(spec: PullSpec): PullRequestObservation {
  const view = openView();
  const passing = view.statusCheckRollup as Raw[];
  const [firstRun] = passing;
  const rollup = [
    ...passing,
    ...(spec.failingCheck === true ? [{ ...firstRun, name: 'validate', conclusion: 'FAILURE' }] : []),
    ...(spec.review === undefined
      ? []
      : [{ ...statusShape(), context: 'void/independent-review', state: spec.review }]),
  ];
  const armed = JSON.parse(
    readFileSync(new URL('./__fixtures__/gh/pr-view-auto-merge.json', import.meta.url), 'utf8'),
  ) as Raw;
  const parsed = parsePullRequestView(
    JSON.stringify({
      ...view,
      number: spec.number,
      state: spec.state ?? 'OPEN',
      isDraft: spec.draft ?? false,
      headRefName: spec.branch,
      headRefOid: String(spec.number).padStart(40, 'a'),
      baseRefName: spec.base ?? 'develop',
      mergeStateStatus: spec.mergeState ?? 'BLOCKED',
      autoMergeRequest: spec.autoMerge === true ? armed.autoMergeRequest : view.autoMergeRequest,
      statusCheckRollup: rollup,
    }),
  );
  return { ...parsed, queue: spec.queue ?? 'none' };
}

const SHARED_READING: SharedStateReading = {
  config: 'core.bare=false\n',
  stash: '',
  tags: '',
  notes: '',
  remotes: '',
  bases: 'dddddddd refs/heads/develop\n',
  replace: '',
  hooks: '',
  info: '',
};

/** The shared Git state as it stands, and a record of it for every ticket. */
function sharedState(
  spec: TrackerSpec,
  options: {
    changed?: readonly string[];
    unrecorded?: readonly string[];
    recordedBranch?: string;
  } = {},
): LoopInput['sharedState'] {
  const before = new Map<string, SharedFingerprint>();
  for (const ticket of spec.tickets) {
    if (options.unrecorded?.includes(ticket.id) === true) continue;
    const changed = options.changed?.includes(ticket.id) === true;
    const reading = changed ? { ...SHARED_READING, stash: 'dddddddd\n' } : SHARED_READING;
    before.set(ticket.id, fingerprintOf(reading, options.recordedBranch ?? `work/${ticket.id}`));
  }
  return { current: SHARED_READING, before };
}

function github(pulls: readonly PullRequestObservation[], mergeQueue = true): GithubObservation {
  return { base: 'develop', mergeQueue, pullRequests: new Map(pulls.map((observed) => [observed.number, observed])) };
}

function decide(
  spec: TrackerSpec,
  options: {
    pulls?: readonly PullRequestObservation[];
    mergeQueue?: boolean;
    signal?: StopSignal;
    clusterSize?: number;
    mergeGate?: string;
    changed?: readonly string[];
    unrecorded?: readonly string[];
  } = {},
): readonly LoopAction[] {
  const input: LoopInput = {
    program: program({
      ...(options.clusterSize === undefined ? {} : { clusterSize: options.clusterSize }),
      ...(options.mergeGate === undefined ? {} : { mergeGate: options.mergeGate }),
    }),
    tracker: tracker(spec),
    github: github(options.pulls ?? [], options.mergeQueue ?? true),
    signal: options.signal ?? 'none',
    sharedState: sharedState(spec, {
      ...(options.changed === undefined ? {} : { changed: options.changed }),
      ...(options.unrecorded === undefined ? {} : { unrecorded: options.unrecorded }),
    }),
  };
  return decideLoop(input).actions;
}

const assigned = (actions: readonly LoopAction[]): string[] =>
  actions.flatMap((action) => (action.kind === 'assign' ? [action.ticketId] : []));

function actionFor(actions: readonly LoopAction[], ticketId: string): LoopAction | undefined {
  return actions.find((action) => 'ticketId' in action && action.ticketId === ticketId);
}

const reviewed = (id: string, number: number, extra: Partial<PullSpec> = {}): PullSpec => ({
  number,
  branch: `work/${id}`,
  review: 'SUCCESS',
  ...extra,
});

describe('slot assignment', () => {
  it('gives free slots to the head of the curator queue, four at most', () => {
    const tickets = ['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4', 'DEV-5', 'DEV-6'].map((id) => queued(id));
    expect(assigned(decide({ tickets }))).toEqual(['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4']);
  });

  it('honours a smaller declared cluster size and the slots already held', () => {
    const tickets = [started('DEV-9'), queued('DEV-1'), queued('DEV-2')];
    expect(assigned(decide({ tickets }, { clusterSize: 2 }))).toEqual(['DEV-1']);
  });

  it('assigns in queue order, not tracker order', () => {
    const tickets = [queued('DEV-1'), queued('DEV-2')];
    const queue = {
      entries: [
        { ticketId: 'DEV-2', justification: 'Unblocks DEV-1.', footprint: ['packages/dev-2'] },
        { ticketId: 'DEV-1', justification: 'Follows DEV-2.', footprint: ['packages/dev-1'] },
      ],
    };
    expect(assigned(decide({ tickets, queue }, { clusterSize: 1 }))).toEqual(['DEV-2']);
  });

  it('skips a ticket whose footprint overlaps a held slot and takes the next', () => {
    const tickets = [
      started('DEV-9', { footprint: ['packages/cli/src'] }),
      queued('DEV-1', ['packages/cli/src/lib/loop.ts']),
      queued('DEV-2', ['packages/core']),
    ];
    expect(assigned(decide({ tickets }))).toEqual(['DEV-2']);
  });

  it('never seats two overlapping tickets in the same tick', () => {
    const tickets = [queued('DEV-1', ['packages/cli']), queued('DEV-2', ['packages/cli/src'])];
    expect(assigned(decide({ tickets }))).toEqual(['DEV-1']);
  });

  it('admits one ticket at a time on a path the program declares sequential', () => {
    const tickets = [
      queued('DEV-1', ['packages/cli/core-assets/a']),
      queued('DEV-2', ['packages/cli/core-assets/b']),
      queued('DEV-3', ['packages/core']),
    ];
    expect(assigned(decide({ tickets }))).toEqual(['DEV-1', 'DEV-3']);
  });

  it('seats nothing beside a held ticket whose footprint is unknown', () => {
    const tickets = [started('DEV-9', { footprint: undefined }), queued('DEV-1')];
    expect(assigned(decide({ tickets }))).toEqual([]);
  });

  it('gives a slot only to a ticket judged ready', () => {
    const tickets = [
      { ...queued('DEV-1'), readiness: { verdict: 'needs-enrichment', reason: 'No acceptance.' } },
      { ...queued('DEV-2'), readiness: { verdict: 'ambiguous', reason: 'Two readings.' } },
      { ...queued('DEV-3'), readiness: undefined },
      queued('DEV-4'),
    ];
    expect(assigned(decide({ tickets }))).toEqual(['DEV-4']);
  });

  it('reports a malformed readiness judgment instead of reading it', () => {
    const tickets = [{ ...queued('DEV-1'), readiness: { verdict: 'ready' } }, queued('DEV-2')];
    const decision = decideLoop({
      program: program(),
      tracker: tracker({ tickets }),
      github: github([]),
      signal: 'none',
      sharedState: sharedState({ tickets }),
    });
    expect(assigned(decision.actions)).toEqual(['DEV-2']);
    expect(decision.refusals.join('\n')).toMatch(/DEV-1.*ticket readiness refused: reason/);
  });

  it('assigns nothing from a curator queue it cannot admit', () => {
    const tickets = [queued('DEV-1')];
    const queue = { entries: [{ ticketId: 'DEV-1', justification: 'x', footprint: [] }] };
    const decision = decideLoop({
      program: program(),
      tracker: tracker({ tickets, queue }),
      github: github([]),
      signal: 'none',
      sharedState: sharedState({ tickets }),
    });
    expect(decision.actions).toEqual([]);
    expect(decision.refusals.join('\n')).toMatch(/curator queue refused/);
  });

  it('never re-assigns a ticket already done, in human wait or held', () => {
    const tickets = [
      { ...queued('DEV-1'), status: 'Done' },
      { ...queued('DEV-2'), humanWait: true },
      { ...queued('DEV-3'), status: 'In Review' },
      queued('DEV-4'),
    ];
    const queue = {
      entries: ['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4'].map((ticketId) => ({
        ticketId,
        justification: 'Next in line.',
        footprint: [`packages/${ticketId.toLowerCase()}`],
      })),
    };
    expect(assigned(decide({ tickets, queue }))).toEqual(['DEV-4']);
  });

  it('does not seat a queued ticket the tracker does not report', () => {
    const queue = {
      entries: [{ ticketId: 'DEV-7', justification: 'Next.', footprint: ['packages/dev-7'] }],
    };
    expect(assigned(decide({ tickets: [], queue }))).toEqual([]);
  });
});

describe('resumption after a restart', () => {
  it('resumes a held ticket without a pull request instead of seating it again', () => {
    const tickets = [started('DEV-1'), queued('DEV-2')];
    const queue = {
      entries: ['DEV-1', 'DEV-2'].map((ticketId) => ({
        ticketId,
        justification: 'Next.',
        footprint: [`packages/${ticketId.toLowerCase()}`],
      })),
    };
    const actions = decide({ tickets, queue });
    expect(assigned(actions)).toEqual(['DEV-2']);
    expect(actionFor(actions, 'DEV-1')).toEqual({
      kind: 'hand-back-to-worker',
      ticketId: 'DEV-1',
      reason: 'resume',
    });
  });

  it('treats a live worker as a held slot even before Linear shows it started', () => {
    const tickets = [queued('DEV-1'), queued('DEV-2')];
    const actions = decide({ tickets, liveWorkers: ['DEV-1'] }, { clusterSize: 2 });
    expect(assigned(actions)).toEqual(['DEV-2']);
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'wait', reason: 'worker-active' });
  });

  it('produces the same decisions when replayed on the same observation', () => {
    const spec = { tickets: [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }), queued('DEV-2')] };
    const pulls = [pull(reviewed('DEV-1', 11))];
    expect(decide(spec, { pulls })).toEqual(decide(spec, { pulls }));
  });
});

describe('a held ticket and its pull request', () => {
  function one(ticket: Partial<TicketSpec>, spec: Partial<PullSpec>, options = {}) {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1', ...ticket })];
    const actions = decide({ tickets }, { pulls: [pull({ ...reviewed('DEV-1', 11), ...spec })], ...options });
    return actionFor(actions, 'DEV-1');
  }

  it('frees the slot of a merged ticket for the queue head', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }), queued('DEV-2')];
    const actions = decide({ tickets }, { clusterSize: 1, pulls: [pull({ ...reviewed('DEV-1', 11), state: 'MERGED' })] });
    expect(actionFor(actions, 'DEV-1')).toBeUndefined();
    expect(assigned(actions)).toEqual(['DEV-2']);
  });

  it('sends a pull request closed unmerged to a human', () => {
    expect(one({}, { state: 'CLOSED' })).toMatchObject({ kind: 'mark-human-wait', reason: 'pull-request-closed' });
  });

  it('sends a pull request on an unexpected base or branch to a human', () => {
    expect(one({}, { base: 'main' })).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
    expect(one({ branch: 'work/other' }, {})).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
  });

  it('compares the pull request with the base as resolved, not as declared', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' })];
    const auto = loopProgramOf(parseProgramDescriptor(programText().replace('base: develop', 'base: auto')));
    const spec = { tickets };
    const decision = decideLoop({
      program: auto,
      tracker: tracker(spec),
      github: github([pull(reviewed('DEV-1', 11))]),
      signal: 'none',
      sharedState: sharedState(spec),
    });
    expect(actionFor(decision.actions, 'DEV-1')).toMatchObject({ kind: 'enable-auto-merge' });
  });

  it('never arms a merge into the branch that deploys, once `auto` resolves to it', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' })];
    const auto = loopProgramOf(parseProgramDescriptor(programText().replace('base: develop', 'base: auto')));
    const spec = { tickets };
    const onMain: GithubObservation = {
      ...github([pull({ ...reviewed('DEV-1', 11), base: 'main' })]),
      base: 'main',
    };
    const decision = decideLoop({
      program: auto,
      tracker: tracker(spec),
      github: onMain,
      signal: 'none',
      sharedState: sharedState(spec),
    });
    expect(actionFor(decision.actions, 'DEV-1')).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'deploy-branch-target',
    });
  });

  it('sends a pull request it could not observe to a human', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' })];
    expect(actionFor(decide({ tickets }), 'DEV-1')).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'ambiguous-state',
    });
  });

  it('leaves a live worker alone whatever its pull request says', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' })];
    const pulls = [pull({ ...reviewed('DEV-1', 11), failingCheck: true })];
    const actions = decide({ tickets, liveWorkers: ['DEV-1'] }, { pulls });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'wait', reason: 'worker-active' });
  });

  it('resumes a draft nobody is working on', () => {
    expect(one({}, { draft: true })).toMatchObject({ kind: 'hand-back-to-worker', reason: 'resume' });
  });

  it('hands failing checks back to the worker', () => {
    expect(one({}, { failingCheck: true })).toMatchObject({
      kind: 'hand-back-to-worker',
      reason: 'checks-failed',
    });
  });

  it('waits for the reviewer while no verdict sits on the head', () => {
    expect(one({}, { review: undefined })).toMatchObject({ kind: 'wait', reason: 'awaiting-review' });
    expect(one({}, { review: 'PENDING' })).toMatchObject({ kind: 'wait', reason: 'awaiting-review' });
  });

  it('bounds the review to two rounds', () => {
    const finding = {
      location: 'packages/cli/src/a.ts:3',
      scenario: 'A merged ticket keeps its slot.',
      correction: 'Free the slot on merge.',
    };
    const round = (value: 1 | 2) => ({ round: value, blocking: [finding], advisory: [] });
    expect(one({ review: round(1) }, { review: 'FAILURE' })).toMatchObject({
      kind: 'hand-back-to-worker',
      reason: 'review-blocking',
    });
    expect(one({ review: round(2) }, { review: 'FAILURE' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'review-rounds-exhausted',
    });
  });

  it('sends a verdict it cannot read, or that contradicts its status, to a human', () => {
    expect(one({}, { review: 'FAILURE' })).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
    const unscenarioed = { round: 1, blocking: [{ location: 'a.ts:1', scenario: '', correction: 'x' }], advisory: [] };
    expect(one({ review: unscenarioed }, { review: 'FAILURE' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'ambiguous-state',
    });
    const blocking = {
      round: 1,
      blocking: [{ location: 'a.ts:1', scenario: 'Breaks.', correction: 'Fix.' }],
      advisory: [],
    };
    expect(one({ review: blocking }, { review: 'SUCCESS' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'ambiguous-state',
    });
  });

  it('arms the auto-merge on the exact head the reviewer approved', () => {
    expect(one({}, {})).toEqual({
      kind: 'enable-auto-merge',
      ticketId: 'DEV-1',
      pullRequest: 11,
      headSha: String(11).padStart(40, 'a'),
    });
  });

  it('waits once the auto-merge is armed or the pull request is queued', () => {
    expect(one({}, { autoMerge: true })).toMatchObject({ kind: 'wait', reason: 'merging' });
    expect(one({}, { autoMerge: true, queue: 'queued' })).toMatchObject({ kind: 'wait', reason: 'merging' });
  });

  it('hands an ejected pull request back to its worker', () => {
    expect(one({}, { queue: 'ejected' })).toMatchObject({ kind: 'hand-back-to-worker', reason: 'ejected' });
  });

  it('routes a conflict by the class the worker gave it', () => {
    expect(one({}, { mergeState: 'DIRTY' })).toMatchObject({ kind: 'hand-back-to-worker', reason: 'conflict' });
    const mechanical = { class: 'mechanical', reason: 'Both sides appended to one list.' };
    expect(one({ conflict: mechanical }, { mergeState: 'DIRTY' })).toMatchObject({
      kind: 'hand-back-to-worker',
      reason: 'conflict',
    });
    const semantic = { class: 'semantic', reason: 'Both sides changed the merge grant.' };
    expect(one({ conflict: semantic }, { mergeState: 'DIRTY' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'semantic-conflict',
    });
    expect(one({ conflict: { class: 'semantic' } }, { mergeState: 'DIRTY' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'ambiguous-state',
    });
  });

  it('leaves the merge to a human under a human merge gate', () => {
    expect(one({}, {}, { mergeGate: 'human' })).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'human-merge-gate',
    });
  });

  it('frees the slot of a ticket sent to a human in the same tick', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }), queued('DEV-2')];
    const pulls = [pull({ ...reviewed('DEV-1', 11), state: 'CLOSED' })];
    expect(assigned(decide({ tickets }, { clusterSize: 1, pulls }))).toEqual(['DEV-2']);
  });
});

describe('shared repository state', () => {
  const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' })];
  const pulls = [pull(reviewed('DEV-1', 11))];

  it('refuses to publish a unit that changed the shared Git state', () => {
    const actions = decide({ tickets }, { pulls, changed: ['DEV-1'] });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'shared-state-changed',
      detail: expect.stringMatching(/stash/),
    });
  });

  it('refuses to publish a unit whose state before it was never recorded', () => {
    const actions = decide({ tickets }, { pulls, unrecorded: ['DEV-1'] });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
  });

  it("ignores the upstream the worker set on its own branch, and only that one", () => {
    const input = (config: string): LoopInput => ({
      program: program(),
      tracker: tracker({ tickets }),
      github: github(pulls),
      signal: 'none',
      sharedState: { ...sharedState({ tickets }), current: { ...SHARED_READING, config } },
    });
    const own = `${SHARED_READING.config}branch.work/DEV-1.remote=origin\n`;
    expect(actionFor(decideLoop(input(own)).actions, 'DEV-1')).toMatchObject({ kind: 'enable-auto-merge' });
    const base = `${SHARED_READING.config}branch.develop.merge=refs/heads/work/DEV-1\n`;
    expect(actionFor(decideLoop(input(base)).actions, 'DEV-1')).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'shared-state-changed',
    });
  });

  it('refuses a baseline recorded for another branch than the ticket holds', () => {
    const input: LoopInput = {
      program: program(),
      tracker: tracker({ tickets }),
      github: github(pulls),
      signal: 'none',
      sharedState: sharedState({ tickets }, { recordedBranch: 'develop' }),
    };
    expect(actionFor(decideLoop(input).actions, 'DEV-1')).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'ambiguous-state',
      detail: expect.stringMatching(/develop/),
    });
  });

  it('protects the local refs of every branch the loop may merge into or ship from', () => {
    expect(protectedBranches(program().autopilot)).toEqual(['develop', 'main']);
    const auto = loopProgramOf(parseProgramDescriptor(programText({ mergeGate: 'human' }).replace('base: develop', 'base: auto')));
    expect(protectedBranches(auto.autopilot)).toEqual(['develop', 'main']);
    const human = program({ mergeGate: 'human' });
    expect(protectedBranches(human.autopilot)).toEqual(['develop']);
  });

  it('publishes a unit that left the shared state as it found it', () => {
    expect(actionFor(decide({ tickets }, { pulls }), 'DEV-1')).toMatchObject({ kind: 'enable-auto-merge' });
  });
});

describe('serial merges without a merge queue', () => {
  const tickets = [
    started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }),
    started('DEV-2', { pullRequest: 12, branch: 'work/DEV-2' }),
  ];

  it('lets one pull request merge at a time, the oldest first', () => {
    const pulls = [pull(reviewed('DEV-1', 11)), pull(reviewed('DEV-2', 12))];
    const actions = decide({ tickets }, { pulls, mergeQueue: false });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'enable-auto-merge', pullRequest: 11 });
    expect(actionFor(actions, 'DEV-2')).toMatchObject({ kind: 'wait', reason: 'serial-merge-turn' });
  });

  it('keeps the turn with a pull request already merging', () => {
    const pulls = [pull(reviewed('DEV-1', 11)), pull(reviewed('DEV-2', 12, { autoMerge: true }))];
    const actions = decide({ tickets }, { pulls, mergeQueue: false });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'wait', reason: 'serial-merge-turn' });
    expect(actionFor(actions, 'DEV-2')).toMatchObject({ kind: 'wait', reason: 'merging' });
  });

  it('updates the pull request whose turn it is when its base moved', () => {
    const pulls = [pull(reviewed('DEV-1', 11, { mergeState: 'BEHIND' })), pull(reviewed('DEV-2', 12))];
    const actions = decide({ tickets }, { pulls, mergeQueue: false });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'hand-back-to-worker', reason: 'update-on-base' });
    expect(actionFor(actions, 'DEV-2')).toMatchObject({ kind: 'wait', reason: 'serial-merge-turn' });
  });

  it('leaves a base that moved to the merge queue when there is one', () => {
    const pulls = [pull(reviewed('DEV-1', 11, { mergeState: 'BEHIND' })), pull(reviewed('DEV-2', 12))];
    const actions = decide({ tickets }, { pulls, mergeQueue: true });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'enable-auto-merge' });
    expect(actionFor(actions, 'DEV-2')).toMatchObject({ kind: 'enable-auto-merge' });
  });
});

describe('stopping', () => {
  it('freezes everything on an immediate stop', () => {
    const tickets = [started('DEV-1'), queued('DEV-2')];
    expect(decide({ tickets }, { signal: 'now' })).toEqual([{ kind: 'freeze' }]);
  });

  it('drains on request: no new ticket, held ones carried to their end', () => {
    const tickets = [started('DEV-1'), queued('DEV-2')];
    const actions = decide({ tickets }, { signal: 'drain' });
    expect(assigned(actions)).toEqual([]);
    expect(actions).toContainEqual({ kind: 'drain', reason: 'requested' });
    expect(actionFor(actions, 'DEV-1')).toMatchObject({ kind: 'hand-back-to-worker' });
    expect(actions.some((action) => action.kind === 'recap')).toBe(false);
  });

  it('writes the recap once a drain holds no slot any more', () => {
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }), queued('DEV-2')];
    const pulls = [pull({ ...reviewed('DEV-1', 11), state: 'MERGED' })];
    const recent = [{ ticketId: 'DEV-0', outcome: 'human-wait' as const }];
    const actions = decide({ tickets, recent }, { signal: 'drain', pulls });
    expect(actions).toContainEqual({
      kind: 'recap',
      merged: ['DEV-1'],
      humanWait: ['DEV-0'],
    });
  });

  it('drains when the quota runs low', () => {
    const actions = decide({ tickets: [queued('DEV-1')], quota: 'low' });
    expect(assigned(actions)).toEqual([]);
    expect(actions).toContainEqual({ kind: 'drain', reason: 'quota-low' });
  });

  it('drains after three consecutive tickets sent to a human', () => {
    const recent = [
      { ticketId: 'DEV-7', outcome: 'merged' as const },
      { ticketId: 'DEV-8', outcome: 'human-wait' as const },
      { ticketId: 'DEV-9', outcome: 'human-wait' as const },
    ];
    const tickets = [started('DEV-1', { pullRequest: 11, branch: 'work/DEV-1' }), queued('DEV-2')];
    const pulls = [pull({ ...reviewed('DEV-1', 11), state: 'CLOSED' })];
    const actions = decide({ tickets, recent }, { pulls });
    expect(actions).toContainEqual({ kind: 'drain', reason: 'human-wait-streak' });
    expect(assigned(actions)).toEqual([]);
    // Two in a row is not three: a merge in between resets the count.
    const broken = [...recent.slice(1), { ticketId: 'DEV-6', outcome: 'merged' as const }];
    expect(assigned(decide({ tickets, recent: broken }, { pulls }))).toEqual(['DEV-2']);
  });

  it('drains when no queued ticket is ready or can be made ready', () => {
    const tickets = [
      { ...queued('DEV-1'), readiness: { verdict: 'ambiguous', reason: 'Two readings.' } },
    ];
    expect(decide({ tickets })).toContainEqual({ kind: 'drain', reason: 'backlog-exhausted' });
  });

  it('keeps going while a ticket only waits for enrichment or a collision', () => {
    const enriching = [{ ...queued('DEV-1'), readiness: { verdict: 'needs-enrichment', reason: 'x.' } }];
    expect(decide({ tickets: enriching }).some((action) => action.kind === 'drain')).toBe(false);
    const colliding = [started('DEV-9', { footprint: ['packages'] }), queued('DEV-1')];
    expect(decide({ tickets: colliding }).some((action) => action.kind === 'drain')).toBe(false);
  });
});

describe('boundaries', () => {
  it('refuses a malformed tracker observation with the field at fault', () => {
    const raw = trackerRaw({ tickets: [queued('DEV-1')] });
    const admission = admitLoopTracker({ ...raw, quota: 'plenty' });
    expect(admission).toMatchObject({ ok: false });
    expect(admission.ok ? '' : admission.reason).toMatch(/quota/);
    expect(admitLoopTracker({ ...raw, extra: true }).ok).toBe(false);
    const twice = { ...raw, tickets: [...(raw.tickets as unknown[]), ...(raw.tickets as unknown[])] };
    expect(admitLoopTracker(twice).ok ? '' : 'refused').toBe('refused');
  });

  it('refuses a program that did not consent to autopilot', () => {
    const withheld = programText().replace('  schemaVersion: 1\n  clusterSize', '  enabled: false\n  schemaVersion: 1\n  clusterSize');
    expect(() => loopProgramOf(parseProgramDescriptor(withheld))).toThrow(/autopilot/);
  });

  it('reads the stop signal and refuses one it does not know', () => {
    expect(parseStopSignal(undefined)).toBe('none');
    expect(parseStopSignal('drain\n')).toBe('drain');
    expect(parseStopSignal(' now ')).toBe('now');
    expect(() => parseStopSignal('pause')).toThrow(/stop signal/);
  });

  it('observes the pull requests of held tickets only', () => {
    const tickets = [
      started('DEV-1', { pullRequest: 11 }),
      started('DEV-2'),
      { ...queued('DEV-3'), pullRequest: 13 },
      started('DEV-4', { pullRequest: 14, humanWait: true }),
    ];
    expect(pullRequestsToObserve(program(), tracker({ tickets, liveWorkers: ['DEV-3'] }))).toEqual([11, 13]);
  });
});
