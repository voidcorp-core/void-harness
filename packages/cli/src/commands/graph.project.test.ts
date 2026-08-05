import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphSnapshotV3 } from '@voidcorp/harness-graph';
import type { ProjectGraphStore } from '../lib/project-graph-store.js';
import { ProjectGraphStoreError } from '../lib/project-graph-store.js';
import { graph } from './graph.js';

const PROVENANCE = {
  origin: 'extracted' as const,
  confidence: 1,
  sources: [{ kind: 'path' as const, ref: 'src/app.ts', hashOrVersion: 'h' }],
};
const APP = 'project:file:src/app.ts';
const CORE = 'project:file:src/core.ts';

function snapshot(): GraphSnapshotV3 {
  return {
    schemaVersion: 3,
    graphId: 'project:current',
    graphType: 'project',
    source: { kind: 'native', version: 'v3+project.1', rootHash: 'sha256:aaa' },
    nodes: [
      { id: APP, kind: 'file', label: 'app.ts', data: {}, provenance: PROVENANCE },
      { id: CORE, kind: 'file', label: 'core.ts', data: {}, provenance: PROVENANCE },
    ],
    edges: [
      { id: 'e1', kind: 'imports', from: APP, to: CORE, data: {}, provenance: PROVENANCE },
    ],
    hyperedges: [],
  };
}

function store(overrides: Partial<ProjectGraphStore> = {}): ProjectGraphStore {
  return {
    root: process.cwd(),
    graph: snapshot(),
    state: 'fresh',
    observation: { rootHash: 'sha256:aaa', complete: true },
    issues: [],
    ...overrides,
  };
}

let out = '';
let exitCode: number | undefined;

beforeEach(() => {
  out = '';
  exitCode = undefined;
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    out += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error(`exit:${code}`);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runGraph(args: readonly string[], opened: ProjectGraphStore | Error = store()) {
  try {
    await graph(args, {
      openProjectGraph: async () => {
        if (opened instanceof Error) throw opened;
        return opened;
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('exit:')) throw error;
  }
}

describe('graph <project query>', () => {
  it('answers impact in repository paths', async () => {
    await runGraph(['impact', 'src/core.ts']);

    expect(out).toContain('src/app.ts');
    expect(exitCode).toBeUndefined();
  });

  it('leaves an unknown subcommand to the existing usage error, exit 2', async () => {
    await runGraph(['nonsense']);

    expect(exitCode).toBe(2);
  });

  it('refuses a target outside the project root with problem and fix, exit 2', async () => {
    await runGraph(['impact', '../../etc/passwd']);

    expect(out).toMatch(/outside the project/i);
    expect(out).toMatch(/relative to the project root/i);
    expect(exitCode).toBe(2);
  });

  it('reports a missing target as unknown, not as an empty answer, and still exits 0', async () => {
    await runGraph(['impact', 'src/gone.ts']);

    expect(out).toMatch(/not in this graph/i);
    expect(exitCode).toBeUndefined();
  });

  it('names the source fallback when the build was partial', async () => {
    await runGraph(
      ['impact', 'src/core.ts'],
      store({ state: 'partial', observation: { rootHash: 'sha256:aaa', complete: false } }),
    );

    expect(out).toMatch(/fallback/i);
    expect(out).toMatch(/read source/i);
    // The bounded answer it does have is still shown.
    expect(out).toContain('src/app.ts');
  });

  it('says an answer was truncated rather than showing a short list as complete', async () => {
    await runGraph(['impact', 'src/core.ts', '--max-nodes', '0']);

    expect(out).toMatch(/truncated/i);
  });

  it('rejects an unknown option with a correction, exit 2', async () => {
    await runGraph(['impact', 'src/core.ts', '--depth', '3']);

    expect(out).toMatch(/--depth/);
    expect(exitCode).toBe(2);
  });

  it('rejects a non-numeric budget instead of silently using the default', async () => {
    await runGraph(['impact', 'src/core.ts', '--max-depth', 'deep']);

    expect(out).toMatch(/--max-depth/);
    expect(exitCode).toBe(2);
  });

  it('rejects a budget parseInt would silently truncate, such as 1e9 or 12abc', async () => {
    await runGraph(['impact', 'src/core.ts', '--max-nodes', '1e9']);

    expect(out).toMatch(/1e9/);
    expect(exitCode).toBe(2);
  });

  it('reports staleness without a target', async () => {
    await runGraph(['staleness']);

    expect(out).toMatch(/sha256:aaa/);
  });

  it('turns a store that cannot be opened into a problem and a fix, exit 1', async () => {
    await runGraph(
      ['impact', 'src/core.ts'],
      new ProjectGraphStoreError('could not build the project graph', 'check the path'),
    );

    expect(out).toMatch(/could not build/i);
    expect(out).toMatch(/check the path/i);
    expect(exitCode).toBe(1);
  });

  it('answers path between two files', async () => {
    await runGraph(['path', 'src/app.ts', 'src/core.ts']);

    expect(out).toContain('src/core.ts');
  });

  it('asks for both ends when path got one, exit 2', async () => {
    await runGraph(['path', 'src/app.ts']);

    expect(out).toMatch(/two files/i);
    expect(exitCode).toBe(2);
  });
});
