// What each autopilot step accepts, declared once and used twice.
//
// Measured on 2026-08-30: driving one attended run took about twenty tool calls
// spent reverse-engineering `ReservationReceipt`, `RunState`, `LeaseMarker` and
// `TrackerObservation` out of TypeScript interfaces, two of them wrong on the
// first attempt, and a missing `base.branch` surfaced as
// `Cannot read properties of undefined (reading 'branch')`.
//
// The single declaration is the point. A scaffold written separately from the
// validator is a second contract that drifts from the first, and the reader
// discovers the drift the same way they discovered the shape: by reading source.
// Here the scaffold IS the shape, and a test asserts the validator accepts it.

import { autopilotFailure } from './errors.js';
import { MARKER_BEGIN, MARKER_END } from './linear-marker.js';

export type AutopilotInputStep = 'plan' | 'start' | 'status' | 'chain' | 'reconcile';

type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

interface FieldSpec {
  /** Dotted path from the payload root, so a nested miss is reported as a path. */
  readonly name: string;
  readonly type: FieldType;
  /** How the skill obtains this, in the words of the thing it reads. */
  readonly from: string;
  /** Only a top-level field carries one: the parent's example is authoritative,
   * and a nested example would clobber it in the scaffold. */
  readonly example?: unknown;
}

interface InputShape {
  readonly what: string;
  readonly fields: readonly FieldSpec[];
  /**
   * What the field types cannot say: how the entries of one field relate to
   * each other and to another field. Runs after every field has its type.
   */
  readonly refine?: (payload: unknown) => void;
}

const SHA = '0'.repeat(40);
const NOW = '1970-01-01T00:00:00.000Z';

export const INPUT_SHAPES: Readonly<Record<AutopilotInputStep, InputShape>> = Object.freeze({
  plan: {
    what: 'candidate observation',
    fields: [
      {
        name: 'schemaVersion',
        type: 'number',
        from: 'always 1',
        example: 1,
      },
      {
        name: 'tickets',
        type: 'array',
        from: 'the tracker, one entry per unit in `progress.order` that is not done',
        example: [{
          id: 'DEV-1',
          ready: true,
          priority: 2,
          boardOrder: 1,
          blockedByOpen: false,
          dependsOn: [],
          estimate: null,
        }],
      },
      {
        name: 'footprints',
        type: 'array',
        from: 'the paths each ticket names as its anchors, at least one -- a ticket whose'
          + ' `areas` is empty is excluded as `missing-footprint`, because autopilot routes on'
          + ' footprints and no later step can protect ground nobody named; `confidence` is'
          + ' yours to state',
        example: [{
          id: 'DEV-1',
          areas: ['packages/cli/src/lib/example.ts'],
          highRisk: false,
          confidence: 0.8,
        }],
      },
    ],
  },
  start: {
    what: 'reservation receipt',
    fields: [
      {
        name: 'intent',
        type: 'object',
        from: 'the cluster `plan` returned, plus the programme id and the marker below',
        example: {
          schemaVersion: 1,
          programId: 'your-program-slug',
          runId: 'run-0000-00-00-example',
          clusterId: 'cluster-example',
          cluster: ['DEV-1'],
          assigneeId: 'the tracker id of the maintainer claiming the cluster',
          states: { ready: ['Backlog', 'Todo'], started: 'In Progress', done: ['Done', 'Canceled'] },
          marker: {
            schemaVersion: 1,
            programId: 'your-program-slug',
            runId: 'run-0000-00-00-example',
            clusterId: 'cluster-example',
            baseBranch: 'develop',
            baseSha: SHA,
            integrationBranch: 'autopilot/run-0000-00-00-example',
            expiresAt: NOW,
          },
        },
      },
      // The nested fields below are declared because they are the ones that
      // actually bit: `state.base` missing surfaced as a TypeError from the
      // place that read it. Declaring the parent as "an object" tells a reader
      // nothing they did not already know.
      {
        name: 'intent.cluster',
        type: 'array',
        from: 'the `cluster` array `plan` returned, unchanged',
      },
      {
        name: 'intent.marker',
        type: 'object',
        from: 'the lease marker you wrote into every ticket comment, byte for byte',
      },
      {
        name: 'applied',
        type: 'array',
        from: 'one entry per tracker write you made, with `unknown` when the result is not certain',
        example: [{ issueId: 'DEV-1', kind: 'claim', result: 'applied' }],
      },
      {
        name: 'reobservation',
        type: 'object',
        from: 're-read EVERY ticket after the writes; `comments` carries the lease marker verbatim',
        example: {
          schemaVersion: 1,
          observedAt: NOW,
          issues: [{
            id: 'DEV-1',
            state: 'In Progress',
            assigneeId: 'the tracker id you claimed with',
            comments: ['<!-- void-harness:autopilot-lease:v1 ... -->'],
            blockedBy: [],
          }],
        },
      },
      {
        name: 'reobservation.issues',
        type: 'array',
        from: 'one entry per ticket in the cluster; a partial re-observation cannot settle a lease',
      },
      {
        name: 'state',
        type: 'object',
        from: 'the local run cursor; `base.sha` is the full commit the run was planned against',
        example: {
          schemaVersion: 1,
          runId: 'run-0000-00-00-example',
          clusterId: 'cluster-example',
          programId: 'your-program-slug',
          startedAt: NOW,
          base: { branch: 'develop', sha: SHA },
          tickets: [{ id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null }],
          integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
          trackerSynced: false,
        },
      },
      {
        name: 'state.base',
        type: 'object',
        from: '`{ branch, sha }` for the base the run was planned against; sha is the full 40 chars',
      },
      {
        name: 'state.tickets',
        type: 'array',
        from: 'one entry per ticket in the cluster, all `pending` before the first worker runs',
      },
      {
        name: 'state.integration',
        type: 'object',
        from: 'all null and `prState: none` until the integration branch exists',
      },
    ],
  },
  chain: {
    what: 'chain observation',
    refine: refineChain,
    fields: [
      {
        name: 'schemaVersion',
        type: 'number',
        from: 'always 1',
        example: 1,
      },
      {
        name: 'merged',
        type: 'array',
        from: 'one entry per unit this run already merged, oldest first; empty on the first step',
        example: [],
      },
      {
        name: 'taken',
        type: 'array',
        from: 'one entry per unit this run took, oldest first, as `{ tickets, outcome }` with'
          + ' outcome `merged`, `published-awaiting-human` or `unit-blocked`. None of them is'
          + ' remaining; a finished one, merged or published, measures how long a unit takes'
          + ' here, and a blocked one does not. The `merged` entries above must appear here as'
          + ' `merged`, and nothing else may: the two lists are cross-checked, not trusted',
        example: [],
      },
      {
        name: 'elapsedMs',
        type: 'number',
        from: 'now minus the run start; the budget is spent in wall clock, not in units',
        example: 0,
      },
      {
        name: 'debts',
        type: 'array',
        from: 'what earlier units of THIS run owe; empty on the first step. The step bounds and'
          + ' orders them, so pass everything and let it decide what a brief carries',
        example: [],
      },
      {
        name: 'pool',
        type: 'array',
        from: '`progress.order` filtered to units that are not done, INCLUDING the ones this run'
          + ' already merged -- the step subtracts them itself',
        example: ['DEV-1', 'DEV-2'],
      },
    ],
  },
  reconcile: {
    what: 'reconcile observation',
    fields: [
      {
        name: 'clusterId',
        type: 'string',
        from: 'the cluster id this run reserved; it names the integration branch',
        example: 'cluster-example',
      },
      {
        name: 'base',
        type: 'object',
        from: '`{ branch, sha }` for the base every worker built on; sha is the full 40 chars',
        example: { branch: 'develop', sha: SHA },
      },
      {
        name: 'cluster',
        type: 'array',
        from: 'EVERY ticket the run reserved, not only those that came back. A blocked ticket'
          + ' still holds its claim, and it is usually the one whose work got absorbed. Shrinking'
          + ' this list no longer disarms the audit: a `footprints` entry naming a ticket absent'
          + ' from here is refused, because the two lists then contradict each other',
        example: ['DEV-1'],
      },
      {
        name: 'results',
        type: 'array',
        from: 'each `WorkerResult` verbatim; an unreadable one is a failure for its ticket,'
          + ' never a reason to guess what it meant',
        example: [],
      },
      {
        name: 'observations',
        type: 'array',
        from: 'what GIT holds between the base and each head: `git log --format=\'%H %P\''
          + ' base..head` for `commits`, and `git diff --name-only base..head` for'
          + ' `observedFiles`. A worker\'s own lists are claims, not observations',
        example: [{
          ticketId: 'DEV-1',
          baseSha: SHA,
          headSha: SHA,
          commits: [{ sha: SHA, parents: [SHA] }],
          observedFiles: ['packages/cli/src/example.ts'],
        }],
      },
      {
        name: 'footprints',
        type: 'array',
        from: 'the `footprints` `orchestrate` returned, verbatim. A cluster of more than one'
          + ' ticket is refused without them: the audit cannot be skipped by omitting them,'
          + ' and a list re-derived here would only ever agree with the diff it came from.'
          + ' Each entry names one ticket of `cluster` and declares at least one area; an'
          + ' `areas: []` reads as no declaration at all, so it is refused the same way',
        example: [{ id: 'DEV-1', areas: ['packages/cli/src/lib/example.ts'] }],
      },
    ],
  },
  status: {
    what: 'remote observation',
    fields: [
      {
        name: 'tracker',
        type: 'object',
        from: 'a BoundaryReading: `{ kind: "value", value: "held" }`, or `{ kind: "nil" }` when'
          + ' the tracker could not be read. A partial reading is not a reading.',
        example: { kind: 'value', value: 'held' },
      },
      {
        name: 'pullRequest',
        type: 'object',
        from: 'a BoundaryReading too: `{ kind: "nil" }` when nothing is published, or'
          + ' `{ kind: "value", value: { number, state, headRef, headSha, baseRef, baseSha,'
          + ' mergeSha, checks } }`. A bare state cannot tell a branch that matches the local'
          + ' tree from one whose base moved, so recovery needs the detailed form.',
        example: { kind: 'nil' },
      },
      {
        name: 'workerRefs',
        type: 'object',
        from: '`git rev-parse` on each worker branch, wrapped the same way, so a worker that'
          + ' committed is re-observed rather than replayed',
        example: { kind: 'value', value: [] },
      },
    ],
  },
});

/** The payload a person can pipe straight back in, with every field present. */
export function scaffoldFor(step: AutopilotInputStep): unknown {
  const shape = INPUT_SHAPES[step];
  const scaffold: Record<string, unknown> = {};
  // Top-level fields only. A nested spec exists to name a path in a refusal, and
  // writing its example here would replace the parent object it lives inside.
  for (const field of shape.fields) {
    if (field.name.includes('.')) continue;
    scaffold[field.name] = field.example;
  }
  return scaffold;
}

const article = (type: FieldType): string => (type === 'array' || type === 'object' ? 'an' : 'a');

function typeOf(value: unknown): FieldType | 'null' | 'undefined' {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'object'
    ? kind
    : 'undefined';
}

function at(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[key]
      : undefined),
    payload,
  );
}

/**
 * Refuse a payload by naming the field, what was expected, and where it comes from.
 *
 * Unknown keys are accepted on purpose: a tracker adds fields nobody asked for,
 * and refusing them would turn every adapter upgrade into a breaking change. The
 * contract is what this step READS, not everything the caller may carry.
 */
export function validateAgainstShape(payload: unknown, step: AutopilotInputStep): void {
  const shape = INPUT_SHAPES[step];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `the ${shape.what} is not an object`,
      `received ${typeOf(payload)}`,
      `run \`void-harness autopilot scaffold ${step}\` for the shape this step accepts`,
    );
  }
  for (const field of shape.fields) {
    const actual = typeOf(at(payload, field.name));
    if (actual === field.type) continue;
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `the ${shape.what} is missing \`${field.name}\`, or it is the wrong type`,
      `\`${field.name}\` must be ${article(field.type)} ${field.type}, received ${actual}`,
      `${field.from}. Run \`void-harness autopilot scaffold ${step}\` for the whole shape.`,
    );
  }
  shape.refine?.(payload);
}

const TAKEN_OUTCOMES: readonly string[] = ['merged', 'published-awaiting-human', 'unit-blocked'];

interface TakenUnit {
  readonly tickets: readonly string[];
  readonly outcome: string;
}

function refuseChain(field: string, cause: string, fix: string): never {
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    `the chain observation carries an unusable \`${field}\``,
    cause,
    fix,
  );
}

/** The tickets an entry names, or a refusal naming the field it sits in. */
function ticketsOf(entry: unknown, field: string): readonly string[] {
  const tickets = at(entry, 'tickets');
  if (
    !Array.isArray(tickets) || tickets.length === 0
    || !tickets.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    refuseChain(
      `${field}.tickets`,
      `\`${field}.tickets\` must be a non-empty array of ticket ids, received`
        + ` ${JSON.stringify(tickets)}`,
      'list at least one ticket id per entry; a unit of nothing is not a unit',
    );
  }
  return tickets;
}

/** Every `taken` entry read as a unit: three outcomes, tickets owned by one entry. */
function takenUnits(taken: readonly unknown[]): readonly TakenUnit[] {
  const owner = new Map<string, number>();
  return taken.map((entry, index) => {
    const field = `taken[${String(index)}]`;
    const outcome = at(entry, 'outcome');
    if (typeof outcome !== 'string' || !TAKEN_OUTCOMES.includes(outcome)) {
      refuseChain(
        `${field}.outcome`,
        `\`${field}.outcome\` is ${JSON.stringify(outcome)}`,
        `use one of ${TAKEN_OUTCOMES.map((value) => `\`${value}\``).join(', ')};`
          + ' a unit ends one of three ways',
      );
    }
    const tickets = ticketsOf(entry, field);
    for (const id of tickets) {
      const earlier = owner.get(id);
      if (earlier !== undefined) {
        refuseChain(
          `${field}.tickets`,
          `${id} is listed by \`taken[${String(earlier)}]\` and again by \`${field}\``,
          'a unit is taken once; list each ticket in exactly one entry',
        );
      }
      owner.set(id, index);
    }
    return { tickets, outcome };
  });
}

/** The one `taken` entry that merged exactly these tickets, or a refusal. */
function refuseUnlessOneUnitMerged(
  units: readonly TakenUnit[],
  tickets: readonly string[],
  field: string,
): void {
  const matching = units.filter((unit) => unit.outcome === 'merged'
    && unit.tickets.length === tickets.length
    && tickets.every((id) => unit.tickets.includes(id)));
  if (matching.length === 1) return;
  refuseChain(
    field,
    `\`${field}\` merged ${tickets.join(', ')} as one unit, and \`taken\` has`
      + ` ${String(matching.length)} merged entries with exactly those tickets`,
    'give each journal entry exactly one `taken` entry, marked `merged`, with the same tickets',
  );
}

/**
 * The entries of `taken`, each against itself and against the merge journal.
 *
 * Measured on 2026-09-02: the shape said "array" and nothing else, so a journal
 * entry split across two taken entries halved the per-unit measurement, an entry
 * with no ticket counted as a unit, one ticket in two entries made the chain stop
 * on a merged ticket as waiting, and a fourth outcome removed a ticket from the
 * pool without ever being named. The cross-check in `chain-step` compares sets of
 * tickets, never entries; this is the reading it cannot do.
 */
function refineChain(payload: unknown): void {
  const taken = at(payload, 'taken');
  const merged = at(payload, 'merged');
  if (!Array.isArray(taken) || !Array.isArray(merged)) return;
  const units = takenUnits(taken);
  merged.forEach((entry, index) => {
    const field = `merged[${String(index)}]`;
    refuseUnlessOneUnitMerged(units, ticketsOf(entry, field), field);
  });
}

/**
 * The lease marker's exact wire form, delimiters included.
 *
 * The marker is the one payload a run cannot obtain from a scaffold: its
 * delimiters live in `linear-marker.ts` and appeared in no output, so driving a
 * run meant opening that file -- which is the whole thing this slice removes.
 * Placeholders rather than a rendered marker, because rendering requires values
 * only the caller has, and a template with obviously-fake values fails loudly
 * when someone forgets to fill one.
 */
export function markerTemplate(): string {
  const payload = {
    schemaVersion: 1,
    programId: '<the `program` slug from .void/program.md>',
    runId: '<your run id, e.g. run-2026-01-01-example>',
    clusterId: '<your cluster id>',
    baseBranch: '<autopilot.base from .void/program.md>',
    baseSha: '<git rev-parse on that branch, all 40 characters>',
    integrationBranch: '<autopilot/<runId>>',
    expiresAt: '<ISO-8601 instant after which this lease is stale>',
  };
  return `${MARKER_BEGIN}\n${JSON.stringify(payload, null, 2)}\n${MARKER_END}`;
}
