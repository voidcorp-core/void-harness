import { describe, expect, it } from 'vitest';
import { classifyRisk } from './classify.js';

const HIGH_RISK_CASES = [
  ['auth', 'Change authentication and authorization'],
  ['pii', 'Process customer PII'],
  ['tenancy', 'Enforce multi-tenant isolation'],
  ['destructive-migration', 'Drop a column in a destructive migration'],
  ['upload', 'Add untrusted file upload parsing'],
  ['code-execution', 'Execute user-provided shell code'],
  ['llm-tools', 'Grant an LLM tool write permissions'],
  ['supply-chain', 'Change package lockfile and release provenance'],
] as const;

const HIGH_RISK_CASES_FR = [
  ['auth', 'Modifier l’authentification et les autorisations'],
  ['pii', 'Traiter des données personnelles client'],
  ['tenancy', 'Garantir l’isolation multi-tenancy'],
  ['destructive-migration', 'Exécuter une migration destructive'],
  ['upload', 'Ajouter un upload de document non fiable'],
  ['code-execution', 'Permettre l’exécution de code utilisateur'],
  ['llm-tools', 'Accorder des permissions aux outils LLM'],
  ['supply-chain', 'Modifier la supply-chain et la provenance'],
] as const;

describe('classifyRisk', () => {
  it.each(HIGH_RISK_CASES)('promotes %s to fortress', (predicateId, ticket) => {
    const result = classifyRisk({ ticket, files: [], stack: [] });
    expect(result.level).toBe('high');
    expect(result.requiredMode).toBe('fortress');
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ predicateId })]),
    );
  });

  it.each(HIGH_RISK_CASES_FR)(
    'promotes French %s language to fortress',
    (predicateId, ticket) => {
      const result = classifyRisk({ ticket, files: [], stack: [] });
      expect(result.level).toBe('high');
      expect(result.reasons).toEqual(
        expect.arrayContaining([expect.objectContaining({ predicateId })]),
      );
    },
  );

  it('returns unknown rather than a fabricated low risk for empty inputs', () => {
    const result = classifyRisk({ ticket: '', files: [], stack: [] });
    expect(result).toMatchObject({
      level: 'unknown',
      requiredMode: 'team',
    });
    expect(result.reasons).toHaveLength(1);
  });

  it('classifies a bounded documentation-only change as low', () => {
    const result = classifyRisk({
      ticket: 'Correct a typo in contributor documentation.',
      files: ['docs/CONTRIBUTING.md'],
      stack: ['typescript'],
    });
    expect(result).toMatchObject({ level: 'low', requiredMode: 'team' });
    expect(result.reasons).toHaveLength(1);
  });

  it('rejects huge inputs at the boundary', () => {
    expect(() => classifyRisk({
      ticket: 'x'.repeat(100_001),
      files: [],
      stack: [],
    })).toThrow(/RISK_INPUT_TOO_LARGE/);
  });
});
