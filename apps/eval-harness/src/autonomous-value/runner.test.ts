import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RuntimeInvocation } from '../runtime/types.js';
import type { AutonomousValueCell } from '../types.js';
import type { ExecutorEvidenceInput } from './evidence.js';
import {
  type CellWorkspace,
  type CellWorkspaceFactory,
  createCellWorkspaceFactory,
  createConformanceCellExecutor,
  runAutonomousValueCell,
} from './runner.js';

const INVOCATION: RuntimeInvocation = {
  command: 'codex',
  args: ['exec', '--sandbox', 'workspace-write', 'task'],
};
const FIXTURE = { 'task.md': 'same' };
const FIXTURE_DIGEST = `sha256:${createHash('sha256').update(
  JSON.stringify(Object.entries(FIXTURE).sort(([left], [right]) => left.localeCompare(right))),
  'utf8',
).digest('hex')}`;

function cell(
  id: AutonomousValueCell['id'] = 'implement-agent-alone',
  startCommit = 'a'.repeat(40),
): AutonomousValueCell {
  return {
    id,
    path: 'implement',
    condition: 'agent-alone',
    startCommit,
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
    workspaceStartCommit: 'a'.repeat(40),
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
      'a'.repeat(40),
      () => ({ kind: 'complete', attempts: 1 }),
    );
    const second = workspace(
      '/tmp/cell-two',
      'a'.repeat(40),
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

  it('refuses a workspace whose starting commit differs from the frozen cell', async () => {
    let executed = false;
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
        workspace('/tmp/cell-stale-base', 'c'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
      ]),
      executor: async () => {
        executed = true;
        return observation();
      },
    });

    expect(executed).toBe(false);
    expect(result).toEqual({
      kind: 'unproducible',
      reason: 'workspace start commit mismatch',
      cleanup: { kind: 'complete', attempts: 1 },
    });
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
        workspace('/tmp/cell-failed', 'a'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
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
        workspace('/tmp/cell-unknown', 'a'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
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
        workspace('/tmp/cell-leaked', 'a'.repeat(40), () => {
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
        workspace('/tmp/cell-throws', 'a'.repeat(40), () => {
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
        workspace('/tmp/cell-live', 'a'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
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
    const realWorkspace = createCellWorkspaceFactory().create(FIXTURE);
    const result = await runAutonomousValueCell({
      cell: cell('implement-agent-alone', realWorkspace.baseSha),
      fixture: FIXTURE,
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: { create: () => realWorkspace },
      executor: async (input) => {
        writeFileSync(join(input.cwd, 'created.txt'), 'created by the cell');
        return observation();
      },
    });

    expect(result.kind).toBe('sealed');
    if (result.kind === 'sealed') expect(result.evidence.diff).toContain('created.txt');
  });

  it('refuses a fixture whose materialized contents differ from the frozen digest', async () => {
    const result = await runAutonomousValueCell({
      cell: cell(),
      fixture: { 'task.md': 'tampered' },
      runtime: {
        argv: INVOCATION,
        model: 'model',
        modelVersion: 'version',
        effort: 'high',
        artifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      workspaceFactory: factory([
        workspace('/tmp/cell-tampered', 'a'.repeat(40), () => ({ kind: 'complete', attempts: 1 })),
      ]),
      executor: async () => {
        throw new Error('executor must not run');
      },
    });

    expect(result).toEqual({
      kind: 'unproducible',
      reason: 'fixture digest mismatch',
      cleanup: { kind: 'complete', attempts: 1 },
    });
  });

  it('runs equivalent cells in separate workspaces with identical initial files', async () => {
    const firstDir = mkdtempSync(join(tmpdir(), 'void-eval-cell-one-'));
    const secondDir = mkdtempSync(join(tmpdir(), 'void-eval-cell-two-'));
    writeFileSync(join(firstDir, 'task.md'), 'same');
    writeFileSync(join(secondDir, 'task.md'), 'same');
    const workspaces = factory([
      workspace(firstDir, 'a'.repeat(40), () => {
        rmSync(firstDir, { recursive: true, force: true });
        return { kind: 'complete', attempts: 1 };
      }),
      workspace(secondDir, 'a'.repeat(40), () => {
        rmSync(secondDir, { recursive: true, force: true });
        return { kind: 'complete', attempts: 1 };
      }),
    ]);
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
          stderr: 'Authorization: Bearer process-secret\nprivate prompt data',
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
      const expectedCodexHome = process.env['CODEX_HOME']
        ?? (process.env['HOME'] === undefined ? undefined : join(process.env['HOME'], '.codex'));
      expect(received?.env?.['CODEX_HOME']).toBe(expectedCodexHome);
      expect(result.outcome.kind).toBe('failed');
      expect(result.diagnostics).not.toContain('process-secret');
      expect(result.diagnostics).not.toContain('private prompt data');
      expect(result.diagnostics).toMatch(/^runtime diagnostics withheld:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('summarizes oversized runtime events while retaining complete output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-eval-events-'));
    try {
      const execute = createConformanceCellExecutor(async () => ({
        outcome: { kind: 'exited', code: 0 },
        stdout: 'x'.repeat(64 * 1024 + 1),
        stderr: '',
      }));
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

      expect(result.output).toHaveLength(64 * 1024 + 1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatch(/^event\.oversized:sha256:[0-9a-f]{64}$/);
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
