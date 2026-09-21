// tdd-cover: e2e packages/void-machine/test/generic-mission-contract.test.ts
import { MISSION_EVENT_LIMIT, missionPosition, type AcceptedValue, type Admission,
  type MissionDescription, type MissionEvent, type MissionPosition } from '../core/mission.js';
export type { Admission, MissionDescription, MissionCodec } from '../core/mission.js';
import type { MissionJournal } from './journal.js';

export interface MissionStore {
  readonly journal: MissionJournal;
  readonly missionId: string;
}
/** What one step produced. An accepted value is untrusted until its vertical admits it. */
export type StepOutcome<Issue, Usage> =
  | { readonly kind: 'accepted'; readonly value: unknown; readonly usage: readonly Usage[] }
  /** The vertical refused the step locally, before launching anything. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'stopped' | 'unconfirmed'; readonly issue: Issue;
    readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] };
export interface MissionRunner<Input, Config, Step extends string, Value, Issue, Usage> {
  readonly contract: string;
  readonly executionId: () => string;
  readonly execute: (step: Step, input: Input, config: Config,
    accepted: readonly AcceptedValue<Step, Value>[], executionId: string)
    => Promise<StepOutcome<Issue, Usage>>;
}
export type BlockedReason = 'missing' | 'conflict' | 'storage' | 'unrecordable' | 'unreadable'
  | 'incompatible' | 'context-changed' | 'inadmissible' | 'outcome-unknown' | 'not-abandonable';
export type MissionReceipt<Step extends string, Value, Issue, Usage> =
  | { readonly kind: 'completed'; readonly missionId: string; readonly value: Value;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'paused'; readonly missionId: string; readonly step: Step;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'stopped'; readonly missionId: string; readonly step: Step;
    readonly issue: Issue; readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly step: Step;
    readonly stop: 'confirmed'; readonly usage: readonly Usage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly step: Step;
    readonly stop: 'requested-unconfirmed'; readonly effect: 'unknown';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'abandoned'; readonly missionId: string; readonly step: Step;
    readonly effect: 'unknown'; readonly usage: readonly Usage[] }
  | { readonly kind: 'rejected'; readonly missionId: string; readonly step: Step;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'blocked'; readonly missionId: string; readonly reason: BlockedReason;
    readonly diagnostic: string };

type Event<Input, Config, Step extends string, Value, Issue, Usage> =
  MissionEvent<Input, Config, Step, Value, Issue, Usage>;
type Recorded<Input, Config, Step extends string, Issue, Usage> =
  MissionEvent<Input, Config, Step, unknown, Issue, Usage>;
type Blocked = Extract<MissionReceipt<string, never, never, never>, { kind: 'blocked' }>;
type Loaded<EventType> =
  | { readonly kind: 'loaded'; readonly events: readonly EventType[] }
  | Blocked;
type Written<EventType> =
  | { readonly kind: 'written'; readonly events: readonly EventType[] }
  | Blocked;

function blocked(missionId: string, reason: BlockedReason, diagnostic: string): Blocked {
  return { kind: 'blocked', missionId, reason, diagnostic };
}

function unknownOutcome(missionId: string): Blocked {
  return blocked(missionId, 'outcome-unknown',
    'A dispatched step has no accepted outcome; its result and cost are unknown '
    + 'and it is not launched again');
}

function admission<Input, Config, Step extends string, Value, Issue, Usage>(
  description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  step: Step, raw: unknown, input: Input, config: Config,
): Admission<Value> {
  try { return description.admit(step, raw, input, config); }
  catch { return { ok: false, reason: 'the vertical admission failed' }; }
}

/** Parses every recorded value against the recorded request before anything uses it. */
function admitHistory<Input, Config, Step extends string, Value, Issue, Usage>(
  missionId: string, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  recorded: readonly Recorded<Input, Config, Step, Issue, Usage>[],
): Loaded<Event<Input, Config, Step, Value, Issue, Usage>> {
  const started = recorded[0];
  if (started?.kind !== 'started') {
    return blocked(missionId, 'unreadable', 'mission records are out of order');
  }
  const events: Event<Input, Config, Step, Value, Issue, Usage>[] = [];
  for (const event of recorded) {
    if (event.kind !== 'accepted' && event.kind !== 'completed') {
      events.push(event);
      continue;
    }
    const step = event.kind === 'accepted' ? event.step : description.steps.at(-1);
    const admitted = step === undefined ? { ok: false as const, reason: 'no final step' }
      : admission(description, step, event.value, started.input, started.config);
    if (!admitted.ok) {
      return blocked(missionId, 'inadmissible',
        `A recorded step result is not admissible for the recorded request: ${admitted.reason}`);
    }
    events.push({ ...event, value: admitted.value });
  }
  return { kind: 'loaded', events };
}

async function readMission<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
): Promise<Loaded<Event<Input, Config, Step, Value, Issue, Usage>>> {
  let result: Awaited<ReturnType<MissionJournal['read']>>;
  try { result = await store.journal.read(store.missionId); }
  catch { return blocked(store.missionId, 'storage', 'Mission journal read failed'); }
  if (result.kind === 'missing') {
    return blocked(store.missionId, 'missing', 'No mission is recorded under this identifier');
  }
  if (result.kind === 'unreadable') return blocked(store.missionId, 'unreadable', result.reason);
  if (result.records.length > MISSION_EVENT_LIMIT) {
    return blocked(store.missionId, 'unreadable', 'Mission exceeds its record bound');
  }
  const recorded: Recorded<Input, Config, Step, Issue, Usage>[] = [];
  for (const [index, raw] of result.records.entries()) {
    let decoded: ReturnType<typeof description.codec.decode>;
    try { decoded = description.codec.decode(raw, index + 1); }
    catch { return blocked(store.missionId, 'unreadable', 'Mission record decoder failed'); }
    if (decoded.kind !== 'decoded') {
      const reason = decoded.kind === 'incompatible' ? 'incompatible' : 'unreadable';
      return blocked(store.missionId, reason,
        `revision ${String(index + 1)}: record does not match its declared format`);
    }
    recorded.push(decoded.event);
  }
  return admitHistory(store.missionId, description, recorded);
}

async function writeMission<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  events: readonly Event<Input, Config, Step, Value, Issue, Usage>[],
  event: Event<Input, Config, Step, Value, Issue, Usage>,
): Promise<Written<Event<Input, Config, Step, Value, Issue, Usage>>> {
  const revision = events.length + 1;
  let encoded: ReturnType<typeof description.codec.encode>;
  try { encoded = description.codec.encode(event, revision); }
  catch {
    return blocked(store.missionId, 'unrecordable', 'Mission record encoder failed');
  }
  if (encoded.kind === 'invalid') {
    return blocked(store.missionId, 'unrecordable',
      `Revision ${String(revision)} does not match the mission format; nothing was written`);
  }
  let result: Awaited<ReturnType<MissionJournal['append']>>;
  try { result = await store.journal.append(store.missionId, events.length, encoded.record); }
  catch { return blocked(store.missionId, 'storage', 'Mission journal append failed'); }
  switch (result.kind) {
    case 'appended': return { kind: 'written', events: [...events, event] };
    case 'conflict':
      return blocked(store.missionId, 'conflict',
        `Another writer recorded revision ${String(revision)} first; `
        + 'no further step will be launched by this process');
    case 'unconfirmed':
      return blocked(store.missionId, 'storage',
        `Revision ${String(revision)} was linked but its durability is unconfirmed `
        + `(${result.reason}); no further step will be launched by this process`);
    case 'failed':
      return blocked(store.missionId, 'storage',
        `Revision ${String(revision)} was not recorded (${result.reason}); `
        + 'no further step will be launched by this process');
    default: { const neverResult: never = result; return neverResult; }
  }
}

function usageOf<Input, Config, Step extends string, Value, Issue, Usage>(
  events: readonly Event<Input, Config, Step, Value, Issue, Usage>[],
): Usage[] {
  return events.flatMap((event) => 'usage' in event ? [...event.usage] : []);
}

function settle<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, events: readonly Event<Input, Config, Step, Value, Issue, Usage>[],
): MissionReceipt<Step, Value, Issue, Usage> {
  const first = events[0];
  const last = events.at(-1);
  if (first?.kind !== 'started' || last === undefined) {
    return blocked(store.missionId, 'unreadable', 'mission records are out of order');
  }
  const usage = usageOf(events);
  switch (last.kind) {
    case 'completed':
      return { kind: 'completed', missionId: store.missionId, value: last.value, usage };
    case 'unconfirmed': return unknownOutcome(store.missionId);
    case 'stopped':
      return { kind: 'stopped', missionId: store.missionId, step: last.step,
        issue: last.issue, cancellation: last.cancellation, usage };
    case 'cancelled':
      return { kind: 'cancelled', missionId: store.missionId, step: last.step,
        stop: 'confirmed', usage };
    case 'cancel-requested':
    case 'discarded':
      return { kind: 'cancelled', missionId: store.missionId, step: last.step,
        stop: 'requested-unconfirmed', effect: 'unknown', usage };
    case 'abandoned':
      return { kind: 'abandoned', missionId: store.missionId, step: last.step,
        effect: 'unknown', usage };
    case 'rejected':
      return { kind: 'rejected', missionId: store.missionId, step: last.step, usage };
    case 'started':
    case 'dispatched':
    case 'accepted':
      return blocked(store.missionId, 'unreadable', 'mission records are out of order');
    default: { const neverEvent: never = last; return neverEvent; }
  }
}

async function afterConflict<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  conflict: Blocked,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  const current = await readMission(store, description);
  const last = current.kind === 'loaded' ? current.events.at(-1) : undefined;
  return current.kind === 'loaded' && last !== undefined
    && (last.kind === 'cancelled' || last.kind === 'cancel-requested'
      || last.kind === 'discarded' || last.kind === 'abandoned')
    ? settle(store, current.events) : conflict;
}

/** The event recording what one step produced; a refusal by its vertical is rejected. */
function outcomeEvent<Input, Config, Step extends string, Value, Issue, Usage>(
  description: MissionDescription<Input, Config, Step, Value, Issue, Usage>, step: Step,
  outcome: StepOutcome<Issue, Usage>,
  started: Extract<Event<Input, Config, Step, Value, Issue, Usage>, { kind: 'started' }>,
): Event<Input, Config, Step, Value, Issue, Usage> {
  switch (outcome.kind) {
    case 'accepted': {
      const { usage } = outcome;
      const admitted = admission(description, step, outcome.value,
        started.input, started.config);
      if (!admitted.ok) return { kind: 'rejected', step, usage };
      return step === description.steps.at(-1)
        ? { kind: 'completed', value: admitted.value, usage }
        : { kind: 'accepted', step, value: admitted.value, usage };
    }
    case 'refused': return { kind: 'rejected', step, usage: [] };
    case 'unconfirmed':
    case 'stopped':
      return { kind: outcome.kind, step, issue: outcome.issue,
        cancellation: outcome.cancellation, usage: outcome.usage };
    default: { const neverOutcome: never = outcome; return neverOutcome; }
  }
}

/**
 * A step whose revision was taken by a cancellation request records only the cost it
 * observed: its value is discarded, and no later step starts from it.
 */
async function keepLateCost<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  step: Step, usage: readonly Usage[], conflict: Blocked,
): Promise<Written<Event<Input, Config, Step, Value, Issue, Usage>>> {
  const current = await readMission(store, description);
  if (current.kind === 'blocked') return conflict;
  const last = current.events.at(-1);
  if (last?.kind !== 'cancel-requested' || last.step !== step) return conflict;
  const written = await writeMission(store, description, current.events,
    { kind: 'discarded', step, usage });
  return written.kind === 'blocked' ? conflict : written;
}

async function dispatch<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  runner: MissionRunner<Input, Config, Step, Value, Issue, Usage>,
  events: readonly Event<Input, Config, Step, Value, Issue, Usage>[],
  next: Extract<MissionPosition<Step, Value>, { kind: 'dispatch' }>,
  started: Extract<Event<Input, Config, Step, Value, Issue, Usage>, { kind: 'started' }>,
): Promise<Written<Event<Input, Config, Step, Value, Issue, Usage>>> {
  let executionId: string;
  try { executionId = runner.executionId(); }
  catch {
    return blocked(store.missionId, 'unrecordable',
      'Execution identity generation failed; no step was launched');
  }
  const intent = await writeMission(store, description, events,
    { kind: 'dispatched', step: next.step, executionId });
  if (intent.kind === 'blocked') return intent;
  let outcome: StepOutcome<Issue, Usage>;
  try {
    outcome = await runner.execute(next.step, started.input, started.config,
      next.accepted, executionId);
  } catch {
    return unknownOutcome(store.missionId);
  }
  const event = outcomeEvent(description, next.step, outcome, started);
  const written = await writeMission(store, description, intent.events, event);
  return written.kind === 'blocked' && written.reason === 'conflict' && 'usage' in event
    ? keepLateCost(store, description, next.step, event.usage, written) : written;
}

async function advance<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  runner: MissionRunner<Input, Config, Step, Value, Issue, Usage>,
  initial: readonly Event<Input, Config, Step, Value, Issue, Usage>[], stopAfter?: Step,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  let events = initial;
  for (let turn = 0; turn <= description.steps.length; turn += 1) {
    const next = missionPosition(events, description.steps);
    const started = events[0];
    if (next.kind === 'invalid' || started?.kind !== 'started') {
      return blocked(store.missionId, 'unreadable', 'mission records are out of order');
    }
    if (next.kind === 'unknown') return unknownOutcome(store.missionId);
    if (next.kind === 'settled' || next.kind === 'cancel-requested') {
      return settle(store, events);
    }
    if (started.contract !== runner.contract) {
      return blocked(store.missionId, 'context-changed',
        'The recorded execution contract differs from the current one; nothing was launched');
    }
    const written = await dispatch(store, description, runner, events, next, started);
    if (written.kind === 'blocked') {
      return written.reason === 'conflict'
        ? afterConflict(store, description, written) : written;
    }
    events = written.events;
    if (events.at(-1)?.kind !== 'accepted') return settle(store, events);
    if (stopAfter === next.step) {
      return { kind: 'paused', missionId: store.missionId, step: next.step,
        usage: usageOf(events) };
    }
  }
  return blocked(store.missionId, 'unreadable', 'mission exceeded its step bound');
}

export async function startMission<Input, Config, Step extends string, Value, Issue, Usage>(
  input: Input, config: Config, store: MissionStore,
  description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  runner: MissionRunner<Input, Config, Step, Value, Issue, Usage>, stopAfter?: Step,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  const started: Event<Input, Config, Step, Value, Issue, Usage> = {
    kind: 'started', input, config, contract: runner.contract,
  };
  if (missionPosition([started], description.steps).kind === 'invalid') {
    return blocked(store.missionId, 'unrecordable', 'Mission step list is invalid');
  }
  const written = await writeMission(store, description, [], started);
  return written.kind === 'blocked' ? written
    : advance(store, description, runner, written.events, stopAfter);
}

export async function resumeMission<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  runner: MissionRunner<Input, Config, Step, Value, Issue, Usage>,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  const loaded = await readMission(store, description);
  return loaded.kind === 'blocked' ? loaded
    : advance(store, description, runner, loaded.events);
}

type DecisionMode = 'cancel' | 'abandon';
async function decide<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  mode: DecisionMode,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const loaded = await readMission(store, description);
    if (loaded.kind === 'blocked') return loaded;
    const at = missionPosition(loaded.events, description.steps);
    if (at.kind === 'invalid') {
      return blocked(store.missionId, 'unreadable', 'mission records are out of order');
    }
    if (at.kind === 'settled' || (mode === 'cancel' && at.kind === 'cancel-requested')) {
      return settle(store, loaded.events);
    }
    if (mode === 'abandon' && at.kind === 'dispatch') {
      return blocked(store.missionId, 'not-abandonable',
        'No step is in flight or unknown; cancel the mission instead, nothing was written');
    }
    const event: Event<Input, Config, Step, Value, Issue, Usage> = mode === 'abandon'
      ? { kind: 'abandoned', step: at.step }
      : at.kind === 'dispatch' ? { kind: 'cancelled', step: at.step }
        : { kind: 'cancel-requested', step: at.step };
    const written = await writeMission(store, description, loaded.events, event);
    if (written.kind === 'blocked' && written.reason === 'conflict' && attempt === 0) continue;
    return written.kind === 'blocked' ? written : settle(store, written.events);
  }
  return blocked(store.missionId, 'conflict', 'A second writer changed the mission twice');
}

export function cancelMission<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  return decide(store, description, 'cancel');
}

export function abandonMission<Input, Config, Step extends string, Value, Issue, Usage>(
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
): Promise<MissionReceipt<Step, Value, Issue, Usage>> {
  return decide(store, description, 'abandon');
}
