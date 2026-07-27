import { describe, expect, it } from 'vitest';
import type { MissionPlan } from '../mission/plan.js';
import { classifyRisk } from '../risk/classify.js';
import {
  resolveFastMode,
  resolveMissionMode,
  selectMissionMode,
} from './fast.js';
import { fortressModeContract } from './fortress.js';
import { teamModeContract } from './team.js';

const HIGH_RISK_CASES = [
  'Add authentication to the API',
  'Store customer PII',
  'Enforce tenant isolation',
  'Run a destructive migration',
  'Parse an untrusted file upload',
  'Execute user-provided code',
  'Grant an agent permission to an LLM tool',
  'Update a supply-chain dependency',
] as const;

function plan(
  risk: MissionPlan['risk'],
  states: readonly ['architecture' | 'qa' | 'security', 'pending' | 'not-applicable'][] = [
    ['architecture', 'pending'],
    ['qa', 'pending'],
    ['security', 'pending'],
  ],
): MissionPlan {
  return {
    risk,
    applicability: states.map(([pass, state]) => ({ pass, state })),
  } as MissionPlan;
}

describe('mission mode contracts', () => {
  it('keeps the same required quality floor in fast and team for low-risk work', () => {
    const lowRisk = classifyRisk({
      ticket: 'Rename a local fixture label',
      files: ['fixtures/labels.txt'],
      stack: [],
      complete: true,
    });

    const fast = resolveFastMode(plan(lowRisk));
    const team = teamModeContract(plan(lowRisk));

    expect(fast.effectiveMode).toBe('fast');
    expect(fast.evaluatedPasses).toEqual(team.evaluatedPasses);
    expect(fast.requiredPasses).toEqual(team.requiredPasses);
    expect(fast.optionalRedundancy).toBe('reduced');
    expect(team.optionalRedundancy).toBe('standard');
  });

  it.each(HIGH_RISK_CASES)(
    'promotes fast to fortress for high-risk predicate: %s',
    (ticket) => {
      const risk = classifyRisk({ ticket, files: [], stack: [], complete: true });

      const contract = resolveFastMode(plan(risk));

      expect(risk.level).toBe('high');
      expect(contract.effectiveMode).toBe('fortress');
      expect(contract.promotion).toMatchObject({
        from: 'fast',
        to: 'fortress',
        reason: 'high-risk-predicate',
      });
    },
  );

  it('imposes fortress even when high-risk work requests team', () => {
    const risk = classifyRisk({
      ticket: 'Change authentication permissions',
      files: [],
      stack: [],
      complete: true,
    });

    expect(selectMissionMode(risk, 'team')).toMatchObject({
      requestedMode: 'team',
      effectiveMode: 'fortress',
      promotion: { reason: 'high-risk-predicate' },
    });
    expect(selectMissionMode(risk, 'fortress')).toEqual({
      requestedMode: 'fortress',
      effectiveMode: 'fortress',
    });
    expect(resolveMissionMode(plan(risk), 'team')).toMatchObject({
      requestedMode: 'team',
      effectiveMode: 'fortress',
      assuranceRequirements: expect.arrayContaining(['threat-model']),
    });
  });

  it('promotes fast to team when risk is not explicitly low', () => {
    const unknown = classifyRisk({
      ticket: 'Change behavior',
      files: [],
      stack: [],
      complete: false,
    });

    expect(resolveFastMode(plan(unknown))).toMatchObject({
      requestedMode: 'fast',
      effectiveMode: 'team',
      promotion: { reason: 'risk-not-explicitly-low' },
    });
  });

  it('requires every applicable pass in team mode', () => {
    const risk = classifyRisk({
      ticket: 'Rename a local fixture label',
      files: ['fixtures/labels.txt'],
      stack: [],
      complete: true,
    });
    const contract = teamModeContract(plan(risk, [
      ['architecture', 'pending'],
      ['qa', 'pending'],
      ['security', 'not-applicable'],
    ]));

    expect(contract.evaluatedPasses).toEqual(['architecture', 'qa', 'security']);
    expect(contract.requiredPasses).toEqual(['architecture', 'qa']);
    expect(contract.requiresNativeSubagents).toBe(true);
    expect(contract.requiresFreshReviewContext).toBe(true);
  });

  it('adds explicit high-assurance requirements in fortress mode', () => {
    const risk = classifyRisk({
      ticket: 'Add authentication to the API',
      files: [],
      stack: [],
      complete: true,
    });

    expect(fortressModeContract(plan(risk)).assuranceRequirements).toEqual([
      'threat-model',
      'adversarial-security-review',
      'rollback-recovery-proof',
      'safe-dast-when-executable',
      'critical-invariant-second-proof',
    ]);
  });
});
