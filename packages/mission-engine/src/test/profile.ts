export function profileValue(overrides: Record<string, unknown> = {}): unknown {
  return {
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
      files: {
        extensions: ['.ts', '.tsx'],
        names: ['tsconfig.json'],
        pathSegments: [],
      },
    },
    sources: [{ title: 'TypeScript documentation', url: 'https://www.typescriptlang.org/docs/' }],
    reviewedAt: '2026-07-27',
    expiresAfterDays: 180,
    invariants: ['Keep strict type checking enabled at trust boundaries.'],
    patterns: [{
      id: 'typed-source',
      appliesWhen: {
        technologies: ['typescript'],
        files: { extensions: ['.ts', '.tsx'], names: [], pathSegments: [] },
      },
      guidance: 'Apply TypeScript guidance only to changed typed source files.',
    }],
    ...overrides,
  };
}
