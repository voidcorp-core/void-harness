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
    verifiedIds: new Set(),
    usedCounts: new Map(),
    runtimeEvidence: new Map(),
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

  it('installed + locally verified but never used here is verified', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({
        installedIds: new Set(['skill:tdd']),
        verifiedIds: new Set(['skill:tdd']),
      }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('verified');
  });

  it('never infers local verification from a frozen structural certification', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']) }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('installed');
    expect(ps.capabilities[0]).toMatchObject({
      verified: false,
      certified: true,
    });
  });

  it('used here but with no effective proof is used', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({
        installedIds: new Set(['skill:tdd']),
        verifiedIds: new Set(['skill:tdd']),
        usedCounts: new Map([['skill:tdd', 5]]),
      }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('used');
    expect(ps.capabilities[0]?.usedCount).toBe(5);
  });

  it('certified effective AND used here reaches effective, carrying the cells', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.31 }] };
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: true, effective } })]),
      signals({
        installedIds: new Set(['skill:tdd']),
        verifiedIds: new Set(['skill:tdd']),
        usedCounts: new Map([['skill:tdd', 9]]),
      }),
      '0.16.0',
    );
    expect(stateOf(ps, 'skill:tdd')).toBe('effective');
    expect(ps.capabilities[0]?.effectiveCells).toEqual([{ ...opusCell, delta: 0.31 }]);
  });

  it('certified effective but never used HERE stays used-or-below (not effective)', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.31 }] };
    const ps = computeProjectState(
      cert([cap('skill:tdd', { proof: { verified: true, effective } })]),
      signals({
        installedIds: new Set(['skill:tdd']),
        verifiedIds: new Set(['skill:tdd']),
      }), // installed, verified, never fired
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
      signals({
        installedIds: new Set(['skill:tdd']),
        verifiedIds: new Set(['skill:tdd']),
        usedCounts: new Map([['skill:tdd', Number.NaN]]),
      }),
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
    expect(stateOf(neg, 'skill:tdd')).toBe('installed');
    const frac = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({ installedIds: new Set(['skill:tdd']), usedCounts: new Map([['skill:tdd', 4.9]]) }),
      '0.16.0',
    );
    expect(frac.capabilities[0]?.usedCount).toBe(4);
    expect(stateOf(frac, 'skill:tdd')).toBe('installed');
  });

  it('preserves explicit unknown runtime evidence instead of inferring health', () => {
    const ps = computeProjectState(
      cert([cap('skill:tdd')]),
      signals({
        runtimeEvidence: new Map([
          ['claude', {
            installed: true,
            wired: true,
            fired: null,
            observed: false,
            certified: true,
          }],
        ]),
      }),
      '0.16.0',
    );
    expect(ps.runtimes).toEqual([
      {
        runtime: 'claude',
        detected: true,
        evidence: {
          installed: true,
          wired: true,
          fired: null,
          observed: false,
          certified: true,
        },
      },
      {
        runtime: 'codex',
        detected: false,
        evidence: {
          installed: null,
          wired: null,
          fired: null,
          observed: null,
          certified: null,
        },
      },
    ]);
  });

  it('carries schema + harness version', () => {
    const ps = computeProjectState(cert([cap('skill:tdd')]), signals(), '0.17.0');
    expect(ps.schemaVersion).toBe(1);
    expect(ps.harnessVersion).toBe('0.17.0');
  });
});
