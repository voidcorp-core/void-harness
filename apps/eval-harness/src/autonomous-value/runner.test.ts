import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createConformanceCellExecutor,
  createCellWorkspaceFactory,
  runAutonomousValueCell,
  type CellWorkspace,
  type CellWorkspaceFactory,
} from './runner.js';
import type { AutonomousValueCell } from '../types.js';
import type { ExecutorEvidenceInput } from './evidence.js';
import type { RuntimeInvocation } from '../runtime/types.js';

const INVOCATION: RuntimeInvocation = {
  command: 'codex',
  args: ['exec', '--sandbox', 'workspace-write', 'task'],
};
const FIXTURE = { 'task.md': 'same' };
const FIXTURE_DIGEST = `sha256:${createHash('sha256').update(
  JSON.stringify(Object.entries(FIXTURE).sort(([left], [right]) => left.localeCompare(right))),
  'utf8',
).digest('hex')}`;

function cell(id: AutonomousValueCell['id'] = 'implement-agent-alone'): AutonomousValueCell {
  return {
    id,
    path: 'implement',
    condition: 'agent-alone',
    startCommit: 'a'.repeat(40),
    objective: 'exercise the isolated cell',
    defectOracle: ['proof'],
    fixture: { path: 'autonomous-value/implement', digest: FIXTURE_DIGEST },
  };
}

function workspace(
  dir: string,
  baseSha: string,
  cleanup: CellWorkspace['cleanup'],
): CellWorkspace {
  return { dir, baseSha, diff: () => 'diff', cleanup };
}

function factory(workspaces: readonly CellWorkspace[]): CellWorkspaceFactory {
  let index = 0;
  return {
    create: () => {
      const value = workspaces[index];
      index += 1;
      if (value === undefined) throw new Error('test workspace exhausted');
      return value;
    },
  };
}

function observation(overrides: Partial<ExecutorEvidenceInput> = {}): ExecutorEvidenceInput {
  return {
    source: 'executor',
    cellId: 'implement-agent-alone',
    startCommit: 'a'.repeat(40),
    workspaceStartCommit: 'c'.repeat(40),
    fixtureDigest: FIXTURE_DIGEST,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    argv: INVOCATION,
    model: 'model',
    modelVersion: 'version',
    effort: 'high',
    events: ['started'],
    diff: 'diff',
    output: 'done',
    diagnostics: '',
    outcome: {
      kind: 'succeeded',
      exitCode: 0,
      timedOut: false,
      interrupted: false,
      childProcessAlive: false,
    },
    cleanup: { kind: 'complete', attempts: 1 },
    ...overrides,
  };
}

describe('autonomous value cell runner', () => {
  it('gives equivalent cells distinct isolated workspaces and seals executor evidence', async () => {
    const first = workspace(
      '/tmp/cell-one',
      'c'.repeat(40),
      () => ({ kind: 'complete', attempts: 1 }),
    );
    const second = workspace(
      '/tmp/cell-two',
      'c'.repeat(40),
      () => ({ kind: 'complete', attempts: 1 }),
    );
    const seen: string[] = [];
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([first, second]),
      executor: async (input) => {
        seen.push(input.cwd);
        return observation();
      },
    });
    const secondResult = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([second]),
      executor: async (input) => {
        seen.push(input.cwd);
        return observation();
      },
    });

    expect(result.kind).toBe('sealed');
    expect(secondResult.kind).toBe('sealed');
    expect(seen).toEqual(['/tmp/cell-one', '/tmp/cell-two']);
    expect(new Set(seen).size).toBe(2);
  });

  it('does not retry an executor failure and records the failed outcome', async () => {
    let calls = 0;
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-failed', 'c'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
      ]),
      executor: async () => {
        calls += 1;
        return observation({
          outcome: {
            kind: 'failed',
            exitCode: 1,
            timedOut: false,
            interrupted: false,
            childProcessAlive: false,
          },
        });
      },
    });

    expect(calls).toBe(1);
    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') expect(result.evidence.outcome.kind).toBe('failed');
  });

  it('returns an explicit unknown result when the executor is unavailable', async () => {
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-unknown', 'c'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
      ]),
      executor: async () => {
        throw new Error('runtime unavailable: token=private');
      },
    });

    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') {
      expect(result.evidence.outcome.kind).toBe('unknown');
      expect(result.evidence.diagnostics).not.toContain('private');
    }
  });

  it('keeps cleanup failure explicit after the bounded second attempt', async () => {
    let cleanupAttempts = 0;
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-leaked', 'c'.repeat(40), () => {
          cleanupAttempts += 1;
          return {
            kind: 'incomplete',
            attempts: cleanupAttempts,
            leftovers: ['child.pid'],
            detail: 'child survived',
          };
        }),
      ]),
      executor: async () => observation(),
    });

    expect(cleanupAttempts).toBe(2);
    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') expect(result.evidence.cleanup.kind).toBe('incomplete');
  });

  it('converts cleanup exceptions from both attempts into incomplete evidence', async () => {
    let cleanupAttempts = 0;
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-throws', 'c'.repeat(40), () => {
          cleanupAttempts += 1;
          throw new Error(`cleanup token=secret-${cleanupAttempts}`);
        }),
      ]),
      executor: async () => observation(),
    });

    expect(cleanupAttempts).toBe(2);
    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') {
      expect(result.evidence.cleanup.kind).toBe('incomplete');
      if (result.evidence.cleanup.kind === 'incomplete') {
        expect(result.evidence.cleanup.detail).not.toContain('secret-2');
      }
    }
  });

  it('refuses to seal a run while the executor reports a live child process', async () => {
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-live', 'c'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
      ]),
      executor: async () => observation({
        outcome: {
          kind: 'interrupted',
          exitCode: undefined,
          timedOut: false,
          interrupted: true,
          childProcessAlive: true,
          reason: 'termination failed',
        },
      }),
    });

    expect(result.kind).toBe('unproducible');
    if (result.kind === 'unproducible') {
      expect(result.outcome?.kind).toBe('interrupted');
      expect(result.cleanup.kind).toBe('incomplete');
    }
  });

  it('captures an untracked file in the real workspace diff', async () => {
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: createCellWorkspaceFactory(),
      executor: async (input) => {
        writeFileSync(join(input.cwd, 'created.txt'), 'created by the cell');
        return observation();
      },
    });

    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') expect(result.evidence.diff).toContain('created.txt');
  });

  it('runs equivalent real cells in separate workspaces with identical initial files', async () => {
    const workspaces = createCellWorkspaceFactory();
    const initial: string[] = [];
    const seen: string[] = [];
    const execute = async (input: { cwd: string }) => {
      initial.push(readFileSync(join(input.cwd, 'task.md'), 'utf8'));
      seen.push(input.cwd);
      writeFileSync(join(input.cwd, 'cell.txt'), input.cwd);
      return observation();
    };
    const input = {
      cell: cell(),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: workspaces,
      executor: execute,
    };

    const results = await Promise.all([
      runAutonomousValueCell(input),
      runAutonomousValueCell(input),
    ]);

    expect(results.every((result) => result.kind === 'sealed')).toBe(true);
    expect(initial).toEqual(['same', 'same']);
    expect(new Set(seen).size).toBe(2);
  });

  it('uses the shell-free conformance process and maps a nonzero exit to failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-eval-process-'));
    let received: {
      command: string;
      args: readonly string[];
      env?: Readonly<Record<string, string>>;
    } | undefined;
    try {
      const execute = createConformanceCellExecutor(async (options) => {
        received = options;
        return {
          outcome: { kind: 'exited', code: 1 },
          stdout: '{"type":"turn.failed"}',
          stderr: 'Authorization: Bearer process-secret',
        };
      });
      const result = await execute({
        cell: cell(),
        cwd: root,
        runtime: {
          argv: INVOCATION,
          model: 'model',
          modelVersion: 'version',
          effort: 'high',
          artifactDigest: `sha256:${'d'.repeat(64)}`,
        },
      });

      expect(received?.command).toBe('codex');
      expect(received?.args).toEqual(INVOCATION.args);
      expect(received?.env?.['HOME']).toBe(join(root, '.cell-home'));
      expect(received?.env?.['TMPDIR']).toBe(join(root, '.cell-tmp'));
      expect(result.outcome.kind).toBe('failed');
      expect(result.diagnostics).not.toContain('process-secret');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks an unapproved executable before the process boundary', async () => {
    const execute = createConformanceCellExecutor(async () => {
      throw new Error('the process boundary was reached');
    });

    await expect(execute({
      cell: cell(),
      cwd: '/tmp',
      runtime: {
        argv: { command: 'sh', args: ['-c', 'echo unsafe'] },
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
    })).rejects.toThrow(/blocked/);
  });
});
