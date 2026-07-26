import type { EnforcementTier } from '../model/types.js';
import type { Certification } from '../certification/types.js';
import type { Dimension, NextAction, ProjectState, Score, ScoreConfidence } from './types.js';

const TIER_SCORE: Record<EnforcementTier, number> = { pretooluse: 100, active: 80, 'ci-only': 60, 'n/a': 0 };
const CONTEXT_HEAVY_TOKENS = 3000;
const BLOCKER_CAP = 69; // spec Fork 6: a red blocker caps the global score here, whatever the gauges say
const UNPROVEN_CAP = 60; // no behavioral evidence (nothing used, nothing evaluated) caps the global here — structural gauges alone can't post a flattering 60+
const HIGH_CONFIDENCE_EFFECTIVE_RATIO = 0.5;
const HIGH_CONFIDENCE_MIN_USES = 20;
const MIN_CONFIDENCE_SAMPLE = 4; // below this many installed capabilities the surface is too small to claim > low

/** A 0-100 ratio, or a pending marker when there is nothing to measure (den 0). Distinguishing
 * "unmeasured" from a real 0 keeps a degenerate/empty project from reading as a failing one. */
function ratio(num: number, den: number): number | null { // allow-null: a pending marker distinct from a real 0
  return den <= 0 ? null : Math.round((num / den) * 100); // allow-null: nothing to measure
}

/** Per-runtime declared enforcement **coverage**: the mean inline tier across capabilities that declare
 * enforcement for that runtime — not the single strongest one. A runtime where one capability is
 * `pretooluse` and the rest are `ci-only` scores well below 100, honestly reflecting that most of
 * the surface is not strongly enforced. Computed only over capabilities that actually declare the
 * runtime — a detected-but-untargeted runtime is not an enforcement concern. */
function declaredEnforcementByRuntime(cert: Certification): Record<string, number> {
  const runtimes = new Set<string>();
  for (const cap of cert.capabilities) for (const r of Object.keys(cap.enforcement?.inline ?? {})) runtimes.add(r);
  const out: Record<string, number> = {};
  for (const r of runtimes) {
    let sum = 0;
    let count = 0;
    for (const cap of cert.capabilities) {
      const tier: EnforcementTier | undefined = cap.enforcement?.inline?.[r];
      if (tier === undefined) continue; // this capability doesn't declare inline enforcement for r
      sum += TIER_SCORE[tier] ?? 0;
      count += 1;
    }
    out[r] = count > 0 ? Math.round(sum / count) : 0;
  }
  return out;
}

const ACTION_TITLES: Record<string, string> = {
  efficacy: 'Evaluate critical capabilities',
  portability: 'Add a verified runtime (Codex/Hermes)',
  activation: 'Use or prune unused installed capabilities',
  performance: 'Optimize context-heavy capabilities',
  dx: 'Improve developer experience',
};

/**
 * Score a ProjectState into the eight dimensions. Never a naive mean (spec Fork 6): a **blocker** caps
 * the global at 69 only when its `red` failure-predicate fires (a real defect — never a merely-low
 * score, so Hermes' `ci-only` ceiling never caps); **gauges** contribute proportionally and can never
 * cap. Dimensions with no honest local signal — no data yet (installation, dx) or nothing to measure
 * (an empty project) — are **pending** (score absent), excluded from the mean, not invented. Pure.
 */
export function scoreProjectState(
  state: ProjectState,
  cert: Certification,
  staticTokensById: ReadonlyMap<string, number>,
): Score {
  const installed = state.capabilities.filter((c) => c.state !== 'available');
  const nInstalled = installed.length;
  const usedN = installed.filter((c) => c.usedCount > 0).length;
  const effectiveN = installed.filter((c) => c.state === 'effective').length;

  const ownerless = cert.capabilities.filter((c) => !c.owner || c.runtimes.length === 0).length;
  const governance: Dimension = {
    key: 'governance',
    kind: 'blocker',
    score: ratio(cert.capabilities.length - ownerless, cert.capabilities.length),
    red: ownerless > 0,
    detail: ownerless > 0 ? `${ownerless} capabilities without owner/runtimes` : 'every capability has an owner + proof status',
  };

  const declaredEnforcement = declaredEnforcementByRuntime(cert);
  const runtimeByName = new Map(state.runtimes.map((runtime) => [runtime.runtime, runtime]));
  const perRuntime: Record<string, number> = {};
  const unknownEnforcement: string[] = [];
  const failedEnforcement: string[] = [];
  for (const [runtime, declaredScore] of Object.entries(declaredEnforcement)) {
    const evidence = runtimeByName.get(runtime)?.evidence;
    if (evidence?.fired === true) {
      perRuntime[runtime] = declaredScore;
    } else if (evidence?.installed === true && evidence.fired === false) {
      perRuntime[runtime] = 0;
      failedEnforcement.push(runtime);
    } else {
      unknownEnforcement.push(runtime);
    }
  }
  const enfVals = Object.values(perRuntime);
  const enforcement: Dimension = {
    key: 'enforcement',
    kind: 'blocker',
    score: enfVals.length ? Math.round(enfVals.reduce((a, b) => a + b, 0) / enfVals.length) : null, // allow-null: pending when no capability declares an inline tier
    red: failedEnforcement.length > 0,
    perRuntime,
    detail: [
      ...Object.entries(perRuntime).map(([runtime, value]) => `${runtime} ${value}`),
      ...(unknownEnforcement.length > 0
        ? [`unknown: ${unknownEnforcement.join(', ')}`]
        : []),
    ].join(' · ') || 'no capability declares enforcement',
  };

  const testedRuntimes = state.runtimes.filter((runtime) => runtime.evidence.fired !== null);
  const firedRuntimes = testedRuntimes.filter((runtime) => runtime.evidence.fired === true);
  const portability: Dimension = {
    key: 'portability',
    kind: 'gauge',
    score: ratio(firedRuntimes.length, testedRuntimes.length),
    detail: testedRuntimes.length === 0
      ? 'runtime execution not tested'
      : `${firedRuntimes.length}/${testedRuntimes.length} runtimes fired an installed hook`,
  };
  // Skill usage is only observable on Claude (its `Skill` tool fires the meter);
  // Codex loads skills as context with no hook event. So when no Claude runtime is
  // detected, activation is PENDING (unmeasurable), never a real 0 — a 0 here would
  // read as "these skills go unused" and spawn a bogus "prune unused" next action.
  const usageObservable = state.runtimes.some((runtime) =>
    runtime.runtime === 'claude'
    && runtime.evidence.fired === true,
  );
  const activation: Dimension = usageObservable
    ? { key: 'activation', kind: 'gauge', score: ratio(usedN, nInstalled), detail: `${usedN}/${nInstalled} installed capabilities used` }
    : { key: 'activation', kind: 'gauge', score: null, detail: 'usage not observable (no Claude runtime; Codex does not surface skill use)' }; // allow-null: pending, distinct from a real 0
  const efficacy: Dimension = { key: 'efficacy', kind: 'gauge', score: ratio(effectiveN, nInstalled), detail: `${effectiveN}/${nInstalled} evaluated here` };
  // Performance needs token data; with none (model.json absent) it is pending, not a false 100% —
  // otherwise a missing model would read as "context budgets respected".
  const heavy = installed.filter((c) => (staticTokensById.get(c.id) ?? 0) > CONTEXT_HEAVY_TOKENS).length;
  const performance: Dimension =
    staticTokensById.size === 0
      ? { key: 'performance', kind: 'gauge', score: null, detail: 'context cost not measured (no model data)' } // allow-null: pending without token data
      : { key: 'performance', kind: 'gauge', score: ratio(nInstalled - heavy, nInstalled), detail: heavy > 0 ? `${heavy} context-heavy capabilities` : 'context budgets respected' };

  const knownInstallations = state.runtimes.filter((runtime) => runtime.evidence.installed !== null);
  const installedRuntimes = knownInstallations.filter((runtime) => runtime.evidence.installed === true);
  const brokenInstallations = installedRuntimes.filter((runtime) => runtime.evidence.wired === false);
  const installation: Dimension = {
    key: 'installation',
    kind: 'blocker',
    score: ratio(installedRuntimes.length, knownInstallations.length),
    red: brokenInstallations.length > 0,
    detail: knownInstallations.length === 0
      ? 'installation not inspected'
      : `${installedRuntimes.length}/${knownInstallations.length} runtimes installed`
        + (brokenInstallations.length > 0
          ? `; unwired: ${brokenInstallations.map((runtime) => runtime.runtime).join(', ')}`
          : ''),
  };
  const dx: Dimension = { key: 'dx', kind: 'gauge', score: null, detail: 'no deterministic local DX signal yet (devex-audit)' }; // allow-null: pending dimension

  const dimensions: Dimension[] = [installation, portability, activation, efficacy, enforcement, dx, performance, governance];
  const measured = dimensions.filter((d) => typeof d.score === 'number');
  const blockers = dimensions.filter((d) => d.kind === 'blocker' && d.red).map((d) => d.key);
  const rawGlobal = measured.length ? Math.round(measured.reduce((a, d) => a + (d.score ?? 0), 0) / measured.length) : 0;
  const capped = blockers.length > 0;
  const totalUsed = installed.reduce((a, c) => a + c.usedCount, 0);
  // Two independent ceilings on the global, whichever binds lower:
  //  - a red blocker caps at 69 (a real defect outweighs strong gauges);
  //  - zero behavioral evidence — nothing used AND nothing evaluated here — caps
  //    at UNPROVEN_CAP, so a fresh install can't post a flattering 60+ on the
  //    structural gauges (owners declared, runtimes detected) it hasn't proven.
  const hasEvidence = effectiveN > 0 || totalUsed > 0;
  const global = Math.min(capped ? BLOCKER_CAP : 100, hasEvidence ? 100 : UNPROVEN_CAP, rawGlobal);

  const confidence: ScoreConfidence =
    effectiveN === 0 || totalUsed === 0 || nInstalled < MIN_CONFIDENCE_SAMPLE
      ? 'low'
      : effectiveN >= nInstalled * HIGH_CONFIDENCE_EFFECTIVE_RATIO && totalUsed >= HIGH_CONFIDENCE_MIN_USES
        ? 'high'
        : 'medium';

  // Next actions come from MEASURED gauges below 100 — blockers already surface via `blockers`, and a
  // pending dimension has no measurable gap yet (so a future measurable gauge like dx joins here for
  // free once titled). Impact ~ the gap spread over the measured dimensions.
  const denom = measured.length || 1;
  const nextActions: NextAction[] = dimensions
    .filter((d) => d.kind === 'gauge' && typeof d.score === 'number' && d.score < 100 && ACTION_TITLES[d.key])
    .map((d) => ({ key: d.key, impact: Math.round((100 - (d.score ?? 0)) / denom) }))
    .filter((a) => a.impact > 0)
    .sort((a, b) => b.impact - a.impact || (a.key < b.key ? -1 : 1))
    .slice(0, 3)
    .map((a, i) => ({ rank: i + 1, title: ACTION_TITLES[a.key] ?? a.key, impact: a.impact }));

  return { global, confidence, capped, blockers, dimensions, nextActions };
}
