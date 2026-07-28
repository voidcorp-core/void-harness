import { describe, expect, it } from 'vitest';
import { classifyRisk } from './classify.js';
import { deriveMissionSignals } from './predicates.js';

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

describe('deriveMissionSignals', () => {
  it('derives bounded technical-role signals from ticket and diff evidence', () => {
    const signals = deriveMissionSignals({
      ticket: 'Add a domain aggregate and expose it through an API webhook with runtime metrics.',
      files: [
        'src/domain/order.ts',
        'src/api/webhooks/order.ts',
        'docs/sdk/orders.md',
      ],
      stack: ['node', 'typescript'],
    });

    expect([...signals]).toEqual(expect.arrayContaining([
      'domain-design',
      'api-integration',
      'runtime-change',
      'devex-docs',
      'code-change',
    ]));
  });

  it('routes CSS to frontend and accessibility without fabricating migration evidence', () => {
    const signals = deriveMissionSignals({
      ticket: 'Adjust card spacing and focus styles.',
      files: ['apps/web/src/card.css'],
      stack: ['react'],
    });

    expect(signals).toEqual(expect.objectContaining({}));
    expect(signals.has('frontend-change')).toBe(true);
    expect(signals.has('accessibility')).toBe(true);
    expect(signals.has('migration')).toBe(false);
  });

  it('routes schema files to migration, observability, QA, and API integration', () => {
    const signals = deriveMissionSignals({
      ticket: 'Change the customer schema and OpenAPI contract.',
      files: ['packages/db/schema.prisma', 'openapi.yaml'],
      stack: ['postgres'],
    });

    expect(signals.has('migration')).toBe(true);
    expect(signals.has('observability')).toBe(true);
    expect(signals.has('qa')).toBe(true);
    expect(signals.has('api-integration')).toBe(true);
  });
});
