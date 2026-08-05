import { describe, expect, it } from 'vitest';
import type { GraphSnapshotV3 } from '@voidcorp/harness-graph';
import {
  openProjectGraphStore,
  runProjectQuery,
  type ProjectGraphStore,
} from './project-graph-store.js';

const PROVENANCE = {
  origin: 'extracted' as const,
  confidence: 1,
  sources: [{ kind: 'path' as const, ref: 'packages/app/src/index.ts', hashOrVersion: 'h' }],
};

function node(id: string, kind: string, label: string) {
  return { id, kind, label, data: {}, provenance: PROVENANCE };
}
function edge(kind: string, from: string, to: string) {
  return { id: `${kind}:${from}->${to}`, kind, from, to, data: {}, provenance: PROVENANCE };
}

const APP = 'project:file:packages/app/src/index.ts';
const CORE = 'project:file:packages/core/src/index.ts';
const SPEC = 'project:file:packages/app/src/index.spec.ts';
const OWNER = 'project:owner:h-0badc0de';

/** app imports core; the spec exercises app; git attributes app to a hashed owner id. */
function graph(): GraphSnapshotV3 {
  return {
    schemaVersion: 3,
    graphId: 'project:current',
    graphType: 'project',
    source: { kind: 'native', version: 'v3+project.1', rootHash: 'sha256:aaa' },
    nodes: [
      node(APP, 'file', 'index.ts'),
      node(CORE, 'file', 'index.ts'),
      node(SPEC, 'test', 'index.spec.ts'),
      node(OWNER, 'owner', 'Ada Lovelace'),
    ],
    edges: [
      edge('imports', APP, CORE),
      edge('tests', SPEC, APP),
      edge('owned-by', APP, OWNER),
    ],
    hyperedges: [],
  };
}

function store(overrides: Partial<ProjectGraphStore> = {}): ProjectGraphStore {
  return {
    root: '/repo',
    graph: graph(),
    state: 'fresh',
    observation: { rootHash: 'sha256:aaa', complete: true },
    issues: [],
    ...overrides,
  };
}

describe('runProjectQuery — targets', () => {
  it('takes repository-relative paths and answers in paths, not internal ids', () => {
    const report = runProjectQuery(store(), {
      name: 'impact',
      targets: ['packages/core/src/index.ts'],
    });

    expect(report.answers).toEqual(['packages/app/src/index.ts', 'packages/app/src/index.spec.ts']);
  });

  it('refuses a target that escapes the project root, with a correction', () => {
    const report = runProjectQuery(store(), { name: 'impact', targets: ['../../etc/passwd'] });

    expect(report.error?.problem).toMatch(/outside the project/i);
    expect(report.error?.fix).toMatch(/relative/i);
    expect(report.answers).toEqual([]);
  });

  it('refuses an absolute target outside the project root', () => {
    const report = runProjectQuery(store(), { name: 'impact', targets: ['/etc/passwd'] });

    expect(report.error?.problem).toMatch(/outside the project/i);
  });

  it('accepts an absolute target inside the project root', () => {
    const report = runProjectQuery(store(), {
      name: 'impact',
      targets: ['/repo/packages/core/src/index.ts'],
    });

    expect(report.error).toBeUndefined();
    expect(report.answers).toContain('packages/app/src/index.ts');
  });

  it('says which path is missing rather than answering an empty impact', () => {
    const report = runProjectQuery(store(), { name: 'impact', targets: ['packages/gone.ts'] });

    expect(report.unknown).toMatch(/packages\/gone\.ts/);
    expect(report.answers).toEqual([]);
  });

  it('reports a usage error when a query needs a target and got none', () => {
    const report = runProjectQuery(store(), { name: 'impact', targets: [] });

    expect(report.error?.problem).toMatch(/needs a file/i);
    expect(report.error?.fix).toContain('impact');
  });

  it('reports a usage error when path did not get both ends', () => {
    const report = runProjectQuery(store(), {
      name: 'path',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.error?.problem).toMatch(/two files/i);
  });
});

describe('runProjectQuery — the seven queries', () => {
  it('explains a node with its provenance and edge counts', () => {
    const report = runProjectQuery(store(), {
      name: 'explain',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.answers.join(' ')).toMatch(/file/);
    expect(report.answers.join(' ')).toMatch(/extracted/);
  });

  it('renders a path as the files it walks through', () => {
    const report = runProjectQuery(store(), {
      name: 'path',
      targets: ['packages/app/src/index.ts', 'packages/core/src/index.ts'],
    });

    expect(report.answers).toEqual(['packages/app/src/index.ts', 'packages/core/src/index.ts']);
  });

  it('reports no path as unknown rather than as an empty answer', () => {
    const report = runProjectQuery(store(), {
      name: 'path',
      targets: ['packages/core/src/index.ts', 'packages/app/src/index.ts'],
    });

    expect(report.answers).toEqual([]);
    expect(report.unknown).toMatch(/no dependency path/i);
  });

  it('lists a subgraph as its files', () => {
    const report = runProjectQuery(store(), {
      name: 'subgraph',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.answers).toContain('packages/core/src/index.ts');
  });

  it('renders owners by their readable label, never by the hashed id', () => {
    const report = runProjectQuery(store(), {
      name: 'owners',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.answers).toEqual(['Ada Lovelace']);
  });

  it('passes an unknown owner answer through with its reason', () => {
    const report = runProjectQuery(store(), {
      name: 'owners',
      targets: ['packages/core/src/index.ts'],
    });

    expect(report.answers).toEqual([]);
    expect(report.unknown).toMatch(/no ownership/i);
  });

  it('answers tests-for with the covering test file', () => {
    const report = runProjectQuery(store(), {
      name: 'tests-for',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.answers).toEqual(['packages/app/src/index.spec.ts']);
  });

  it('answers staleness without a target', () => {
    const report = runProjectQuery(store(), { name: 'staleness', targets: [] });

    expect(report.error).toBeUndefined();
    expect(report.fallback).toBeUndefined();
    expect(report.answers.join(' ')).toMatch(/current/i);
  });
});

describe('runProjectQuery — budget and fallback', () => {
  it('reports truncation instead of a silently short answer', () => {
    const report = runProjectQuery(store(), {
      name: 'impact',
      targets: ['packages/core/src/index.ts'],
      budget: { maxNodes: 1, maxDepth: 4 },
    });

    expect(report.truncated).toBe(true);
    expect(report.answers).toHaveLength(1);
  });

  it('falls back to source when the root hash moved under the graph', () => {
    const report = runProjectQuery(
      store({ observation: { rootHash: 'sha256:bbb', complete: true } }),
      { name: 'impact', targets: ['packages/core/src/index.ts'] },
    );

    expect(report.fallback).toMatch(/root hash moved/i);
  });

  it('falls back to source on a partial build, which looks current but omits paths', () => {
    const report = runProjectQuery(store({ state: 'partial', observation: { rootHash: 'sha256:aaa', complete: false } }), {
      name: 'impact',
      targets: ['packages/core/src/index.ts'],
    });

    expect(report.fallback).toMatch(/partial/i);
    // The answer it does have is still returned: a fallback is a warning about
    // completeness, not a reason to withhold what was extracted.
    expect(report.answers.length).toBeGreaterThan(0);
  });

  it('names what was left out, so a 7-file gap does not discredit 3000 good files', () => {
    const report = runProjectQuery(
      store({
        state: 'partial',
        observation: { rootHash: 'sha256:aaa', complete: false },
        issues: [
          { code: 'oversized-file', path: 'packages/big/a.ts', message: 'over the byte budget' },
          { code: 'oversized-file', path: 'packages/big/b.ts', message: 'over the byte budget' },
          { code: 'invalid-source', path: 'apps/x/env.d.ts', message: '1 parse diagnostic' },
        ],
      }),
      { name: 'impact', targets: ['packages/core/src/index.ts'] },
    );

    expect(report.fallback).toMatch(/3 path/);
    expect(report.fallback).toMatch(/oversized-file/);
    expect(report.fallback).toContain('packages/big/a.ts');
  });

  it('falls back on a degraded build even when the observation looks complete', () => {
    const report = runProjectQuery(store({ state: 'degraded' }), {
      name: 'tests-for',
      targets: ['packages/app/src/index.ts'],
    });

    expect(report.fallback).toBeDefined();
  });

  it('never mutates the graph it reads', () => {
    const opened = store();
    const before = JSON.stringify(opened.graph);
    for (const name of ['explain', 'impact', 'subgraph', 'owners', 'tests-for', 'staleness'] as const) {
      runProjectQuery(opened, { name, targets: ['packages/app/src/index.ts'] });
    }
    expect(JSON.stringify(opened.graph)).toBe(before);
  });
});

describe('openProjectGraphStore', () => {
  it('carries the build state and observation the queries need', async () => {
    const opened = await openProjectGraphStore('/repo', {
      build: async () => ({ graph: graph(), state: 'fresh' as const, issues: [] }),
    });

    expect(opened.observation).toEqual({ rootHash: 'sha256:aaa', complete: true });
    expect(opened.state).toBe('fresh');
  });

  it('marks a partial build as incomplete, so every query falls back', async () => {
    const opened = await openProjectGraphStore('/repo', {
      build: async () => ({
        graph: graph(),
        state: 'partial' as const,
        issues: [
          { code: 'file-limit' as const, path: 'packages/app', message: 'file budget reached' },
        ],
      }),
    });

    expect(opened.observation.complete).toBe(false);
    expect(runProjectQuery(opened, { name: 'staleness', targets: [] }).fallback).toBeDefined();
  });

  it('turns a failed build into an actionable error, not a stack trace', async () => {
    await expect(
      openProjectGraphStore('/repo', {
        build: async () => {
          throw new Error('ENOENT: no such file or directory');
        },
      }),
    ).rejects.toMatchObject({
      problem: expect.stringMatching(/could not build/i),
      fix: expect.stringMatching(/./),
    });
  });
});
