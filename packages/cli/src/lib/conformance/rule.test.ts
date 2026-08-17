import { describe, expect, it } from 'vitest';
import { planRepairs, type ConformanceFinding, type ConformanceRule } from './rule.js';

/**
 * A rule declares how to detect drift and, WHEN THE REPAIR IS MECHANICAL, how
 * to repair it. The admission test is the whole design: a rule ships a repair
 * only if two competent people would agree on the exact repair without
 * discussing it.
 *
 * A repair that arbitrates is a repair that corrupts, and the same boundary is
 * what stops the command from growing without end.
 */

function rule(over: Partial<ConformanceRule> = {}): ConformanceRule {
  return {
    id: 'demo',
    title: 'demo rule',
    detect: () => ({ drifted: false }),
    ...over,
  };
}

const DRIFT: ConformanceFinding = { drifted: true, detail: '2 things drifted' };

describe('planRepairs', () => {
  it('reports a conformant project with nothing to do', () => {
    const plan = planRepairs([rule()], { root: '/p', treeDirty: false });

    expect(plan.findings).toEqual([]);
    expect(plan.repairable).toEqual([]);
    expect(plan.blocked).toBe(undefined);
  });

  it('reports drift and names the rule that found it', () => {
    const plan = planRepairs([rule({ detect: () => DRIFT })], { root: '/p', treeDirty: false });

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]?.ruleId).toBe('demo');
    expect(plan.findings[0]?.detail).toBe('2 things drifted');
  });

  // A rule without a repair is advisory. Never applied, always reported.
  it('leaves a rule with no repair out of the repairable set', () => {
    const plan = planRepairs([rule({ detect: () => DRIFT })], { root: '/p', treeDirty: false });

    expect(plan.findings).toHaveLength(1);
    expect(plan.repairable).toEqual([]);
  });

  it('offers a repair only for rules that declare one', () => {
    const rules = [
      rule({ id: 'advisory', detect: () => DRIFT }),
      rule({ id: 'mechanical', detect: () => DRIFT, repair: () => ({ mutations: [] }) }),
    ];

    const plan = planRepairs(rules, { root: '/p', treeDirty: false });

    expect(plan.findings.map((finding) => finding.ruleId)).toEqual(['advisory', 'mechanical']);
    expect(plan.repairable).toEqual(['mechanical']);
  });

  // The guard that keeps a repair reviewable: on a dirty tree, the repair and
  // the pre-existing edits become indistinguishable in the diff.
  it('refuses to offer any repair on a dirty tree, and says why', () => {
    const rules = [rule({ detect: () => DRIFT, repair: () => ({ mutations: [] }) })];

    const plan = planRepairs(rules, { root: '/p', treeDirty: true });

    expect(plan.repairable).toEqual([]);
    expect(plan.blocked).toContain('uncommitted');
  });

  it('still reports the findings on a dirty tree', () => {
    const plan = planRepairs([rule({ detect: () => DRIFT, repair: () => ({ mutations: [] }) })], {
      root: '/p',
      treeDirty: true,
    });

    expect(plan.findings).toHaveLength(1);
  });

  // One rule's failure is not the sweep's failure: the other rules still answer.
  it('turns a rule that throws into a finding instead of losing the sweep', () => {
    const rules = [
      rule({
        id: 'broken',
        detect: () => {
          throw new Error('boom');
        },
      }),
      rule({ id: 'fine', detect: () => DRIFT }),
    ];

    const plan = planRepairs(rules, { root: '/p', treeDirty: false });

    expect(plan.findings.map((finding) => finding.ruleId)).toEqual(['broken', 'fine']);
    expect(plan.findings[0]?.detail).toContain('boom');
    expect(plan.repairable).toEqual([]);
  });

  it('never offers a repair for a rule whose detection failed', () => {
    const rules = [
      rule({
        detect: () => {
          throw new Error('boom');
        },
        repair: () => ({ mutations: [] }),
      }),
    ];

    expect(planRepairs(rules, { root: '/p', treeDirty: false }).repairable).toEqual([]);
  });

  it('keeps rule order stable so two runs read the same', () => {
    const rules = [
      rule({ id: 'b', detect: () => DRIFT }),
      rule({ id: 'a', detect: () => DRIFT }),
    ];

    expect(planRepairs(rules, { root: '/p', treeDirty: false }).findings.map((f) => f.ruleId))
      .toEqual(['b', 'a']);
  });
});
