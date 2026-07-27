import { describe, expect, it } from 'vitest';
import { profileValue } from '../test/profile.js';
import { type ProfileRoutingInput, routeProfiles } from './routing.js';
import { type ProfileDocument, parseProfile } from './schema.js';

function profile(
  name: string,
  technologies: readonly string[],
  extensions: readonly string[],
  overrides: Record<string, unknown> = {},
): ProfileDocument {
  const parsed = parseProfile(profileValue({
    id: `core:${name}`,
    name,
    technologies: technologies.map((id) => ({
      id,
      minimumVersion: '0.1.0',
      maximumVersionExclusive: '100.0.0',
    })),
    detectors: {
      always: name === 'base',
      technologies,
      files: { extensions, names: [], pathSegments: [] },
    },
    patterns: [{
      id: `${name}-pattern`,
      appliesWhen: {
        technologies,
        files: { extensions, names: [], pathSegments: [] },
      },
      guidance: `Apply ${name} guidance to the matching project and files only.`,
    }],
    ...overrides,
  }));
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

const CATALOG = [
  profile('base', [], []),
  profile('typescript', ['typescript'], ['.ts', '.tsx']),
  profile('react', ['react'], ['.tsx', '.jsx', '.css']),
  profile('nextjs', ['nextjs'], ['.tsx', '.ts', '.css']),
  profile('expo', ['expo'], ['.tsx', '.ts']),
  profile('sql', ['drizzle'], ['.sql', '.ts'], {
    detectors: {
      always: false,
      technologies: ['drizzle'],
      files: { extensions: ['.sql'], names: ['schema.ts'], pathSegments: ['migrations'] },
    },
  }),
];

function input(files: readonly string[]): ProfileRoutingInput {
  return {
    schemaVersion: 1,
    status: 'complete',
    files,
    projects: [
      {
        path: '.',
        technologies: [{ id: 'typescript', version: '5.9.2', sources: ['package.json:typescript'] }],
      },
      {
        path: 'apps/web',
        technologies: [
          { id: 'nextjs', version: '16.1.0', sources: ['apps/web/package.json:next'] },
          { id: 'react', version: '19.2.0', sources: ['apps/web/package.json:react'] },
        ],
      },
      {
        path: 'apps/mobile',
        technologies: [{ id: 'expo', version: '55.0.0', sources: ['apps/mobile/package.json:expo'] }],
      },
      {
        path: 'packages/db',
        technologies: [{ id: 'drizzle', version: '0.45.0', sources: ['packages/db/package.json:drizzle-orm'] }],
      },
    ],
  };
}

function stateById(files: readonly string[]) {
  return Object.fromEntries(routeProfiles(CATALOG, input(files), {
    now: '2026-08-01T00:00:00Z',
  }).map((decision) => [decision.profileId, decision]));
}

describe('profile routing', () => {
  it('routes a web TSX change to base, TypeScript, React, and Next.js only', () => {
    const decisions = stateById(['apps/web/app/page.tsx']);

    expect(decisions['core:base']?.state).toBe('applicable');
    expect(decisions['core:typescript']?.state).toBe('applicable');
    expect(decisions['core:react']?.state).toBe('applicable');
    expect(decisions['core:nextjs']?.state).toBe('applicable');
    expect(decisions['core:expo']?.state).toBe('not-applicable');
    expect(decisions['core:sql']?.state).toBe('not-applicable');
  });

  it('does not activate SQL or migration guidance for a CSS change', () => {
    const decisions = stateById(['apps/web/styles/dashboard.css']);

    expect(decisions['core:react']?.state).toBe('applicable');
    expect(decisions['core:nextjs']?.state).toBe('applicable');
    expect(decisions['core:sql']?.state).toBe('not-applicable');
    expect(decisions['core:sql']?.activePatternIds).toEqual([]);
  });

  it('activates SQL only for a schema change owned by the data project', () => {
    const decisions = stateById(['packages/db/migrations/001_add_user.sql']);

    expect(decisions['core:sql']).toMatchObject({
      state: 'applicable',
      activePatternIds: ['sql-pattern'],
    });
    expect(decisions['core:expo']?.state).toBe('not-applicable');
    expect(decisions['core:nextjs']?.state).toBe('not-applicable');
  });

  it('keeps every not-applicable result explained and hash-bound', () => {
    const decision = stateById(['apps/web/app/page.tsx'])['core:sql'];

    expect(decision).toMatchObject({
      state: 'not-applicable',
      proof: {
        predicateId: 'profile:sql:detectors',
        inputs: expect.arrayContaining(['files:1', 'projects:4', 'status:complete']),
        inputHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
  });

  it('degrades stale or unknown-version guidance and requests source review', () => {
    const staleCatalog = CATALOG.map((item) => item.id === 'core:nextjs'
      ? profile('nextjs', ['nextjs'], ['.tsx'], { reviewedAt: '2025-01-01', expiresAfterDays: 30 })
      : item);
    const stale = routeProfiles(staleCatalog, input(['apps/web/app/page.tsx']), {
      now: '2026-08-01T00:00:00Z',
    }).find((item) => item.profileId === 'core:nextjs');
    const unknownInput: ProfileRoutingInput = {
      ...input(['apps/web/app/page.tsx']),
      projects: input(['apps/web/app/page.tsx']).projects.map((project) =>
        project.path === 'apps/web'
          ? {
              ...project,
              technologies: project.technologies.map((technology) =>
                technology.id === 'nextjs' ? { ...technology, version: null } : technology
              ),
            }
          : project
      ),
    };
    const unknown = routeProfiles(CATALOG, unknownInput, {
      now: '2026-08-01T00:00:00Z',
    }).find((item) => item.profileId === 'core:nextjs');

    expect(stale).toMatchObject({ state: 'degraded', sourceReviewRequired: true });
    expect(unknown).toMatchObject({ state: 'degraded', sourceReviewRequired: true });
  });

  it('produces a stable snapshot regardless of input ordering', () => {
    const first = routeProfiles(CATALOG, input([
      'packages/db/migrations/001_add_user.sql',
      'apps/web/app/page.tsx',
    ]), { now: '2026-08-01T00:00:00Z' });
    const reversed: ProfileRoutingInput = {
      ...input(['apps/web/app/page.tsx', 'packages/db/migrations/001_add_user.sql']),
      projects: [...input([]).projects].reverse().map((project) => ({
        ...project,
        technologies: [...project.technologies].reverse().map((technology) => ({
          ...technology,
          sources: [...technology.sources].reverse(),
        })),
      })),
    };
    const second = routeProfiles([...CATALOG].reverse(), reversed, {
      now: '2026-08-01T00:00:00Z',
    });

    expect(second).toEqual(first);
  });
});
