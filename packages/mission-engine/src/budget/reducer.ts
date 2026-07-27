import type { MissionPassId } from '../policy/schema.js';

export const BUDGET_THRESHOLDS = Object.freeze({
  warning: 0.7,
  conserve: 0.9,
  paused: 1,
});

export type BudgetMeasurementSource =
  | 'runtime-reported'
  | 'transcript-derived'
  | 'estimated'
  | 'unknown';
export type BudgetPhase = 'normal' | 'warning' | 'conserve' | 'paused';
export type BudgetTransitionKind =
  | 'budget.warning'
  | 'budget.redundancy-reduced'
  | 'budget.paused';

export type BudgetObservation =
  | {
      readonly eventId: string;
      readonly source: Exclude<BudgetMeasurementSource, 'unknown'>;
      readonly used: number;
      readonly limit: number;
    }
  | {
      readonly eventId: string;
      readonly source: 'unknown';
      readonly used?: never;
      readonly limit?: never;
    };

export interface BudgetTransition {
  readonly kind: BudgetTransitionKind;
  readonly threshold: number;
  readonly utilization: number;
}

export interface BudgetSubject {
  readonly scope: 'mission' | 'specialist';
  readonly id: string;
}

export interface BudgetState {
  readonly schemaVersion: 1;
  readonly phase: BudgetPhase;
  readonly subject: BudgetSubject;
  readonly measurement: BudgetMeasurementSource;
  readonly used: number | null;
  readonly limit: number | null;
  readonly utilization: number | null;
  readonly requiredPasses: readonly MissionPassId[];
  readonly contextPolicy: 'retain' | 'drop-unloaded';
  readonly optionalRedundancy: 'standard' | 'reduced';
  readonly canContinue: boolean;
  readonly observationIds: readonly string[];
}

export interface BudgetReduction {
  readonly state: BudgetState;
  readonly transitions: readonly BudgetTransition[];
}

const PHASE_RANK: Readonly<Record<BudgetPhase, number>> = {
  normal: 0,
  warning: 1,
  conserve: 2,
  paused: 3,
};

function phaseAt(utilization: number): BudgetPhase {
  if (utilization >= BUDGET_THRESHOLDS.paused) return 'paused';
  if (utilization >= BUDGET_THRESHOLDS.conserve) return 'conserve';
  if (utilization >= BUDGET_THRESHOLDS.warning) return 'warning';
  return 'normal';
}

function crossedTransitions(
  previous: BudgetPhase,
  next: BudgetPhase,
  utilization: number,
): readonly BudgetTransition[] {
  const candidates: ReadonlyArray<readonly [BudgetPhase, BudgetTransitionKind, number]> = [
    ['warning', 'budget.warning', BUDGET_THRESHOLDS.warning],
    ['conserve', 'budget.redundancy-reduced', BUDGET_THRESHOLDS.conserve],
    ['paused', 'budget.paused', BUDGET_THRESHOLDS.paused],
  ];
  return Object.freeze(candidates
    .filter(([phase]) =>
      PHASE_RANK[phase] > PHASE_RANK[previous]
      && PHASE_RANK[phase] <= PHASE_RANK[next]
    )
    .map(([, kind, threshold]) => Object.freeze({
      kind,
      threshold,
      utilization,
    })));
}

function validEventId(value: string): boolean {
  return value.length >= 1
    && value.length <= 128
    && [...value].every((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0x20 && point !== 0x7f;
    });
}

export function createBudgetState(
  subject: BudgetSubject,
  requiredPasses: readonly MissionPassId[],
): BudgetState {
  if (!validEventId(subject.id)) {
    throw new Error('BUDGET_INVALID_SUBJECT: id is not bounded');
  }
  return Object.freeze({
    schemaVersion: 1,
    phase: 'normal',
    subject: Object.freeze({ ...subject }),
    measurement: 'unknown',
    used: null,
    limit: null,
    utilization: null,
    requiredPasses: Object.freeze([...new Set(requiredPasses)]),
    contextPolicy: 'retain',
    optionalRedundancy: 'standard',
    canContinue: true,
    observationIds: Object.freeze([]),
  });
}

export function reduceBudget(
  state: BudgetState,
  observation: BudgetObservation,
): BudgetReduction {
  if (!validEventId(observation.eventId)) {
    throw new Error('BUDGET_INVALID_OBSERVATION: eventId is not bounded');
  }
  if (state.observationIds.includes(observation.eventId)) {
    return Object.freeze({ state, transitions: Object.freeze([]) });
  }
  const observationIds = Object.freeze([
    ...state.observationIds,
    observation.eventId,
  ]);
  if (observation.source === 'unknown') {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        observationIds,
      }),
      transitions: Object.freeze([]),
    });
  }
  if (
    !Number.isFinite(observation.used)
    || observation.used < 0
    || !Number.isFinite(observation.limit)
    || observation.limit <= 0
  ) {
    throw new Error('BUDGET_INVALID_OBSERVATION: used and limit must be finite');
  }
  if (state.limit !== null && state.limit !== observation.limit) {
    throw new Error('BUDGET_LIMIT_CHANGED: start a new budget window');
  }
  if (state.used !== null && observation.used < state.used) {
    throw new Error('BUDGET_NON_MONOTONIC: cumulative use cannot decrease');
  }
  const utilization = observation.used / observation.limit;
  const observedPhase = phaseAt(utilization);
  const phase = PHASE_RANK[observedPhase] > PHASE_RANK[state.phase]
    ? observedPhase
    : state.phase;
  const transitions = crossedTransitions(state.phase, phase, utilization);
  return Object.freeze({
    state: Object.freeze({
      schemaVersion: 1,
      phase,
      subject: state.subject,
      measurement: observation.source,
      used: observation.used,
      limit: observation.limit,
      utilization,
      requiredPasses: state.requiredPasses,
      contextPolicy: PHASE_RANK[phase] >= PHASE_RANK.warning
        ? 'drop-unloaded'
        : 'retain',
      optionalRedundancy: PHASE_RANK[phase] >= PHASE_RANK.conserve
        ? 'reduced'
        : 'standard',
      canContinue: phase !== 'paused',
      observationIds,
    }),
    transitions,
  });
}
