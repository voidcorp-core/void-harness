export declare const LEGACY_ORACLE_PATH: string;

interface LegacyScenario {
  readonly id: string;
  readonly evidenceOperation: string;
  readonly [key: string]: unknown;
}

export declare function validateLegacyOracle(value: unknown):
  | { readonly ok: true; readonly value: { readonly scenarios: readonly LegacyScenario[] } }
  | { readonly ok: false; readonly reason: string };

export declare function loadLegacyOracle(path?: string):
  | { readonly ok: true; readonly value: { readonly scenarios: readonly LegacyScenario[] } }
  | { readonly ok: false; readonly reason: string };
