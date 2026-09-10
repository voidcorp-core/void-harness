import { describe, expect, it } from 'vitest';
import {
  LEGACY_ORACLE_PATH,
  loadLegacyOracle,
  validateLegacyOracle,
} from '../../../scripts/conformance-legacy-oracle.mjs';

describe('packed legacy oracle conformance', () => {
  it('loads the checked-in oracle without production TypeScript imports', () => {
    const result = loadLegacyOracle(LEGACY_ORACLE_PATH);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scenarios).toHaveLength(24);
  });

  it('fails closed when a scenario is removed or its evidence mapping changes', () => {
    const body = loadLegacyOracle(LEGACY_ORACLE_PATH);
    if (!body.ok) throw new Error('fixture must be valid');
    const changed = {
      ...body.value,
      scenarios: body.value.scenarios.slice(1).map((scenario, index) => (
        index === 0
          ? { ...scenario, evidenceOperation: 'unknown-operation' }
          : scenario
      )),
    };

    const result = validateLegacyOracle(changed);

    expect(result.ok).toBe(false);
  });
});
