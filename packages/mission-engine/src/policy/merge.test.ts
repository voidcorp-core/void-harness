import { describe, expect, it } from 'vitest';
import { mergePolicies } from './merge.js';
import { parsePolicy, type PolicyDocument } from './schema.js';

function document(
  layer: 'core' | 'project',
  strength: 'advisory' | 'required' | 'blocking',
  waiver = false,
): PolicyDocument {
  const raw = {
    schemaVersion: 1,
    id: `${layer}:quality-floor`,
    version: 1,
    layer,
    rules: [{
      id: 'core:security',
      pass: 'security',
      strength,
      baseline: true,
      appliesWhen: { any: ['trust-boundary'] },
    }],
    ...(waiver ? {
      waivers: [{
        id: 'waiver:security-baseline',
        ruleId: 'core:security',
        reason: 'Time-boxed compatibility investigation.',
        approvedBy: 'security-owner',
        approvedAt: '2026-07-25T00:00:00Z',
        expiresAt: '2026-08-01T00:00:00Z',
      }],
    } : {}),
  };
  const parsed = parsePolicy(raw);
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

describe('mergePolicies', () => {
  it('merges in core to project order and permits strengthening', () => {
    const merged = mergePolicies([
      document('project', 'blocking'),
      document('core', 'required'),
    ], '2026-07-26T00:00:00Z');
    expect(merged.conflicts).toEqual([]);
    expect(merged.rules[0]).toMatchObject({
      id: 'core:security',
      strength: 'blocking',
      sourceLayer: 'project',
    });
  });

  it('keeps silent weakening visible and blocking', () => {
    const merged = mergePolicies([
      document('core', 'blocking'),
      document('project', 'required'),
    ], '2026-07-26T00:00:00Z');
    expect(merged.rules[0]?.strength).toBe('blocking');
    expect(merged.conflicts).toMatchObject([
      { code: 'policy-weakening', ruleId: 'core:security' },
    ]);
  });

  it('allows a valid bounded waiver and exposes it in the merge', () => {
    const merged = mergePolicies([
      document('core', 'blocking'),
      document('project', 'required', true),
    ], '2026-07-26T00:00:00Z');
    expect(merged.conflicts).toEqual([]);
    expect(merged.rules[0]).toMatchObject({
      strength: 'required',
      waiverId: 'waiver:security-baseline',
    });
    expect(merged.waivers).toHaveLength(1);
  });

  it('does not apply a waiver before its approval date', () => {
    const project = document('project', 'required', true);
    const future = {
      ...project,
      waivers: project.waivers.map((waiver) => ({
        ...waiver,
        approvedAt: '2026-07-27T00:00:00Z',
      })),
    };
    const merged = mergePolicies([
      document('core', 'blocking'),
      future,
    ], '2026-07-26T00:00:00Z');
    expect(merged.conflicts).toMatchObject([{ code: 'policy-weakening' }]);
  });

  it('is stable when called twice with the same inputs', () => {
    const inputs = [document('core', 'required')];
    expect(mergePolicies(inputs, '2026-07-26T00:00:00Z')).toEqual(
      mergePolicies(inputs, '2026-07-26T00:00:00Z'),
    );
  });
});
