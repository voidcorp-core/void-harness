import { describe, expect, it } from 'vitest';
import type { CapabilityCert, Certification, NodeEnforcement } from '../certification/types.js';
import { computeProjectState } from './compute.js';
import { scoreProjectState } from './score.js';
import type { LocalSignals } from './types.js';

const opusCell = { runtime: 'claude', provider: 'anthropic', tier: 'opus' };
const enforcement: NodeEnforcement = {
  floor: 'ci',
  inline: { claude: 'pretooluse', codex: 'pretooluse', hermes: 'ci-only' },
};
function cap(id: string, over: Partial<CapabilityCert> = {}): CapabilityCert {
  return { id, owner: 'folpe', runtimes: ['claude', 'codex'], enforcement, evalTargets: [opusCell], proof: { verified: true }, ...over };
}
const cert = (capabilities: CapabilityCert[]): Certification => ({ schemaVersion: 1, harnessVersion: '0.16.0', capabilities });
function signals(over: Partial<LocalSignals> = {}): LocalSignals {
  return { installedIds: new Set(), usedCounts: new Map(), runtimesDetected: new Set(), ...over };
}
const noTokens = new Map<string, number>();
const dim = (s: ReturnType<typeof scoreProjectState>, key: string) => s.dimensions.find((d) => d.key === key);

describe('scoreProjectState', () => {
  it('a fresh install (installed, nothing used) scores gauges low but is NOT capped — new is not broken', () => {
    const c = cert([cap('skill:a'), cap('skill:b')]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a', 'skill:b']) }), '0.16.0');
    const score = scoreProjectState(ps, c, noTokens);
    expect(score.capped).toBe(false);
    expect(score.blockers).toEqual([]);
    expect(dim(score, 'activation')?.score).toBe(0); // nothing used
    expect(dim(score, 'efficacy')?.score).toBe(0); // nothing effective
    expect(score.global).toBeGreaterThan(0);
    expect(score.global).toBeLessThan(100);
  });

  it('a capability without an owner is a RED governance blocker that caps the global score at <= 69', () => {
    const c = cert([cap('skill:a'), cap('skill:b', { owner: undefined })]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a', 'skill:b']) }), '0.16.0');
    const score = scoreProjectState(ps, c, noTokens);
    expect(dim(score, 'governance')?.red).toBe(true);
    expect(score.capped).toBe(true);
    expect(score.blockers).toContain('governance');
    expect(score.global).toBeLessThanOrEqual(69);
  });

  it('Hermes ci-only enforcement is scored on its ceiling (~60) but NEVER caps the score', () => {
    const c = cert([cap('skill:a')]);
    const ps = computeProjectState(
      c,
      signals({ installedIds: new Set(['skill:a']), runtimesDetected: new Set(['claude', 'codex', 'hermes']) }),
      '0.16.0',
    );
    const score = scoreProjectState(ps, c, noTokens);
    const enf = dim(score, 'enforcement');
    expect(enf?.perRuntime).toEqual({ claude: 100, codex: 100, hermes: 60 });
    expect(enf?.red).toBe(false);
    expect(score.capped).toBe(false);
  });

  it('confidence is low when no capability is effective (thin proof)', () => {
    const c = cert([cap('skill:a')]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a']), usedCounts: new Map([['skill:a', 3]]) }), '0.16.0');
    expect(scoreProjectState(ps, c, noTokens).confidence).toBe('low');
  });

  it('confidence is high only on a broad, well-used, well-proven surface — never a 1-sample universe', () => {
    const effective = { cells: [{ ...opusCell, delta: 0.3 }] };
    const ids = ['a', 'b', 'c', 'd', 'e'].map((n) => `skill:${n}`);
    const c = cert(ids.map((id) => cap(id, { proof: { verified: true, effective } })));
    const wellUsed = signals({ installedIds: new Set(ids), usedCounts: new Map(ids.map((id) => [id, 6])) }); // 5 caps, all effective, 30 uses
    expect(scoreProjectState(computeProjectState(c, wellUsed, '0.16.0'), c, noTokens).confidence).toBe('high');

    // one capability hammered 20 times is NOT a high-confidence surface (too small a sample)
    const oneCap = cert([cap('skill:a', { proof: { verified: true, effective } })]);
    const hammered = signals({ installedIds: new Set(['skill:a']), usedCounts: new Map([['skill:a', 20]]) });
    expect(scoreProjectState(computeProjectState(oneCap, hammered, '0.16.0'), oneCap, noTokens).confidence).toBe('low');
  });

  it('an empty project yields pending (null) dimensions and no phantom next actions — not a false 0', () => {
    const c = cert([]);
    const score = scoreProjectState(computeProjectState(c, signals(), '0.16.0'), c, noTokens);
    expect(dim(score, 'governance')?.score).toBeNull();
    expect(dim(score, 'activation')?.score).toBeNull();
    expect(dim(score, 'enforcement')?.score).toBeNull();
    expect(score.nextActions).toEqual([]);
  });

  it('dimensions with no honest local signal (installation, dx) are pending — score null, excluded from the mean', () => {
    const c = cert([cap('skill:a')]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a']) }), '0.16.0');
    const score = scoreProjectState(ps, c, noTokens);
    expect(dim(score, 'installation')?.score).toBeNull();
    expect(dim(score, 'dx')?.score).toBeNull();
  });

  it('next actions are ranked by descending impact, with impact = gap spread over measured dimensions', () => {
    const c = cert([cap('skill:a'), cap('skill:b')]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a', 'skill:b']) }), '0.16.0');
    const actions = scoreProjectState(ps, c, noTokens).nextActions;
    expect(actions.length).toBeGreaterThan(0);
    // portability/activation/efficacy are all at 0 (nothing detected/used/proven), gap 100 over 6
    // measured dimensions -> impact round(100/6) = 17.
    expect(actions[0]?.impact).toBe(17);
    for (let i = 1; i < actions.length; i += 1) {
      expect(actions[i - 1]!.impact).toBeGreaterThanOrEqual(actions[i]!.impact);
      expect(actions[i - 1]!.rank).toBe(i);
    }
  });
});
