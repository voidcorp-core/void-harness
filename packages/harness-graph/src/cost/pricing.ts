import type { SessionTokens } from './types.js';

// Model -> $/MTok rates. Tokens are the source of truth; dollars are derived.
// cacheRead is ~0.1x input; cacheCreation is ~1.25x input (5-minute TTL default).
// Source: claude-api reference (cached 2026-06-04). Overridable via .void/pricing.json.

export interface ModelRates {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheReadPerMTok: number;
  readonly cacheCreationPerMTok: number;
}

export type PricingTable = Readonly<Record<string, ModelRates>>;

/** Build a row from input/output; cache read and creation follow the standard multipliers. */
function rates(inputPerMTok: number, outputPerMTok: number): ModelRates {
  return {
    inputPerMTok,
    outputPerMTok,
    cacheReadPerMTok: inputPerMTok * 0.1,
    cacheCreationPerMTok: inputPerMTok * 1.25,
  };
}

export const DEFAULT_PRICING: PricingTable = {
  'claude-fable-5': rates(10, 50),
  'claude-opus-4-8': rates(5, 25),
  'claude-opus-4-7': rates(5, 25),
  'claude-opus-4-6': rates(5, 25),
  'claude-sonnet-4-6': rates(3, 15),
  'claude-haiku-4-5': rates(1, 5),
};

/** Strip a context-window suffix (`[1m]`) and a dated snapshot (`-20251001`). */
function normalizeModel(model: string): string {
  return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

function lookupRates(model: string, pricing: PricingTable): ModelRates | undefined {
  return pricing[model] ?? pricing[normalizeModel(model)];
}

/** Merge an override onto the defaults: an override entry replaces that model's row. */
export function mergePricing(base: PricingTable, override: PricingTable): PricingTable {
  return { ...base, ...override };
}

/** Dollars for a token breakdown under a model, or undefined if the model is unpriced. */
export function deriveDollars(tokens: SessionTokens, model: string, pricing: PricingTable): number | undefined {
  const r = lookupRates(model, pricing);
  if (r === undefined) return undefined;
  return (
    (tokens.in * r.inputPerMTok +
      tokens.out * r.outputPerMTok +
      tokens.cacheRead * r.cacheReadPerMTok +
      tokens.cacheCreation * r.cacheCreationPerMTok) /
    1_000_000
  );
}
