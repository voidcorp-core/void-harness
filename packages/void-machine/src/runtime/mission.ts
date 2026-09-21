// tdd-cover: e2e packages/void-machine/test/generic-mission-contract.test.ts
import { missionPosition, type AcceptedValue, type MissionDescription,
  type MissionEvent, type MissionPosition } from '../core/mission.js';
export type { MissionDescription, MissionCodec } from '../core/mission.js';
import type { MissionJournal } from './journal.js';

export interface MissionStore {
  readonly journal: MissionJournal;
  readonly missionId: string;
}
export type StepOutcome<Value, Issue, Usage> =
  | { readonly kind: 'accepted'; readonly value: Value; readonly usage: readonly Usage[] }
  | { readonly kind: 'stopped' | 'unconfirmed'; readonly issue: Issue;
    readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] };
export interface MissionRunner<Input, Config, Step extends string, Value, Issue, Usage> {
  readonly contract: string;
  readonly executionId: () => string;
  readonly execute: (step: Step, input: Input, config: Config,
    accepted: readonly AcceptedValue<Step, Value>[], executionId: string)
    => Promise<StepOutcome<Value, Issue, Usage>>;
}
export type BlockedReason = 'missing' | 'conflict' | 'storage' | 'unrecordable' | 'unreadable'
  | 'incompatible' | 'context-changed' | 'inadmissible' | 'outcome-unknown' | 'not-abandonable';
export type MissionReceipt<Step extends string, Value, Issue, Usage> =
  | { readonly kind: 'completed'; readonly missionId: string; readonly value: Value;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'paused'; readonly missionId: string; readonly stage: Step;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'stopped'; readonly missionId: string; readonly stage: Step;
    readonly issue: Issue; readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly stage: Step;
    readonly stop: 'confirmed'; readonly usage: readonly Usage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly stage: Step;
    readonly stop: 'requested-unconfirmed'; readonly effect: 'unknown';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'abandoned'; readonly missionId: string; readonly stage: Step;
    readonly effect: 'unknown'; readonly usage: readonly Usage[] }
  | { readonly kind: 'blocked'; readonly missionId: string; readonly reason: BlockedReason;
    readonly diagnostic: string };

type Event<Input, Config, Step extends string, Value, Issue, Usage> =
  MissionEvent<Input, Config, Step, Value, Issue, Usage>;
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

function admitted<Input, Config, Step extends string, Value, Issue, Usage>(
  description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  step: Step, value: Value, input: Input, config: Config,
): boolean {
  try { return description.admit(step, value, input, config); }
  catch { return false; }
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
  if (result.records.length > 32) {
    return blocked(store.missionId, 'unreadable', 'Mission exceeds its record bound');
  }
  const events: Event<Input, Config, Step, Value, Issue, Usage>[] = [];
  for (const [index, raw] of result.records.entries()) {
    let decoded: ReturnType<typeof description.codec.decode>;
    try { decoded = description.codec.decode(raw, index + 1); }
    catch { return blocked(store.missionId, 'unreadable', 'Mission record decoder failed'); }
    if (decoded.kind !== 'decoded') {
      const reason = decoded.kind === 'incompatible' ? 'incompatible' : 'unreadable';
      return blocked(store.missionId, reason,
        `revision ${String(index + 1)}: record does not match its declared format`);
    }
    events.push(decoded.event);
  }
  const started = events[0];
  if (started?.kind === 'started') {
    for (const event of events) {
      if (event.kind === 'accepted'
        && !admitted(description, event.step, event.value, started.input, started.config)) {
        return blocked(store.missionId, 'inadmissible',
          'A recorded step result is not admissible for the recorded request');
      }
    }
  }
  return { kind: 'loaded', events };
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
  store: MissionStore, description: MissionDescription<Input, Config, Step, Value, Issue, Usage>,
  events: readonly Event<Input, Config, Step, Value, Issue, Usage>[],
): MissionReceipt<Step, Value, Issue, Usage> {
  const first = events[0];
  const last = events.at(-1);
  if (first?.kind !== 'started' || last === undefined) {
    return blocked(store.missionId, 'unreadable', 'mission records are out of order');
  }
  const usage = usageOf(events);
  switch (last.kind) {
    case 'completed': {
      const finalStep = description.steps.at(-1);
      return finalStep !== undefined
        && admitted(description, finalStep, last.value, first.input, first.config)
        ? { kind: 'completed', missionId: store.missionId, value: last.value, usage }
        : blocked(store.missionId, 'inadmissible',
          'The recorded result is not admissible for the recorded request');
    }
    case 'unconfirmed': return unknownOutcome(store.missionId);
    case 'stopped':
      return { kind: 'stopped', missionId: store.missionId, stage: last.stage,
        issue: last.issue, cancellation: last.cancellation, usage };
    case 'cancelled':
      return { kind: 'cancelled', missionId: store.missionId, stage: last.stage,
        stop: 'confirmed', usage };
    case 'cancel-requested':
      return { kind: 'cancelled', missionId: store.missionId, stage: last.step,
        stop: 'requested-unconfirmed', effect: 'unknown', usage };
    case 'abandoned':
      return { kind: 'abandoned', missionId: store.missionId, stage: last.step,
        effect: 'unknown', usage };
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
      || last.kind === 'abandoned')
    ? settle(store, description, current.events) : conflict;
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
  let outcome: StepOutcome<Value, Issue, Usage>;
  try {
    outcome = await runner.execute(next.step, started.input, started.config,
      next.accepted, executionId);
  } catch {
    return unknownOutcome(store.missionId);
  }
  if (outcome.kind === 'accepted'
    && !admitted(description, next.step, outcome.value, started.input, started.config)) {
    return blocked(store.missionId, 'inadmissible',
      'The step result is not admissible for the recorded request');
  }
  const final = next.step === description.steps.at(-1);
  const event: Event<Input, Config, Step, Value, Issue, Usage> = outcome.kind === 'accepted'
    ? final ? { kind: 'completed', value: outcome.value, usage: outcome.usage }
      : { kind: 'accepted', step: next.step, value: outcome.value, usage: outcome.usage }
    : outcome.kind === 'unconfirmed'
      ? { kind: 'unconfirmed', step: next.step, issue: outcome.issue,
        cancellation: outcome.cancellation, usage: outcome.usage }
      : { kind: 'stopped', stage: next.step, issue: outcome.issue,
        cancellation: outcome.cancellation, usage: outcome.usage };
  return writeMission(store, description, intent.events, event);
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
      return settle(store, description, events);
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
    if (events.at(-1)?.kind !== 'accepted') return settle(store, description, events);
    if (stopAfter === next.step) {
      return { kind: 'paused', missionId: store.missionId, stage: next.step,
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
      return settle(store, description, loaded.events);
    }
    if (mode === 'abandon' && at.kind === 'dispatch') {
      return blocked(store.missionId, 'not-abandonable',
        'No step is in flight or unknown; cancel the mission instead, nothing was written');
    }
    const event: Event<Input, Config, Step, Value, Issue, Usage> = mode === 'abandon'
      ? { kind: 'abandoned', step: at.step }
      : at.kind === 'dispatch' ? { kind: 'cancelled', stage: at.step }
        : { kind: 'cancel-requested', step: at.step };
    const written = await writeMission(store, description, loaded.events, event);
    if (written.kind === 'blocked' && written.reason === 'conflict' && attempt === 0) continue;
    return written.kind === 'blocked' ? written : settle(store, description, written.events);
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
