import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_ORACLE_SCENARIOS,
  parseLegacyOracle,
} from './legacy-oracle.js';

const validScenario = {
  id: 'install.fresh.claude',
  operation: 'install',
  platforms: ['darwin'],
  runtimeState: 'claude-only',
  expected: {
    classification: 'success',
    exit: { kind: 'exited', code: 0 },
    diagnostics: [],
    preservation: 'not-applicable',
    recovery: 'clean',
  },
  evidenceOperation: 'install-fresh',
};

const validOracle = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  contractFamily: 'void-machine-legacy',
  contractVersion: 3,
  scenarios: [validScenario],
};

describe('parseLegacyOracle', () => {
  it('accepts the closed legacy scenario contract', () => {
    const parsed = parseLegacyOracle(validOracle);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.scenarios[0]?.id).toBe('install.fresh.claude');
    }
  });

  it('declares the complete closed scenario set', () => {
    expect(LEGACY_ORACLE_SCENARIOS).toHaveLength(24);
    expect(LEGACY_ORACLE_SCENARIOS).toContain('receipt.corrupt-update');
    expect(LEGACY_ORACLE_SCENARIOS).toContain('autopilot.exact-sha');
  });

  it('accepts the checked-in portable manifest', () => {
    const body = JSON.parse(readFileSync(join(
      import.meta.dirname,
      '../../../../../conformance/machine/legacy-v3/manifest.json',
    ), 'utf8')) as unknown;

    const parsed = parseLegacyOracle(body);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.scenarios).toHaveLength(24);
  });

  it.each([
    ['unknown scenario', { ...validScenario, id: 'made-up.case' }],
    ['executable command', { ...validScenario, command: ['rm', '-rf'] }],
    ['absolute fixture path', { ...validScenario, fixturePath: '/tmp/private' }],
    ['private source reference', { ...validScenario, source: 'git@github.com:private/repo' }],
    ['unknown top-level field', { ...validScenario, extra: true }],
  ])('rejects %s', (_label, scenario) => {
    const parsed = parseLegacyOracle({ ...validOracle, scenarios: [scenario] });

    expect(parsed.ok).toBe(false);
  });

  it('rejects a receipt failure that claims success', () => {
    const parsed = parseLegacyOracle({
      ...validOracle,
      scenarios: [{
        ...validScenario,
        id: 'receipt.corrupt-update',
        operation: 'update',
        evidenceOperation: 'update-corrupt-receipt',
        expected: {
          ...validScenario.expected,
          classification: 'success',
        },
      }],
    });

    expect(parsed.ok).toBe(false);
  });

  it('rejects an unsafe diagnostic assertion', () => {
    const parsed = parseLegacyOracle({
      ...validOracle,
      scenarios: [{
        ...validScenario,
        expected: {
          ...validScenario.expected,
          diagnostics: ['/Users/folpe/private-secret'],
        },
      }],
    });

    expect(parsed.ok).toBe(false);
  });
});
