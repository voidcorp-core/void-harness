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

export type AutopilotInputStep = 'plan' | 'start' | 'status' | 'chain';

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
        from: 'the paths each ticket names as its anchors; `confidence` is yours to state',
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
        name: 'elapsedMs',
        type: 'number',
        from: 'now minus the run start; the budget is spent in wall clock, not in units',
        example: 0,
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
