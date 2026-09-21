// tdd-cover: e2e packages/void-machine/test/generic-mission-contract.test.ts
/** Largest history a mission may hold, checked when reduced and when read. */
export const MISSION_EVENT_LIMIT = 32;

/** Pure mission history. A vertical owns the meaning and admission of each value. */
export type MissionEvent<Input, Config, Step extends string, Value, Issue, Usage> =
  | { readonly kind: 'started'; readonly input: Input; readonly config: Config;
    readonly contract: string }
  | { readonly kind: 'dispatched'; readonly step: Step; readonly executionId: string }
  | { readonly kind: 'accepted'; readonly step: Step; readonly value: Value;
    readonly usage: readonly Usage[] }
  | { readonly kind: 'completed'; readonly value: Value; readonly usage: readonly Usage[] }
  | { readonly kind: 'stopped'; readonly step: Step; readonly issue: Issue;
    readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'unconfirmed'; readonly step: Step; readonly issue: Issue;
    readonly cancellation: 'not-requested' | 'requested-unconfirmed';
    readonly usage: readonly Usage[] }
  | { readonly kind: 'cancelled'; readonly step: Step }
  | { readonly kind: 'cancel-requested'; readonly step: Step }
  | { readonly kind: 'abandoned'; readonly step: Step }
  /** The vertical refused the step's outcome; the cost it observed is kept. */
  | { readonly kind: 'rejected'; readonly step: Step; readonly usage: readonly Usage[] }
  /** A result returned after its cancellation was requested: value discarded, cost kept. */
  | { readonly kind: 'discarded'; readonly step: Step; readonly usage: readonly Usage[] };

/** Decodes untrusted records and encodes admitted events; the vertical owns both formats. */
export interface MissionCodec<Recorded, Admitted> {
  readonly decode: (raw: unknown, revision: number) =>
    | { readonly kind: 'decoded'; readonly event: Recorded }
    | { readonly kind: 'incompatible' | 'unreadable' };
  readonly encode: (event: Admitted, revision: number) =>
    | { readonly kind: 'encoded'; readonly record: unknown }
    | { readonly kind: 'invalid' };
}
/** A parsed step value, or the reason the vertical refuses it. */
export type Admission<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: string };
export interface MissionDescription<Input, Config, Step extends string, Value, Issue, Usage> {
  readonly steps: readonly Step[];
  readonly codec: MissionCodec<MissionEvent<Input, Config, Step, unknown, Issue, Usage>,
    MissionEvent<Input, Config, Step, Value, Issue, Usage>>;
  /** Parses an untrusted step value against the recorded request and configuration. */
  readonly admit: (step: Step, raw: unknown, input: Input, config: Config) => Admission<Value>;
}
export type AcceptedValue<Step extends string, Value> = {
  readonly step: Step; readonly value: Value;
};
export type MissionPosition<Step extends string, Value> =
  | { readonly kind: 'dispatch'; readonly step: Step;
    readonly accepted: readonly AcceptedValue<Step, Value>[] }
  | { readonly kind: 'unknown'; readonly step: Step }
  | { readonly kind: 'cancel-requested'; readonly step: Step }
  | { readonly kind: 'settled' }
  | { readonly kind: 'invalid' };

type State<Step extends string, Value> =
  | { readonly kind: 'dispatch'; readonly index: number;
    readonly accepted: readonly AcceptedValue<Step, Value>[] }
  | { readonly kind: 'in-flight'; readonly index: number;
    readonly accepted: readonly AcceptedValue<Step, Value>[] }
  | { readonly kind: 'unknown' | 'cancel-requested'; readonly step: Step }
  /** A late result was discarded after its cancellation; a second one is refused. */
  | { readonly kind: 'discarded'; readonly step: Step }
  | { readonly kind: 'settled' | 'invalid' };

function transition<Input, Config, Step extends string, Value, Issue, Usage>(
  state: State<Step, Value>,
  event: MissionEvent<Input, Config, Step, Value, Issue, Usage>,
  steps: readonly Step[],
): State<Step, Value> {
  const current = state.kind === 'dispatch' || state.kind === 'in-flight'
    ? steps[state.index] : undefined;
  switch (event.kind) {
    case 'dispatched':
      return state.kind === 'dispatch' && current === event.step
        ? { kind: 'in-flight', index: state.index, accepted: state.accepted }
        : { kind: 'invalid' };
    case 'accepted':
      return state.kind === 'in-flight' && current === event.step
        && state.index < steps.length - 1
        ? { kind: 'dispatch', index: state.index + 1,
          accepted: [...state.accepted, { step: event.step, value: event.value }] }
        : { kind: 'invalid' };
    case 'completed':
      return state.kind === 'in-flight' && state.index === steps.length - 1
        ? { kind: 'settled' } : { kind: 'invalid' };
    case 'stopped':
    case 'rejected':
      return state.kind === 'in-flight' && current === event.step
        ? { kind: 'settled' } : { kind: 'invalid' };
    case 'unconfirmed':
      return state.kind === 'in-flight' && current === event.step
        ? { kind: 'unknown', step: event.step } : { kind: 'invalid' };
    case 'cancelled':
      return state.kind === 'dispatch' && current === event.step
        ? { kind: 'settled' } : { kind: 'invalid' };
    case 'cancel-requested':
      return ((state.kind === 'in-flight' && current === event.step)
        || (state.kind === 'unknown' && state.step === event.step))
        ? { kind: 'cancel-requested', step: event.step } : { kind: 'invalid' };
    case 'discarded':
      return state.kind === 'cancel-requested' && state.step === event.step
        ? { kind: 'discarded', step: event.step } : { kind: 'invalid' };
    case 'abandoned':
      return ((state.kind === 'in-flight' && current === event.step)
        || ((state.kind === 'unknown' || state.kind === 'cancel-requested'
          || state.kind === 'discarded') && state.step === event.step))
        ? { kind: 'settled' } : { kind: 'invalid' };
    case 'started':
      return { kind: 'invalid' };
    default: {
      const impossible: never = event;
      return impossible;
    }
  }
}

/** A dispatch intent without a recorded outcome is never replayed. */
export function missionPosition<Input, Config, Step extends string, Value, Issue, Usage>(
  events: readonly MissionEvent<Input, Config, Step, Value, Issue, Usage>[],
  steps: readonly Step[],
): MissionPosition<Step, Value> {
  if (steps.length < 1 || steps.length > 8 || new Set(steps).size !== steps.length
    || events.length > MISSION_EVENT_LIMIT) return { kind: 'invalid' };
  if (events[0]?.kind !== 'started') return { kind: 'invalid' };
  let state: State<Step, Value> = { kind: 'dispatch', index: 0, accepted: [] };
  for (const event of events.slice(1)) state = transition(state, event, steps);
  if (state.kind === 'in-flight') {
    const step = steps[state.index];
    return step === undefined ? { kind: 'invalid' } : { kind: 'unknown', step };
  }
  if (state.kind === 'dispatch') {
    const step = steps[state.index];
    return step === undefined ? { kind: 'invalid' }
      : { kind: 'dispatch', step, accepted: state.accepted };
  }
  if (state.kind === 'discarded') return { kind: 'cancel-requested', step: state.step };
  return state;
}
