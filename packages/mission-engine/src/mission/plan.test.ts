import { describe, expect, it } from 'vitest';
import { mergePolicies } from '../policy/merge.js';
import { parsePolicy, type PolicyDocument } from '../policy/schema.js';
import { parseProfile, type ProfileDocument } from '../profile/schema.js';
import { compileMissionPlan } from './plan.js';
import type { SpecialistRoutingContract } from '../specialist/routing.js';

const PASSES = [
  'product',
  'architecture',
  'tdd',
  'qa',
  'security',
  'observability',
  'migration',
  'ux-ui',
  'accessibility',
  'performance',
  'stack-patterns',
  'pdf',
  'retrospective',
] as const;

function corePolicy(): PolicyDocument {
  const parsed = parsePolicy({
    schemaVersion: 1,
    id: 'core:quality-floor',
    version: 1,
    layer: 'core',
    rules: PASSES.map((pass) => ({
      id: `core:${pass}`,
      pass,
      strength: 'required',
      baseline: pass === 'security' || pass === 'qa',
      appliesWhen: { any: [pass] },
    })),
  });
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

const PROJECT_FIXTURES = {
  declik: {
    body: 'Build an accessible authentication UI flow with tests.',
    files: ['apps/web/src/auth.tsx', 'apps/web/src/auth.test.tsx'],
  },
  sesame: {
    body: 'Migrate multi-tenant customer data with recovery tests.',
    files: ['packages/db/migrations/tenant-data.ts'],
  },
  solaar: {
    body: 'Parse an untrusted PDF and measure the hot path.',
    files: ['src/pdf/parse.ts', 'src/pdf/parse.test.ts'],
  },
  'void-harness': {
    body: 'Add a tested CLI API module with observability.',
    files: ['packages/cli/src/api.ts', 'packages/cli/src/api.test.ts'],
  },
} as const;

function input(project: keyof typeof PROJECT_FIXTURES) {
  const fixture = PROJECT_FIXTURES[project];
  return {
    schemaVersion: 2 as const,
    ticket: {
      id: `fixture:${project}`,
      title: `Plan ${project}`,
      body: fixture.body,
    },
    diff: { files: [...fixture.files] },
    stack: { technologies: ['typescript', project] },
    policy: mergePolicies([corePolicy()], '2026-07-26T00:00:00Z'),
    specialists: { catalog: SPECIALISTS },
  };
}

const SPECIALISTS: readonly SpecialistRoutingContract[] = [
  {
    id: 'core:data-migration-engineer',
    version: 1,
    name: 'data-migration-engineer',
    stages: ['pre-implementation', 'post-implementation'],
    appliesWhen: { any: ['migration', 'profile-sql'] },
  },
  {
    id: 'core:frontend-engineer',
    version: 1,
    name: 'frontend-engineer',
    stages: ['post-implementation'],
    appliesWhen: { any: ['ux-ui', 'profile-react'] },
  },
  {
    id: 'core:pdf-specialist',
    version: 1,
    name: 'pdf-specialist',
    stages: ['pre-implementation', 'post-implementation'],
    appliesWhen: { any: ['pdf'] },
  },
];

function typescriptProfile(): ProfileDocument {
  const parsed = parseProfile({
    schemaVersion: 1,
    id: 'core:typescript',
    version: 1,
    name: 'typescript',
    technologies: [{
      id: 'typescript',
      minimumVersion: '5.0.0',
      maximumVersionExclusive: '7.0.0',
    }],
    detectors: {
      always: false,
      technologies: ['typescript'],
      files: { extensions: ['.ts'], names: [], pathSegments: [] },
    },
    sources: [{ title: 'TypeScript documentation', url: 'https://www.typescriptlang.org/docs/' }],
    reviewedAt: '2026-07-26',
    expiresAfterDays: 180,
    invariants: ['Keep strict type checking enabled.'],
    patterns: [{
      id: 'typed-source',
      appliesWhen: {
        technologies: ['typescript'],
        files: { extensions: ['.ts'], names: [], pathSegments: [] },
      },
      guidance: 'Apply typed guidance only to matching source files.',
    }],
  });
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

describe('compileMissionPlan', () => {
  it('fails closed with a migration error for legacy plans without specialist routing', () => {
    const { specialists: _specialists, ...legacy } = input('void-harness');
    expect(() => compileMissionPlan({
      ...legacy,
      schemaVersion: 1,
    } as unknown as Parameters<typeof compileMissionPlan>[0])).toThrow(
      /MISSION_INPUT_INVALID: schemaVersion must be 2/,
    );
  });

  it('gives every minimal pass an initial state and applicability proof', () => {
    const plan = compileMissionPlan(input('void-harness'), {
      generatedAt: '2026-07-26T00:00:00Z',
    });
    expect(plan.applicability.map((item) => item.pass)).toEqual(PASSES);
    expect(plan.applicability.every((item) => item.proof.inputHash !== '')).toBe(true);
    expect(plan.applicability.every((item) => item.proof.inputs.length > 0)).toBe(true);
    expect(plan.dag.nodes.map((node) => node.id)).toEqual(PASSES);
    const seen = new Set<string>();
    for (const node of plan.dag.nodes) {
      expect(node.dependsOn.every((dependency) => seen.has(dependency))).toBe(true);
      seen.add(node.id);
    }
  });

  it('keeps the plan deterministic outside generatedAt', () => {
    const first = compileMissionPlan(input('void-harness'), {
      generatedAt: '2026-07-26T00:00:00Z',
    });
    const second = compileMissionPlan(input('void-harness'), {
      generatedAt: '2026-07-26T00:01:00Z',
    });
    expect(first.planHash).toBe(second.planHash);
    expect({ ...first, generatedAt: '' }).toEqual({ ...second, generatedAt: '' });
  });

  it('canonicalizes specialist catalog and predicate ordering', () => {
    const first = input('void-harness');
    first.specialists = { catalog: [...SPECIALISTS].reverse().map((contract) => ({
      ...contract,
      appliesWhen: { any: [...contract.appliesWhen.any].reverse() },
    })) };
    const canonical = compileMissionPlan(input('void-harness'), {
      generatedAt: '2026-07-26T00:00:00Z',
    });
    const reordered = compileMissionPlan(first, {
      generatedAt: '2026-07-26T00:00:00Z',
    });

    expect(reordered.inputHash).toBe(canonical.inputHash);
    expect(reordered.planHash).toBe(canonical.planHash);
  });

  it('compiles project-scoped profile decisions into the mission plan', () => {
    const plan = compileMissionPlan({
      ...input('void-harness'),
      profiles: {
        catalog: [typescriptProfile()],
        input: {
          schemaVersion: 1,
          status: 'complete',
          files: ['packages/cli/src/api.ts'],
          projects: [{
            path: '.',
            technologies: [{
              id: 'typescript',
              version: '5.9.2',
              sources: ['package.json:typescript'],
            }],
          }],
        },
      },
      specialists: { catalog: SPECIALISTS },
    }, { generatedAt: '2026-07-26T00:00:00Z' });

    expect(plan.profiles).toEqual([
      expect.objectContaining({
        profileId: 'core:typescript',
        state: 'applicable',
        activePatternIds: ['typed-source'],
      }),
    ]);
    expect(plan.context.status).toBe('complete');
    expect(plan.specialists).toEqual([
      expect.objectContaining({ specialistId: 'core:data-migration-engineer', state: 'not-applicable' }),
      expect.objectContaining({ specialistId: 'core:frontend-engineer', state: 'not-applicable' }),
      expect.objectContaining({ specialistId: 'core:pdf-specialist', state: 'not-applicable' }),
    ]);
  });

  it('evaluates every specialist and activates schema, runtime, UI, and PDF roles narrowly', () => {
    const schema = compileMissionPlan({
      ...input('sesame'),
      specialists: { catalog: SPECIALISTS },
    }, { generatedAt: '2026-07-26T00:00:00Z' });
    const css = compileMissionPlan({
      ...input('declik'),
      ticket: { id: 'css', title: 'Polish styles', body: 'Adjust visual spacing.' },
      diff: { files: ['apps/web/src/card.css'] },
      specialists: { catalog: SPECIALISTS },
    }, { generatedAt: '2026-07-26T00:00:00Z' });
    const pdf = compileMissionPlan({
      ...input('solaar'),
      specialists: { catalog: SPECIALISTS },
    }, { generatedAt: '2026-07-26T00:00:00Z' });

    expect(schema.specialists.find((item) => item.specialistId === 'core:data-migration-engineer')?.state).toBe('applicable');
    expect(css.specialists.find((item) => item.specialistId === 'core:data-migration-engineer')?.state).toBe('not-applicable');
    expect(css.specialists.find((item) => item.specialistId === 'core:frontend-engineer')?.state).toBe('applicable');
    expect(pdf.specialists.find((item) => item.specialistId === 'core:pdf-specialist')?.state).toBe('applicable');
  });

  it('routes baseline QA and security policies into accountable specialist reviews', () => {
    const plan = compileMissionPlan({
      ...input('void-harness'),
      ticket: { id: 'docs', title: 'Fix wording', body: 'Correct contributor wording.' },
      diff: { files: ['docs/CONTRIBUTING.md'] },
      specialists: { catalog: [
        ...SPECIALISTS,
        {
          id: 'core:security-engineer',
          version: 2,
          name: 'security-engineer',
          stages: ['pre-implementation', 'post-implementation'],
          appliesWhen: { any: ['security', 'security-baseline'] },
        },
        {
          id: 'core:test-qa-engineer',
          version: 2,
          name: 'test-qa-engineer',
          stages: ['pre-implementation', 'post-implementation'],
          appliesWhen: { any: ['qa', 'qa-baseline'] },
        },
      ] },
    }, { generatedAt: '2026-07-26T00:00:00Z' });

    expect(plan.specialists.filter((item) => item.state === 'applicable').map((item) =>
      item.specialistId)).toEqual(expect.arrayContaining([
      'core:security-engineer',
      'core:test-qa-engineer',
    ]));
  });

  it.each(['declik', 'sesame', 'solaar', 'void-harness'] as const) (
    'produces a stable canonical DAG for %s',
    (project) => {
      const plan = compileMissionPlan(input(project), {
        generatedAt: '2026-07-26T00:00:00Z',
      });
      const snapshot = plan.dag.nodes.map((node) =>
        `${node.id}[${node.initialState}]<-${node.dependsOn.join(',')}`,
      );
      expect(snapshot).toMatchSnapshot();
    },
  );

  it('rejects unresolved policy conflicts', () => {
    const conflicted = input('void-harness');
    conflicted.policy = {
      ...conflicted.policy,
      conflicts: [{
        code: 'policy-weakening' as const,
        ruleId: 'core:security',
        sourcePolicyId: 'project:unsafe',
        message: 'unsafe',
      }],
    };
    expect(() => compileMissionPlan(conflicted, {
      generatedAt: '2026-07-26T00:00:00Z',
    })).toThrow(/MISSION_POLICY_CONFLICT/);
  });

  it('normalizes duplicated diff paths but rejects path escapes', () => {
    const duplicated = input('void-harness');
    duplicated.diff.files = [
      'packages/cli/src/api.ts',
      'packages/cli/src/api.ts',
      'packages/cli/src/api.test.ts',
    ];
    const canonical = compileMissionPlan(duplicated, {
      generatedAt: '2026-07-26T00:00:00Z',
    });
    expect(canonical.inputHash).toBe(compileMissionPlan(input('void-harness'), {
      generatedAt: '2026-07-26T00:00:00Z',
    }).inputHash);

    const escaped = input('void-harness');
    escaped.diff.files = ['../outside.ts'];
    expect(() => compileMissionPlan(escaped, {
      generatedAt: '2026-07-26T00:00:00Z',
    })).toThrow(/MISSION_INPUT_INVALID/);
  });

  it('stays degraded when repository context is unavailable', () => {
    const incomplete = input('void-harness');
    incomplete.diff = { files: [], status: 'unknown' as const };
    const plan = compileMissionPlan(incomplete, {
      generatedAt: '2026-07-26T00:00:00Z',
    });
    expect(plan.context).toEqual({
      status: 'degraded',
      issues: ['diff-unavailable'],
    });
    expect(plan.risk.level).toBe('unknown');
    expect(plan.applicability.find((item) => item.pass === 'migration')).toMatchObject({
      state: 'unknown',
      depth: 'unknown',
    });
  });
});
