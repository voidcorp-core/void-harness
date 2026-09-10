import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '../sandbox.js';
import type { CleanupEvidence } from './evidence.js';
import type { CellWorkspace, CellWorkspaceFactory } from './runner.js';

export type DeterministicPreflightFailureStep =
  | 'artifact'
  | 'source'
  | 'fixture'
  | 'workspace'
  | 'delivery'
  | 'cleanup';

export type DeterministicPreflightResult =
  | { readonly status: 'passed'; readonly diffBytes: number; readonly cleanup: CleanupEvidence }
  | {
      readonly status: 'failed';
      readonly step: DeterministicPreflightFailureStep;
      readonly reason: string;
      readonly cleanup?: CleanupEvidence;
    };

export interface DeterministicPreflightInput {
  readonly sourceCheckout: string;
  readonly expectedStartCommit: string;
  readonly artifactTarballPath: string;
  readonly expectedArtifactDigest: string;
  readonly fixture: Readonly<Record<string, string>>;
  readonly fixtureDigest: string;
  readonly targetPath: string;
  readonly targetBefore: string;
  readonly targetAfter: string;
  readonly workspaceFactory: CellWorkspaceFactory;
  readonly readArtifactDigest?: (path: string) => string;
  readonly readSourceCommit?: (path: string) => string;
  readonly writeTarget?: (workspace: CellWorkspace, path: string, content: string) => void;
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function fixtureDigest(fixture: Readonly<Record<string, string>>): string {
  return digest(JSON.stringify(Object.entries(fixture).sort(([left], [right]) => left.localeCompare(right))));
}

function artifactDigest(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function sourceCommit(path: string): string {
  return git(path, 'rev-parse', 'HEAD').trim();
}

function writeTarget(workspace: CellWorkspace, path: string, content: string): void {
  writeFileSync(join(workspace.dir, path), content, 'utf8');
}

function clean(workspace: CellWorkspace): CleanupEvidence {
  try {
    return workspace.cleanup();
  } catch {
    return { kind: 'incomplete', attempts: 1, leftovers: ['workspace-directory'], detail: 'cleanup failed' };
  }
}

/** Verify the consumer plumbing without starting a model runtime or spending budget. */
export async function runDeterministicPreflight(
  input: DeterministicPreflightInput,
): Promise<DeterministicPreflightResult> {
  const actualArtifactDigest = (input.readArtifactDigest ?? artifactDigest)(input.artifactTarballPath);
  if (actualArtifactDigest !== input.expectedArtifactDigest) {
    return { status: 'failed', step: 'artifact', reason: 'artifact digest mismatch' };
  }
  const actualSourceCommit = (input.readSourceCommit ?? sourceCommit)(input.sourceCheckout);
  if (actualSourceCommit !== input.expectedStartCommit) {
    return { status: 'failed', step: 'source', reason: 'source commit mismatch' };
  }
  if (fixtureDigest(input.fixture) !== input.fixtureDigest) {
    return { status: 'failed', step: 'fixture', reason: 'fixture digest mismatch' };
  }
  if (input.fixture[input.targetPath] !== input.targetBefore || input.targetAfter === input.targetBefore) {
    return { status: 'failed', step: 'fixture', reason: 'controlled target is invalid' };
  }

  let workspace: CellWorkspace;
  try {
    workspace = input.workspaceFactory.create(input.fixture);
  } catch {
    return { status: 'failed', step: 'workspace', reason: 'workspace creation failed' };
  }
  if (workspace.baseSha !== input.expectedStartCommit) {
    const cleanup = clean(workspace);
    return { status: 'failed', step: 'source', reason: 'workspace commit mismatch', cleanup };
  }

  try {
    (input.writeTarget ?? writeTarget)(workspace, input.targetPath, input.targetAfter);
    const diff = workspace.diff();
    const cleanup = clean(workspace);
    if (cleanup.kind !== 'complete') {
      return { status: 'failed', step: 'cleanup', reason: 'workspace cleanup incomplete', cleanup };
    }
    if (diff.trim() === '') {
      return { status: 'failed', step: 'delivery', reason: 'controlled diff is empty', cleanup };
    }
    return { status: 'passed', diffBytes: Buffer.byteLength(diff, 'utf8'), cleanup };
  } catch {
    const cleanup = clean(workspace);
    return { status: 'failed', step: 'delivery', reason: 'controlled delivery failed', cleanup };
  }
}
