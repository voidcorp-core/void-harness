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
  const installedIds = over.installedIds ?? new Set<string>();
  return {
    installedIds,
    verifiedIds: over.verifiedIds ?? installedIds,
    usedCounts: new Map(),
    runtimeEvidence: new Map(),
    ...over,
  };
}
const runtimeEvidence = (runtimes: readonly string[]) =>
  new Map(runtimes.map((runtime) => [
    runtime,
    { installed: true, wired: true, fired: true, observed: true, certified: true },
  ] as const));
const noTokens = new Map<string, number>();
const dim = (s: ReturnType<typeof scoreProjectState>, key: string) => s.dimensions.find((d) => d.key === key);

describe('scoreProjectState', () => {
  it('a fresh install (installed, nothing used) scores gauges low but is NOT capped — new is not broken', () => {
    const c = cert([cap('skill:a'), cap('skill:b')]);
    // Claude detected so usage is observable (else activation is pending, tested separately)
    const ps = computeProjectState(
      c,
      signals({ installedIds: new Set(['skill:a', 'skill:b']), runtimeEvidence: runtimeEvidence(['claude']) }),
      '0.16.0',
    );
    const score = scoreProjectState(ps, c, noTokens);
    expect(score.capped).toBe(false);
    expect(score.blockers).toEqual([]);
    expect(dim(score, 'activation')?.score).toBe(0); // observable, nothing used
    expect(dim(score, 'efficacy')?.score).toBe(0); // nothing effective
    expect(score.global).toBeGreaterThan(0);
    expect(score.global).toBeLessThan(100);
  });

  it('caps the global at <= 60 with zero behavioral evidence, however strong the structural gauges', () => {
    const ids = ['a', 'b', 'c'].map((n) => `skill:${n}`);
    const c = cert(ids.map((id) => cap(id)));
    // Strong structure: everything installed, every runtime detected, light context.
    // But nothing used and nothing evaluated here -> no proof it helps.
    const ps = computeProjectState(
      c,
      signals({ installedIds: new Set(ids), runtimeEvidence: runtimeEvidence(['claude', 'codex', 'hermes']) }),
      '0.16.0',
    );
    const lightTokens = new Map(ids.map((id) => [id, 100] as const));
    const score = scoreProjectState(ps, c, lightTokens);
    expect(dim(score, 'portability')?.score).toBe(100); // structural gauges high
    expect(dim(score, 'activation')?.score).toBe(0); // yet nothing used
    expect(dim(score, 'efficacy')?.score).toBe(0); // and nothing proven
    expect(score.capped).toBe(false); // not a blocker cap — a no-evidence cap
    expect(score.global).toBeLessThanOrEqual(60);
    expect(score.confidence).toBe('low');
  });

  it('lifts the no-evidence cap as soon as there is real usage — the same surface exceeds 60', () => {
    const ids = ['a', 'b', 'c'].map((n) => `skill:${n}`);
    const c = cert(ids.map((id) => cap(id)));
    const used = signals({
      installedIds: new Set(ids),
      runtimeEvidence: runtimeEvidence(['claude', 'codex', 'hermes']),
      usedCounts: new Map(ids.map((id) => [id, 2] as const)),
    });
    const score = scoreProjectState(computeProjectState(c, used, '0.16.0'), c, new Map(ids.map((id) => [id, 100] as const)));
    expect(score.global).toBeGreaterThan(60);
  });

  it('a capability without an owner is a RED governance blocker that caps the global score at <= 69', () => {
    const c = cert([cap('skill:a'), cap('skill:b', { owner: undefined })]);
    const ps = computeProjectState(
      c,
      signals({
        installedIds: new Set(['skill:a', 'skill:b']),
        runtimeEvidence: runtimeEvidence(['claude']),
      }),
      '0.16.0',
    );
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
      signals({ installedIds: new Set(['skill:a']), runtimeEvidence: runtimeEvidence(['claude', 'codex', 'hermes']) }),
      '0.16.0',
    );
    const score = scoreProjectState(ps, c, noTokens);
    const enf = dim(score, 'enforcement');
    expect(enf?.perRuntime).toEqual({ claude: 100, codex: 100, hermes: 60 });
    expect(enf?.red).toBe(false);
    expect(enf?.detail).toBe('claude 100 · codex 100 · hermes 60');
    expect(score.capped).toBe(false);
  });

  it('enforcement is coverage (mean tier across capabilities), not the single strongest one', () => {
    const strong: NodeEnforcement = { floor: 'ci', inline: { claude: 'pretooluse' } };
    const weak: NodeEnforcement = { floor: 'ci', inline: { claude: 'ci-only' } };
    const c = cert([cap('skill:a', { enforcement: strong }), cap('skill:b', { enforcement: weak })]);
    const ps = computeProjectState(
      c,
      signals({
        installedIds: new Set(['skill:a', 'skill:b']),
        runtimeEvidence: runtimeEvidence(['claude']),
      }),
      '0.16.0',
    );
    const enf = dim(scoreProjectState(ps, c, noTokens), 'enforcement');
    // mean of pretooluse(100) and ci-only(60) = 80 — the old max would have said 100
    expect(enf?.perRuntime).toEqual({ claude: 80 });
  });

  it('activation is PENDING (not 0) and spawns no prune action when usage is unobservable (Codex, no Claude)', () => {
    const c = cert([cap('skill:a'), cap('skill:b')]);
    // Codex detected, Claude not -> usage can't be measured
    const ps = computeProjectState(
      c,
      signals({ installedIds: new Set(['skill:a', 'skill:b']), runtimeEvidence: runtimeEvidence(['codex']) }),
      '0.16.0',
    );
    const score = scoreProjectState(ps, c, noTokens);
    expect(dim(score, 'activation')?.score).toBeNull(); // pending, not 0
    expect(dim(score, 'activation')?.detail).toContain('not observable');
    // no "Use or prune unused" action when activation is unmeasurable
    expect(score.nextActions.some((a) => a.title.includes('prune'))).toBe(false);
  });

  it('activation is measured when Claude is detected (usage observable)', () => {
    const c = cert([cap('skill:a')]);
    const ps = computeProjectState(
      c,
      signals({ installedIds: new Set(['skill:a']), runtimeEvidence: runtimeEvidence(['claude']), usedCounts: new Map([['skill:a', 2]]) }),
      '0.16.0',
    );
    expect(dim(scoreProjectState(ps, c, noTokens), 'activation')?.score).toBe(100); // 1/1 used
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

  it('performance is pending (not a false 100%) when no token data is available, measured when it is', () => {
    const c = cert([cap('skill:a')]);
    const ps = computeProjectState(c, signals({ installedIds: new Set(['skill:a']) }), '0.16.0');
    // no model.json -> empty token map -> cannot measure context cost -> pending, never "budgets respected"
    expect(dim(scoreProjectState(ps, c, noTokens), 'performance')?.score).toBeNull();
    // with token data, it is measured
    expect(dim(scoreProjectState(ps, c, new Map([['skill:a', 100]])), 'performance')?.score).toBe(100);
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
    // Only efficacy + governance are measured. Runtime/enforcement/install stay pending without an
    // executable runtime probe, so the efficacy gap is spread over 2 measured dimensions.
    expect(actions[0]?.impact).toBe(50);
    for (let i = 1; i < actions.length; i += 1) {
      expect(actions[i - 1]!.impact).toBeGreaterThanOrEqual(actions[i]!.impact);
      expect(actions[i - 1]!.rank).toBe(i);
    }
  });
});
