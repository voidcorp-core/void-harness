import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { expect, it, onTestFinished } from 'vitest';
import { createFileJournal } from '../src/adapters/store/file-journal.js';
import {
  MISSION_EVENT_LIMIT, missionPosition, type AcceptedValue, type MissionEvent,
} from '../src/core/mission.js';
import {
  type MissionDescription, type MissionRunner, type MissionStore,
  abandonMission, cancelMission, resumeMission, startMission,
} from '../src/runtime/mission.js';

const steps = ['draft', 'audit', 'publish'] as const;
type Step = typeof steps[number];
const inputSchema = z.strictObject({ request: z.string().min(1) });
const configSchema = z.strictObject({ minimumScore: z.number().int().min(1).max(10) });
const valueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('draft'), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('audit'), score: z.number().int().min(0).max(10) }),
  z.strictObject({ kind: z.literal('publish'), receipt: z.string().min(1) }),
]);
const usageSchema = z.strictObject({ units: z.number().int().nonnegative() });
type Input = z.infer<typeof inputSchema>;
type Config = z.infer<typeof configSchema>;
type Value = z.infer<typeof valueSchema>;
type Usage = z.infer<typeof usageSchema>;
type Event = MissionEvent<Input, Config, Step, Value, string, Usage>;
const eventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('started'), input: inputSchema,
    config: configSchema, contract: z.string() }),
  z.strictObject({ kind: z.literal('dispatched'), step: z.enum(steps),
    executionId: z.string() }),
  z.strictObject({ kind: z.literal('accepted'), step: z.enum(steps),
    value: valueSchema, usage: z.array(usageSchema) }),
  z.strictObject({ kind: z.literal('completed'), value: valueSchema,
    usage: z.array(usageSchema) }),
  z.strictObject({ kind: z.literal('stopped'), step: z.enum(steps),
    issue: z.string(), cancellation: z.enum(['not-requested', 'requested-unconfirmed']),
    usage: z.array(usageSchema) }),
  z.strictObject({ kind: z.literal('unconfirmed'), step: z.enum(steps),
    issue: z.string(), cancellation: z.literal('requested-unconfirmed'),
    usage: z.array(usageSchema) }),
  z.strictObject({ kind: z.literal('cancelled'), step: z.enum(steps) }),
  z.strictObject({ kind: z.literal('cancel-requested'), step: z.enum(steps) }),
  z.strictObject({ kind: z.literal('abandoned'), step: z.enum(steps) }),
  z.strictObject({ kind: z.literal('rejected'), step: z.enum(steps),
    usage: z.array(usageSchema) }),
  z.strictObject({ kind: z.literal('discarded'), step: z.enum(steps),
    usage: z.array(usageSchema) }),
]);
const recordSchema = z.strictObject({
  format: z.literal('test.three-step/1'), revision: z.number().int().min(1).max(16),
  event: eventSchema,
});

const description: MissionDescription<Input, Config, Step, Value, string, Usage> = {
  steps,
  codec: {
    decode(raw, revision) {
      if (typeof raw === 'object' && raw !== null && 'format' in raw
        && raw.format !== 'test.three-step/1') return { kind: 'incompatible' };
      const parsed = recordSchema.safeParse(raw);
      return parsed.success && parsed.data.revision === revision
        ? { kind: 'decoded', event: parsed.data.event }
        : { kind: 'unreadable' };
    },
    encode(event: Event, revision) {
      const candidate = { format: 'test.three-step/1', revision, event };
      return recordSchema.safeParse(candidate).success
        ? { kind: 'encoded', record: candidate } : { kind: 'invalid' };
    },
  },
  admit(step, raw, input, config) {
    const parsed = valueSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'value does not match its schema' };
    const value = parsed.data;
    switch (step) {
      case 'draft': {
        // A parser may normalize: the admitted text, not the raw one, is recorded and reused.
        const text = value.kind === 'draft' ? value.text.trim() : '';
        return text.includes(input.request) ? { ok: true, value: { kind: 'draft', text } }
          : { ok: false, reason: 'draft does not cover the request' };
      }
      case 'audit': return value.kind === 'audit' && value.score >= config.minimumScore
        ? { ok: true, value } : { ok: false, reason: 'audit score is below the minimum' };
      case 'publish': return value.kind === 'publish' && value.receipt.startsWith('sent:')
        ? { ok: true, value } : { ok: false, reason: 'publish receipt is not a sent receipt' };
      default: { const neverStep: never = step; return neverStep; }
    }
  },
};

type Run = MissionRunner<Input, Config, Step, Value, string, Usage>;
type Outcome = Awaited<ReturnType<Run['execute']>>;
function accepted(step: Step, input: Input, config: Config): Outcome {
  switch (step) {
    case 'draft': return { kind: 'accepted', value: { kind: 'draft', text: input.request },
      usage: [{ units: 1 }] };
    case 'audit': return { kind: 'accepted', value: { kind: 'audit', score: config.minimumScore },
      usage: [{ units: 2 }] };
    case 'publish': return { kind: 'accepted', value: { kind: 'publish', receipt: 'sent:ok' },
      usage: [{ units: 3 }] };
    default: { const neverStep: never = step; return neverStep; }
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'machine-generic-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const journal = createFileJournal({ root });
  const store: MissionStore = { journal, missionId: 'three-step' };
  const calls: Step[] = [];
  const seen: (readonly AcceptedValue<Step, Value>[])[] = [];
  let nextId = 0;
  const runner = (override?: (step: Step) => Promise<Outcome>): Run => ({
    contract: 'test-contract/1',
    executionId: () => `execution-${++nextId}`,
    execute: async (step, input, config, admitted) => {
      calls.push(step);
      seen.push(admitted);
      return override === undefined ? accepted(step, input, config) : override(step);
    },
  });
  return { store, calls, seen, runner, journal, root };
}

function signal() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((accept) => { resolve = accept; });
  if (resolve === undefined) throw new Error('Signal resolver was not initialized');
  return { promise, resolve };
}

it('rejects ambiguous duplicate step names before starting', () => {
  const history: Event[] = [{ kind: 'started', input: { request: 'report' },
    config: { minimumScore: 3 }, contract: 'test-contract/1' }];
  expect(missionPosition(history, ['draft', 'draft'])).toEqual({ kind: 'invalid' });
});

it('bounds recorded and read histories by one kernel event limit', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  const read = await f.journal.read(f.store.missionId);
  if (read.kind !== 'records') throw new Error('Expected recorded mission');
  const oversized = Array.from({ length: MISSION_EVENT_LIMIT + 1 }, () => read.records[0]);
  const journal = { ...f.journal, read: async () => ({ kind: 'records' as const,
    records: oversized }) };
  expect(await resumeMission({ journal, missionId: 'three-step' }, description, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'unreadable' });
  const started: Event = { kind: 'started', input: { request: 'report' },
    config: { minimumScore: 3 }, contract: 'test-contract/1' };
  const history = [started, ...Array.from({ length: MISSION_EVENT_LIMIT },
    (): Event => ({ kind: 'dispatched', step: 'draft', executionId: 'x' }))];
  expect(missionPosition(history, steps)).toEqual({ kind: 'invalid' });
  expect(f.calls).toEqual(['draft']);
});

it('starts three different steps and resumes in a new context', async () => {
  const f = fixture();
  const paused = await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  expect(paused).toMatchObject({ kind: 'paused', step: 'draft' });
  const resumedStore: MissionStore = { journal: f.journal, missionId: 'three-step' };
  const finished = await resumeMission(resumedStore, description, f.runner());
  expect(finished).toMatchObject({ kind: 'completed', value: { receipt: 'sent:ok' } });
  expect(f.calls).toEqual(['draft', 'audit', 'publish']);
  expect(await resumeMission(resumedStore, description, f.runner())).toEqual(finished);
});

it('keeps an unconfirmed outcome unknown until explicit abandonment', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  const uncertain = f.runner(async (step) => step === 'audit'
    ? { kind: 'unconfirmed', issue: 'deadline', cancellation: 'requested-unconfirmed', usage: [] }
    : accepted(step, { request: 'report' }, { minimumScore: 3 }));
  expect(await resumeMission(f.store, description, uncertain))
    .toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
  expect(await resumeMission(f.store, description, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
  expect(await abandonMission(f.store, description))
    .toMatchObject({ kind: 'abandoned', step: 'audit', effect: 'unknown' });
  expect(f.calls).toEqual(['draft', 'audit']);
});

it('passes admitted values, not raw results, to later steps and the journal', async () => {
  const f = fixture();
  const input = { request: 'report' };
  const config = { minimumScore: 3 };
  const runner = f.runner(async (step) => step === 'draft'
    ? { kind: 'accepted', value: { kind: 'draft', text: '  report  ' }, usage: [] }
    : accepted(step, input, config));
  expect(await startMission(input, config, f.store, description, runner))
    .toMatchObject({ kind: 'completed' });
  expect(f.seen[1]).toEqual([{ step: 'draft', value: { kind: 'draft', text: 'report' } }]);
  expect(await f.journal.read(f.store.missionId)).toMatchObject({ kind: 'records',
    records: { 2: { event: { kind: 'accepted', value: { text: 'report' } } } } });
});

it('journals a local refusal as rejected, and a later resume is not blocked', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  const refusing = f.runner(async (step) => step === 'audit'
    ? { kind: 'refused', usage: [] }
    : accepted(step, { request: 'report' }, { minimumScore: 3 }));
  const refused = await resumeMission(f.store, description, refusing);
  expect(refused).toEqual({ kind: 'rejected', missionId: 'three-step', step: 'audit',
    usage: [{ units: 1 }] });
  expect(await resumeMission(f.store, description, f.runner())).toEqual(refused);
  expect(f.calls).toEqual(['draft', 'audit']);
});

it('records a live result refused by the vertical as rejected, with its cost', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 4 },
    f.store, description, f.runner(), 'draft');
  const runner = f.runner(async (step) => step === 'audit'
    ? { kind: 'accepted', value: { kind: 'audit', score: 3 }, usage: [{ units: 7 }] }
    : accepted(step, { request: 'report' }, { minimumScore: 4 }));
  const rejected = await resumeMission(f.store, description, runner);
  expect(rejected).toEqual({ kind: 'rejected', missionId: 'three-step', step: 'audit',
    usage: [{ units: 1 }, { units: 7 }] });
  expect(await f.journal.read(f.store.missionId)).toMatchObject({ kind: 'records',
    records: { 4: { event: { kind: 'rejected', step: 'audit' } } } });
  expect(await resumeMission(f.store, description, f.runner())).toEqual(rejected);
  expect(await abandonMission(f.store, description)).toEqual(rejected);
  expect(f.calls).toEqual(['draft', 'audit']);
});

it('re-admits an accepted result before delivering a completed mission', async () => {
  const f = fixture();
  expect(await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner())).toMatchObject({ kind: 'completed' });
  const path = join(f.root, 'three-step', '000003.json');
  const record = recordSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (record.event.kind !== 'accepted') throw new Error('Expected an accepted result');
  writeFileSync(path, JSON.stringify({ ...record,
    event: { ...record.event, value: { kind: 'draft', text: 'unrelated' } },
  }));
  expect(await resumeMission(f.store, description, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'inadmissible' });
  expect(f.calls).toEqual(['draft', 'audit', 'publish']);
});

it('contains codec and admission failures before launching a resumed step', async () => {
  const f = fixture();
  const input = { request: 'report' };
  const config = { minimumScore: 3 };
  const brokenWrite: typeof description = { ...description, codec: {
    ...description.codec, encode: () => { throw new Error('codec write failed'); },
  } };
  expect(await startMission(input, config, f.store, brokenWrite, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'unrecordable' });
  expect(await f.journal.read(f.store.missionId)).toMatchObject({ kind: 'missing' });

  await startMission(input, config, f.store, description, f.runner(), 'draft');
  const brokenRead: typeof description = { ...description, codec: {
    ...description.codec, decode: () => { throw new Error('codec read failed'); },
  } };
  expect(await resumeMission(f.store, brokenRead, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'unreadable' });
  const brokenAdmission: typeof description = { ...description,
    admit: () => { throw new Error('admission failed'); } };
  expect(await resumeMission(f.store, brokenAdmission, f.runner()))
    .toMatchObject({ kind: 'blocked', reason: 'inadmissible' });
  expect(f.calls).toEqual(['draft']);
});

it('keeps a recorded start resumable when execution identity generation fails', async () => {
  const f = fixture();
  const runner: Run = { ...f.runner(),
    executionId: () => { throw new Error('identity failed'); } };
  expect(await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, runner))
    .toMatchObject({ kind: 'blocked', reason: 'unrecordable' });
  expect(await f.journal.read(f.store.missionId))
    .toMatchObject({ kind: 'records', records: [{ event: { kind: 'started' } }] });
  expect(await resumeMission(f.store, description, f.runner()))
    .toMatchObject({ kind: 'completed' });
  expect(f.calls).toEqual(['draft', 'audit', 'publish']);
});

it('keeps the cost of a late result after an unconfirmed cancellation, never its value', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  const entered = signal();
  const release = signal();
  const live = resumeMission(f.store, description, f.runner(async (step) => {
    if (step === 'audit') { entered.resolve(); await release.promise; }
    return accepted(step, { request: 'report' }, { minimumScore: 3 });
  }));
  await entered.promise;
  expect(await cancelMission(f.store, description)).toEqual({ kind: 'cancelled',
    missionId: 'three-step', step: 'audit', stop: 'requested-unconfirmed', effect: 'unknown',
    usage: [{ units: 1 }] });
  release.resolve();
  const late = { kind: 'cancelled', missionId: 'three-step', step: 'audit',
    stop: 'requested-unconfirmed', effect: 'unknown', usage: [{ units: 1 }, { units: 2 }] };
  expect(await live).toEqual(late);
  expect(await f.journal.read(f.store.missionId)).toMatchObject({ kind: 'records',
    records: { 5: { event: { kind: 'discarded', step: 'audit', usage: [{ units: 2 }] } } } });
  expect(await resumeMission(f.store, description, f.runner())).toEqual(late);
  expect(await abandonMission(f.store, description)).toEqual({ kind: 'abandoned',
    missionId: 'three-step', step: 'audit', effect: 'unknown',
    usage: [{ units: 1 }, { units: 2 }] });
  expect(f.calls).toEqual(['draft', 'audit']);
});

it('refuses a second discarded result for the same step', () => {
  const started: Event = { kind: 'started', input: { request: 'report' },
    config: { minimumScore: 3 }, contract: 'test-contract/1' };
  const once: Event[] = [started, { kind: 'dispatched', step: 'draft', executionId: 'x' },
    { kind: 'cancel-requested', step: 'draft' }, { kind: 'discarded', step: 'draft', usage: [] }];
  expect(missionPosition(once, steps)).not.toEqual({ kind: 'invalid' });
  expect(missionPosition([...once, { kind: 'discarded', step: 'draft', usage: [] }], steps))
    .toEqual({ kind: 'invalid' });
});

it('fences two concurrent resumptions to one execution', async () => {
  const f = fixture();
  await startMission({ request: 'report' }, { minimumScore: 3 },
    f.store, description, f.runner(), 'draft');
  const entered = signal();
  const release = signal();
  const execute = async (step: Step): Promise<Outcome> => {
    if (step === 'audit') { entered.resolve(); await release.promise; }
    return accepted(step, { request: 'report' }, { minimumScore: 3 });
  };
  let firstSettled = false;
  let secondSettled = false;
  const first = resumeMission(f.store, description, f.runner(execute))
    .then((receipt) => { firstSettled = true; return receipt; });
  const second = resumeMission(f.store, description, f.runner(execute))
    .then((receipt) => { secondSettled = true; return receipt; });
  await entered.promise;
  // The loser settles on its own while the winner is held: await that event, never a poll.
  try {
    await Promise.race([first, second]);
    expect(Number(firstSettled) + Number(secondSettled)).toBe(1);
  } finally { release.resolve(); }
  const outcomes = await Promise.all([first, second]);
  expect(outcomes.filter((outcome) => outcome.kind === 'completed')).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome.kind === 'blocked')).toHaveLength(1);
  expect(f.calls.filter((step) => step === 'audit')).toHaveLength(1);
});
