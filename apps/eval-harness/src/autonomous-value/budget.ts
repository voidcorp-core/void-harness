import { PILOT_EXECUTION_COUNT } from './pilot.js';

export type MicroUsd = number & { readonly __microUsd: unique symbol };
type BudgetResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: 'invalid-budget' | 'invalid-schedule' | 'exhausted' };

export interface BudgetPlan {
  readonly budgetMicroUsd: MicroUsd;
  readonly reservations: readonly { readonly executionId: string; readonly microUsd: MicroUsd }[];
}

const MAX_USD = 1000000;

function isMicroUsd(value: number): value is MicroUsd {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_USD * 1000000;
}

/** Interpret the canonical decimal spelling exactly, including exponent-form numbers. */
export function toMicroUsd(value: number, rounding: 'budget' | 'reservation'): BudgetResult<MicroUsd> {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_USD) {
    return { ok: false, error: 'invalid-budget' };
  }
  const [coefficient = '', exponent = '0'] = value.toString().split('e');
  const [whole = '', fraction = ''] = coefficient.split('.');
  const digits = BigInt(whole + fraction);
  const scale = Number(exponent) - fraction.length + 6;
  const divisor = 10n ** BigInt(Math.max(0, -scale));
  const scaled = scale >= 0 ? digits * 10n ** BigInt(scale) : digits / divisor;
  const rounded = scaled + (scale < 0 && rounding === 'reservation' && digits % divisor !== 0n ? 1n : 0n);
  const amount = Number(rounded);
  // Finite positive JS numbers <= MAX_USD have bounded decimal spellings and exponents.
  return isMicroUsd(amount) ? { ok: true, value: amount } : { ok: false, error: 'invalid-budget' };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value instanceof Object && !Array.isArray(value);
}

export function parseBudgetPlan(input: unknown, executionIds: readonly string[]): BudgetResult<BudgetPlan> {
  if (!record(input) || typeof input['budgetUsd'] !== 'number' || !Array.isArray(input['reservations'])) {
    return { ok: false, error: 'invalid-budget' };
  }
  const budget = toMicroUsd(input['budgetUsd'], 'budget');
  if (!budget.ok) return budget;
  if (executionIds.length !== PILOT_EXECUTION_COUNT || new Set(executionIds).size !== PILOT_EXECUTION_COUNT
    || input['reservations'].length !== PILOT_EXECUTION_COUNT) return { ok: false, error: 'invalid-schedule' };
  const amounts = new Map<string, MicroUsd>();
  for (const entry of input['reservations']) {
    if (!record(entry) || typeof entry['executionId'] !== 'string'
      || !executionIds.includes(entry['executionId']) || amounts.has(entry['executionId'])
      || typeof entry['maxCostUsd'] !== 'number') return { ok: false, error: 'invalid-schedule' };
    const amount = toMicroUsd(entry['maxCostUsd'], 'reservation');
    if (!amount.ok) return amount;
    amounts.set(entry['executionId'], amount.value);
  }
  const reservations = executionIds.map((executionId) => {
    const microUsd = amounts.get(executionId);
    if (microUsd === undefined) throw new Error('validated reservation missing');
    return Object.freeze({ executionId, microUsd });
  });
  return { ok: true, value: Object.freeze({ budgetMicroUsd: budget.value,
    reservations: Object.freeze(reservations) }) };
}

export function reserveBudget(plan: BudgetPlan, reservedMicroUsd: number, executionId: string): BudgetResult<MicroUsd> {
  if (!Number.isSafeInteger(reservedMicroUsd) || reservedMicroUsd < 0
    || reservedMicroUsd > plan.budgetMicroUsd) return { ok: false, error: 'invalid-budget' };
  const reservation = plan.reservations.find((entry) => entry.executionId === executionId);
  if (reservation === undefined) return { ok: false, error: 'invalid-schedule' };
  return reservation.microUsd <= plan.budgetMicroUsd - reservedMicroUsd
    ? { ok: true, value: reservation.microUsd } : { ok: false, error: 'exhausted' };
}
