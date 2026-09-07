import { collectFiles, git, setupSandbox } from '../sandbox.js';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { AutonomousValueCell } from '../types.js';
import type { RuntimeInvocation } from '../runtime/types.js';
import {
  sealCellEvidence,
  validateCellInvocation,
  type CellExecutionOutcome,
  type CleanupEvidence,
  type ExecutorEvidenceInput,
  type EvidenceResult,
  type SealedCellEvidence,
} from './evidence.js';

// @ts-expect-error -- shared JS conformance helper, no type declarations.
import { runConformanceProcess } from '../../../../packages/cli/scripts/conformance-process.mjs';
// @ts-expect-error -- shared JS conformance helper, no type declarations.
import { safeConformanceDiagnostic } from '../../../../packages/cli/scripts/conformance-process.mjs';

const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 15 * 60 * 1_000;
const MAX_FIXTURE_FILES = 256;
const MAX_FIXTURE_BYTES = 4 * 1024 * 1024;
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_EVENTS = 1_024;

export interface CellRuntimeConfiguration {
  readonly argv: RuntimeInvocation;
  readonly model: string;
  readonly modelVersion: string;
  readonly effort: string;
  readonly artifactDigest: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

type ExecutorObservationFields =
  | 'source'
  | 'argv'
  | 'model'
  | 'modelVersion'
  | 'effort'
  | 'events'
  | 'output'
  | 'diagnostics'
  | 'outcome';

export type CellExecutorObservation = Pick<ExecutorEvidenceInput, ExecutorObservationFields>;

export interface CellExecutorInput {
  readonly cell: AutonomousValueCell;
  readonly cwd: string;
  readonly runtime: CellRuntimeConfiguration;
}

export type CellExecutor = (input: CellExecutorInput) => Promise<CellExecutorObservation>;

export interface CellWorkspace {
  readonly dir: string;
  readonly baseSha: string;
  readonly diff: () => string;
  readonly cleanup: () => CleanupEvidence;
}

export interface CellWorkspaceFactory {
  readonly create: (fixture: Readonly<Record<string, string>>) => CellWorkspace;
}

export type CellRunResult =
  | { readonly kind: 'sealed'; readonly evidence: SealedCellEvidence }
  | {
      readonly kind: 'unproducible';
      readonly reason: string;
      readonly cleanup: CleanupEvidence;
      readonly outcome?: CellExecutionOutcome;
    };

interface ConformanceProcessResult {
  readonly outcome:
    | { readonly kind: 'exited'; readonly code: number | undefined }
    | { readonly kind: 'timed-out' }
    | { readonly kind: 'output-exceeded' }
    | { readonly kind: 'spawn-error'; readonly message: string }
    | { readonly kind: 'signaled'; readonly signal: string }
    | { readonly kind: 'termination-failed'; readonly trigger: string };
  readonly stdout: string;
  readonly stderr: string;
}

interface ConformanceProcessRunner {
  (options: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly input: string;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly env?: Readonly<Record<string, string>>;
  }): Promise<ConformanceProcessResult>;
}

const conformanceRunner: ConformanceProcessRunner = runConformanceProcess;

function safeCleanupDetail(value: unknown): string {
  const detail = value instanceof Error ? value.message : 'cleanup failed';
  return detail.replace(/[\0\r\n]/g, ' ').slice(0, 512) || 'cleanup failed';
}

function validateFixture(fixture: Readonly<Record<string, string>>): void {
  const entries = Object.entries(fixture);
  const totalBytes = entries.reduce(
    (total, [, content]) => total + Buffer.byteLength(content, 'utf8'),
    0,
  );
  if (
    entries.length === 0
    || entries.length > MAX_FIXTURE_FILES
    || totalBytes > MAX_FIXTURE_BYTES
  ) {
    throw new Error('fixture is not bounded');
  }
  for (const [path, content] of entries) {
    const segments = path.split('/');
    if (
      path.length === 0
      || path.length > 512
      || path.includes('\\')
      || /^[A-Za-z]:[\\/]/.test(path)
      || path.startsWith('/')
      || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
      || Buffer.byteLength(content, 'utf8') > 512 * 1024
      || content.includes('\0')
    ) throw new Error('fixture path or content is invalid');
  }
}

function fixtureDigest(fixture: Readonly<Record<string, string>>): string {
  const canonical = JSON.stringify(
    Object.entries(fixture).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function digestText(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function runtimeEvents(output: string): readonly string[] {
  const lines = output.split('\n').filter((line) => line !== '');
  const summarized = lines.map((line) => Buffer.byteLength(line, 'utf8') <= MAX_EVENT_BYTES
    ? line
    : `event.oversized:${digestText(line)}`);
  if (summarized.length <= MAX_EVENTS) return summarized;
  const prefix = summarized.slice(0, MAX_EVENTS - 1);
  return [
    ...prefix,
    `events.truncated:${summarized.length}:${digestText(output)}`,
  ];
}

function cleanupWorkspace(workspace: CellWorkspace): CleanupEvidence {
  let first: CleanupEvidence;
  try {
    first = workspace.cleanup();
  } catch (error) {
    first = {
      kind: 'incomplete',
      attempts: 1,
      leftovers: ['workspace-directory'],
      detail: safeCleanupDetail(error),
    };
  }
  if (first.kind === 'complete') return first;
  let second: CleanupEvidence;
  try {
    second = workspace.cleanup();
  } catch (error) {
    second = {
      kind: 'incomplete',
      attempts: 2,
      leftovers: ['workspace-directory'],
      detail: safeCleanupDetail(error),
    };
  }
  return second.kind === 'complete'
    ? { ...second, attempts: 2 }
    : { ...second, attempts: 2, detail: safeCleanupDetail(second.detail) };
}

function boundedRuntimeValue(value: number | undefined, fallback: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(value, maximum))
    : fallback;
}

function unavailableObservation(
  cell: AutonomousValueCell,
  runtime: CellRuntimeConfiguration,
  error: unknown,
): CellExecutorObservation {
  const detail = safeConformanceDiagnostic(
    error instanceof Error ? error.message : 'runtime unavailable',
  );
  return {
    source: 'executor',
    argv: runtime.argv,
    model: runtime.model,
    modelVersion: runtime.modelVersion,
    effort: runtime.effort,
    events: [],
    output: '',
    diagnostics: detail,
    outcome: {
      kind: 'unknown',
      exitCode: undefined,
      timedOut: false,
      interrupted: false,
      childProcessAlive: false,
      reason: `${cell.id} runtime unavailable`,
    },
  };
}

function outcomeFromConformance(
  result: ConformanceProcessResult,
): CellExecutionOutcome {
  switch (result.outcome.kind) {
    case 'exited': {
      const exitCode = typeof result.outcome.code === 'number'
        ? result.outcome.code
        : undefined;
      if (exitCode === 0) {
        return {
          kind: 'succeeded',
          exitCode: 0,
          timedOut: false,
          interrupted: false,
          childProcessAlive: false,
        };
      }
      return {
        kind: 'failed',
        exitCode,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
        reason: `process exited ${String(exitCode)}`,
      };
    }
    case 'timed-out':
      return {
        kind: 'timed-out',
        exitCode: undefined,
        timedOut: true,
        interrupted: false,
        childProcessAlive: false,
        reason: 'process timed out',
      };
    case 'termination-failed':
      return {
        kind: 'interrupted',
        exitCode: undefined,
        timedOut: false,
        interrupted: true,
        childProcessAlive: true,
        reason: 'process-tree termination failed',
      };
    case 'signaled':
      return {
        kind: 'interrupted',
        exitCode: undefined,
        timedOut: false,
        interrupted: true,
        childProcessAlive: false,
        reason: `process signaled ${result.outcome.signal}`,
      };
    case 'output-exceeded':
      return {
        kind: 'unknown',
        exitCode: undefined,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
        reason: 'bounded output exceeded',
      };
    case 'spawn-error':
      return {
        kind: 'unknown',
        exitCode: undefined,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
        reason: 'runtime could not start',
      };
    default: {
      const exhaustive: never = result.outcome;
      return {
        kind: 'unknown',
        exitCode: undefined,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
        reason: `unhandled runtime outcome ${String(exhaustive)}`,
      };
    }
  }
}

export function createConformanceCellExecutor(
  runProcess: ConformanceProcessRunner = conformanceRunner,
): CellExecutor {
  return async ({ cell, cwd, runtime }) => {
    if (!validateCellInvocation(runtime.argv)) {
      throw new Error(`${cell.id} runtime invocation is blocked`);
    }
    const home = join(cwd, '.cell-home');
    const temporary = join(cwd, '.cell-tmp');
    mkdirSync(home, { recursive: true });
    mkdirSync(temporary, { recursive: true });
    const result = await runProcess({
      command: runtime.argv.command,
      args: runtime.argv.args,
      cwd,
      input: '',
      timeoutMs: boundedRuntimeValue(runtime.timeoutMs, 120_000, MAX_TIMEOUT_MS),
      maxOutputBytes: boundedRuntimeValue(
        runtime.maxOutputBytes,
        MAX_PROCESS_OUTPUT_BYTES,
        MAX_PROCESS_OUTPUT_BYTES,
      ),
      env: {
        HOME: home,
        TMPDIR: temporary,
        ...(process.env['CODEX_HOME'] !== undefined
          ? { CODEX_HOME: process.env['CODEX_HOME'] }
          : process.env['HOME'] === undefined
            ? {}
            : { CODEX_HOME: join(process.env['HOME'], '.codex') }),
      },
    });
    const events = runtimeEvents(result.stdout);
    return {
      source: 'executor',
      argv: runtime.argv,
      model: runtime.model,
      modelVersion: runtime.modelVersion,
      effort: runtime.effort,
      events,
      output: result.stdout,
      diagnostics: safeConformanceDiagnostic(result.stderr),
      outcome: outcomeFromConformance(result),
    };
  };
}

export function createCellWorkspaceFactory(): CellWorkspaceFactory {
  return {
    create(fixture) {
      validateFixture(fixture);
      const sandbox = setupSandbox(fixture);
      let cleaned = false;
      return {
        dir: sandbox.dir,
        baseSha: sandbox.baseSha,
        diff: () => {
          const tracked = git(sandbox.dir, 'diff', '--binary', sandbox.baseSha);
          const untracked = git(sandbox.dir, 'ls-files', '--others', '--exclude-standard', '-z')
            .split('\0')
            .filter((path) => path !== '')
            .sort();
          if (untracked.length === 0) return tracked;
          const files = collectFiles(sandbox.dir);
          const additions = untracked.map((path) => {
            const content = files[path];
            if (content === undefined) throw new Error(`untracked file '${path}' is not readable`);
            return `\n--- untracked ${path} ---\n${content}`;
          });
          return `${tracked}${additions.join('')}`;
        },
        cleanup: () => {
          if (cleaned) return { kind: 'complete', attempts: 1 };
          try {
            rmSync(sandbox.dir, { recursive: true, force: true });
            cleaned = !existsSync(sandbox.dir);
            return cleaned
              ? { kind: 'complete', attempts: 1 }
              : {
                  kind: 'incomplete',
                  attempts: 1,
                  leftovers: ['workspace-directory'],
                  detail: 'workspace directory remains',
                };
          } catch (error) {
            return {
              kind: 'incomplete',
              attempts: 1,
              leftovers: ['workspace-directory'],
              detail: safeCleanupDetail(error),
            };
          }
        },
      };
    },
  };
}

function sealResult(
  observation: CellExecutorObservation,
  cell: AutonomousValueCell,
  runtime: CellRuntimeConfiguration,
  workspace: CellWorkspace,
  diff: string,
  cleanup: CleanupEvidence,
  observedFixtureDigest: string,
): CellRunResult {
  const result: EvidenceResult = sealCellEvidence({
    ...observation,
    cellId: cell.id,
    startCommit: cell.startCommit,
    workspaceStartCommit: workspace.baseSha,
    fixtureDigest: observedFixtureDigest,
    artifactDigest: runtime.artifactDigest,
    diff,
    cleanup,
  }, {
    cellId: cell.id,
    startCommit: cell.startCommit,
    workspaceStartCommit: workspace.baseSha,
    fixtureDigest: observedFixtureDigest,
    artifactDigest: runtime.artifactDigest,
    argv: runtime.argv,
    model: runtime.model,
    modelVersion: runtime.modelVersion,
    effort: runtime.effort,
  });
  return result.ok
    ? { kind: 'sealed', evidence: result.value }
    : {
        kind: 'unproducible',
        reason: `evidence refused: ${result.error.kind}${'field' in result.error ? ` (${result.error.field})` : ''}`,
        cleanup,
        outcome: observation.outcome,
      };
}

export async function runAutonomousValueCell(input: {
  readonly cell: AutonomousValueCell;
  readonly fixture: Readonly<Record<string, string>>;
  readonly runtime: CellRuntimeConfiguration;
  readonly executor: CellExecutor;
  readonly workspaceFactory?: CellWorkspaceFactory;
}): Promise<CellRunResult> {
  const workspace = (input.workspaceFactory ?? createCellWorkspaceFactory()).create(input.fixture);
  const observedFixtureDigest = fixtureDigest(input.fixture);
  if (observedFixtureDigest !== input.cell.fixture.digest) {
    const cleanup = cleanupWorkspace(workspace);
    return { kind: 'unproducible', reason: 'fixture digest mismatch', cleanup };
  }
  let observation: CellExecutorObservation;
  try {
    observation = await input.executor({
      cell: input.cell,
      cwd: workspace.dir,
      runtime: input.runtime,
    });
  } catch (error) {
    observation = unavailableObservation(input.cell, input.runtime, error);
  }

  let diff: string;
  try {
    diff = workspace.diff();
  } catch {
    const cleanup = cleanupWorkspace(workspace);
    return {
      kind: 'unproducible',
      reason: 'diff could not be collected',
      cleanup,
      outcome: {
        kind: 'unknown',
        exitCode: undefined,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
        reason: 'diff could not be collected',
      },
    };
  }
  const cleanup = cleanupWorkspace(workspace);
  if (observation.outcome.childProcessAlive) {
    const incompleteCleanup: CleanupEvidence = cleanup.kind === 'complete'
      ? {
          kind: 'incomplete',
          attempts: cleanup.attempts,
          leftovers: ['live-process'],
          detail: 'child process remains alive',
        }
      : {
          ...cleanup,
          leftovers: [...cleanup.leftovers, 'live-process'].slice(0, 32),
          detail: 'child process remains alive',
        };
    return {
      kind: 'unproducible',
      reason: 'child process remains alive',
      cleanup: incompleteCleanup,
      outcome: observation.outcome,
    };
  }
  return sealResult(
    observation,
    input.cell,
    input.runtime,
    workspace,
    diff,
    cleanup,
    observedFixtureDigest,
  );
}
