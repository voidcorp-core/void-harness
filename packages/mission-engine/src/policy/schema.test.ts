import { describe, expect, it } from 'vitest';
import {
  MAX_POLICY_RULES,
  parsePolicy,
  type PolicyDocument,
} from './schema.js';

function policy(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: 'core:quality-floor',
    version: 1,
    layer: 'core',
    rules: [
      {
        id: 'core:security',
        pass: 'security',
        strength: 'required',
        baseline: true,
        appliesWhen: { any: ['trust-boundary'] },
      },
    ],
    ...overrides,
  };
}

describe('parsePolicy', () => {
  it('accepts a bounded versioned policy', () => {
    const parsed = parsePolicy(policy());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.id).toBe('core:quality-floor');
  });

  it.each([
    ['nil', null],
    ['empty', {}],
    ['wrong-role', policy({
      rules: [{
        id: 'core:unknown',
        pass: 'unbounded-generalist',
        strength: 'required',
        baseline: true,
      }],
    })],
    ['duplicate', policy({
      rules: [
        {
          id: 'core:security',
          pass: 'security',
          strength: 'required',
          baseline: true,
        },
        {
          id: 'core:security',
          pass: 'qa',
          strength: 'required',
          baseline: true,
        },
      ],
    })],
    ['huge', policy({
      rules: Array.from({ length: MAX_POLICY_RULES + 1 }, (_, index) => ({
        id: `project:rule-${index}`,
        pass: 'qa',
        strength: 'required',
        baseline: true,
      })),
    })],
  ])('rejects %s input', (_name, input) => {
    expect(parsePolicy(input)).toMatchObject({ ok: false });
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    expect(parsePolicy(policy({ surprise: true }))).toMatchObject({
      ok: false,
      issue: { code: 'invalid-policy' },
    });
  });

  it('requires waivers to carry an approval date', () => {
    expect(parsePolicy(policy({
      waivers: [{
        id: 'waiver:security',
        ruleId: 'core:security',
        reason: 'Temporary compatibility window.',
        approvedBy: 'security-owner',
        expiresAt: '2026-08-01T00:00:00Z',
      }],
    }))).toMatchObject({ ok: false });
  });

  it('returns an immutable canonical value', () => {
    const parsed = parsePolicy(policy());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const value: PolicyDocument = parsed.value;
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.rules)).toBe(true);
  });
});
