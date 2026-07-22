import { describe, expect, it } from 'vitest';
import type { CapabilityCert, Certification } from '../certification/types.js';
import { computeProjectState } from './compute.js';
import type { LocalSignals } from './types.js';

const opusCell = { runtime: 'claude', provider: 'anthropic', tier: 'opus' };

function cap(id: string, over: Partial<CapabilityCert> = {}): CapabilityCert {
  return {
    id,
    owner: 'folpe',
    runtimes: ['claude', 'codex'],
    evalTargets: [opusCell],
    proof: { verified: true },
    ...over,
  };
}
function cert(capabilities: CapabilityCert[]): Certification {
  return { schemaVersion: 1, harnessVersion: '0.16.0', capabilities };
}
function signals(over: Partial<LocalSignals> = {}): LocalSignals {
  return {
    installedIds: new Set(),
    usedCounts: new Map(),
    runtimesDetected: new Set(),
    ...over,
  };
}
const stateOf = (ps: ReturnType<typeof computeProjectState>, id: string) =>
  ps.capabilities.find((c) => c.id === id)?.state;

describe('computeProjectState — five-state derivation', () => {
  it('a capability not installed here is available only', () => {
    const ps = computeProjectState(cert([cap('skill:tdd')]), signals(), '0.16.0');
    expect(stateOf(ps, 'skill:tdd')).toBe('available');
  });

  it('installed but structurally unverified stays installed', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: false } })]),
      signals({ installedIds: new Set(['skill:tdd']) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('installed');
  });

  it('installed + verified but never used here is verified (installed-but-unused is not fully available)', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('verified');
  });

  it('used here but with no effective proof is used', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', 5]]) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('used');
    expect(ps.capabilities[0]?.usedCount).toBe(5);
  });

  it('certified effective AND used here reaches effective, carrying the cells', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.31 }] };
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: true, effective } })]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', 9]]) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('effective');
    expect(ps.capabilities[0]?.effectiveCells).toEqual([{ ...opusCell, delta: 0.31 }]);
  });

  it('certified effective but never used HERE stays used-or-below (not effective)', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.31 }] };
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: true, effective } })]),
      signals({ installedIds: new Set(['skill:tdd']) }), // installed, never fired
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('verified');
    expect(ps.capabilities[0]?.effectiveCells).toBeUndefined();
  });

  it('a used-but-unverified capability caps at installed (each level implies the ones before it)', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: false } })]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', 5]]) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('installed');
  });

  it('a corrupt (NaN) usedCount is treated as zero — never silently promotes to effective', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.31 }] };
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: true, effective } })]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', Number.NaN]]) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('verified');
    expect(ps.capabilities[0]?.usedCount).toBe(0);
  });

  it('a negative or fractional usedCount normalizes to a clean non-negative integer', () => {
    const neg = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', -3]]) }),
      '0.16.0',
    );
    expect(neg.capabilities[0]?.usedCount).toBe(0);
    expect(stateOf(neg, 'skill:tdd')).toBe('verified');
    const frac = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', 4.9]]) }),
      '0.16.0',
    );
    expect(frac.capabilities[0]?.usedCount).toBe(4);
    expect(stateOf(frac, 'skill:tdd')).toBe('used');
  });

  it('reports runtimes as detected/undetected over the union of declared + detected', () => {
    const ps = computeProjectState(cert([cap('skill:tdd')]), signals({ runtimesDetected: new Set(['claude']) }), '0.16.0');
    const runtimes = Object.fromEntries(ps.runtimes.map((r) => [r.runtime, r.detected]));
    expect(runtimes).toEqual({ claude: true, codex: false });
  });

  it('carries schema + harness version', () => {
    const ps = computeProjectState(cert([cap('skill:tdd')]), signals(), '0.17.0');
    expect(ps.schemaVersion).toBe(1);
    expect(ps.harnessVersion).toBe('0.17.0');
  });
});
