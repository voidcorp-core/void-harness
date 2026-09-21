// tdd-cover: e2e packages/void-machine/test/generic-mission-contract.test.ts
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
  | { readonly kind: 'abandoned'; readonly step: Step };

export interface MissionCodec<Event> {
  readonly decode: (raw: unknown, revision: number) =>
    | { readonly kind: 'decoded'; readonly event: Event }
    | { readonly kind: 'incompatible' | 'unreadable' };
  readonly encode: (event: Event, revision: number) =>
    | { readonly kind: 'encoded'; readonly record: unknown }
    | { readonly kind: 'invalid' };
}
export interface MissionDescription<Input, Config, Step extends string, Value, Issue, Usage> {
  readonly steps: readonly Step[];
  readonly codec: MissionCodec<MissionEvent<Input, Config, Step, Value, Issue, Usage>>;
  readonly admit: (step: Step, value: Value, input: Input, config: Config) => boolean;
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
    case 'abandoned':
      return ((state.kind === 'in-flight' && current === event.step)
        || ((state.kind === 'unknown' || state.kind === 'cancel-requested')
          && state.step === event.step))
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
    || events.length > 32) return { kind: 'invalid' };
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
  return state;
}
