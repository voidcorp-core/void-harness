// What one unit may spend before it hands back.
//
// The chain is bounded by time and nothing else, which is one runaway worker
// away from producing nothing in six hours: it consumes the whole clock inside
// unit one, and the chain never learns why because the only signal it gets is
// that time ran out. Taken from `prime-agent`, whose autonomous mode is bounded
// by turn, token AND time.
//
// A ceiling here ends a UNIT, never the run. That is the difference from
// `planChainStep`: this hands back so the next unit can start with what remains.

import { autopilotFailure } from './errors.js';

export interface UnitCeilings {
  readonly turns: number;
  readonly tokens: number;
  readonly elapsedMs: number;
}

export interface UnitSpend {
  readonly turns: number;
  readonly tokens: number;
  readonly elapsedMs: number;
}

/** Which limit ended it, or that a counter could not be read at all. */
export type ExhaustedCeiling = 'turns' | 'tokens' | 'time' | 'unreadable';

export type UnitBudgetVerdict =
  | { readonly kind: 'within' }
  | {
      readonly kind: 'exhausted';
      readonly ceiling: ExhaustedCeiling;
      /** Typed, so the chain acts rather than stops. */
      readonly action: 'SPLIT';
      readonly detail: string;
    };

/**
 * Room for a real unit, not for a loop.
 *
 * Measured on 2026-08-31: one unit of genuine work took 28 minutes and 76 tool
 * calls. These sit above that with headroom, and below the point where one unit
 * could eat a two-hour run.
 */
export const DEFAULT_UNIT_CEILINGS: UnitCeilings = Object.freeze({
  turns: 60,
  tokens: 400_000,
  elapsedMs: 45 * 60_000,
});

function usable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function readable(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Judge one unit's spend against its ceilings.
 *
 * Turns are reported before tokens on purpose: a unit that looped is a different
 * diagnosis from one that read too much, and the loop is the cheaper thing to
 * see. An unreadable counter is exhausted rather than within, because every
 * comparison against `NaN` is false and "no room left" is the safe reading --
 * the chain already learned this for its own budget and the shape must not come
 * back one level down.
 */
export function judgeUnitBudget(spend: UnitSpend, ceilings: UnitCeilings): UnitBudgetVerdict {
  for (const [name, value] of Object.entries(ceilings)) {
    if (!usable(value)) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        'a unit ceiling is not a usable limit',
        `\`${name}\` is ${String(value)}`,
        'set every unit ceiling to a finite number greater than zero',
      );
    }
  }

  if (!readable(spend.turns) || !readable(spend.tokens) || !readable(spend.elapsedMs)) {
    return {
      kind: 'exhausted',
      ceiling: 'unreadable',
      action: 'SPLIT',
      detail: 'a spend counter could not be read, which is not the same as room remaining',
    };
  }

  const crossed: readonly (readonly [ExhaustedCeiling, number, number])[] = [
    ['turns', spend.turns, ceilings.turns],
    ['tokens', spend.tokens, ceilings.tokens],
    ['time', spend.elapsedMs, ceilings.elapsedMs],
  ];

  for (const [ceiling, used, allowed] of crossed) {
    if (used < allowed) continue;
    return {
      kind: 'exhausted',
      ceiling,
      action: 'SPLIT',
      detail: `this unit spent ${String(used)} against a ceiling of ${String(allowed)}`
        + ` for ${ceiling}; the run keeps what it has left`,
    };
  }
  return { kind: 'within' };
}
