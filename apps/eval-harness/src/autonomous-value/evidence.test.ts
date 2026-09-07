import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MAX_EVIDENCE_OUTPUT_BYTES,
  sealCellEvidence,
  validateCellInvocation,
  verifySealedCellEvidence,
  type EvidenceExpectation,
  type ExecutorEvidenceInput,
} from './evidence.js';
import type { AutonomousValueCellId } from '../types.js';
import type { RuntimeInvocation } from '../runtime/types.js';

const CELL_ID: AutonomousValueCellId = 'implement-agent-alone';
const START_COMMIT = 'a'.repeat(40);
const WORKSPACE_COMMIT = 'b'.repeat(40);
const FIXTURE_DIGEST = `sha256:${'e'.repeat(64)}`;
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const INVOCATION: RuntimeInvocation = {
  command: 'codex',
  args: ['exec', '--sandbox', 'workspace-write', 'task prompt'],
};

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function expectation(overrides: Partial<EvidenceExpectation> = {}): EvidenceExpectation {
  return {
    cellId: CELL_ID,
    startCommit: START_COMMIT,
    workspaceStartCommit: WORKSPACE_COMMIT,
    fixtureDigest: FIXTURE_DIGEST,
    artifactDigest: ARTIFACT_DIGEST,
    argv: INVOCATION,
    model: 'gpt-test',
    modelVersion: 'runtime-test-1',
    effort: 'high',
    ...overrides,
  };
}

function executorEvidence(
  overrides: Partial<ExecutorEvidenceInput> = {},
): ExecutorEvidenceInput {
  const events = ['cell.started', 'cell.completed'];
  const diff = 'diff --git a/README.md b/README.md\n';
  const output = 'completed';
  return {
    source: 'executor',
    cellId: CELL_ID,
    startCommit: START_COMMIT,
    workspaceStartCommit: WORKSPACE_COMMIT,
    fixtureDigest: FIXTURE_DIGEST,
    artifactDigest: ARTIFACT_DIGEST,
    argv: INVOCATION,
    model: 'gpt-test',
    modelVersion: 'runtime-test-1',
    effort: 'high',
    events,
    diff,
    output,
    diagnostics: 'exit status recorded',
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

describe('autonomous value evidence', () => {
  it('seals executor observations with replayable digests', () => {
    const input = executorEvidence();

    const result = sealCellEvidence(input, expectation());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('executor');
      expect(result.value.workspaceStartCommit).toBe(WORKSPACE_COMMIT);
      expect(result.value.eventsDigest).toBe(digest(JSON.stringify(input.events)));
      expect(result.value.diffDigest).toBe(digest(input.diff));
      expect(result.value.outputDigest).toBe(digest(input.output));
      expect(Object.isFrozen(result.value.events)).toBe(true);
    }
  });

  it('rejects a worker claim even when it reports a successful run', () => {
    const input = { ...executorEvidence(), source: 'worker' };

    const result = sealCellEvidence(input, expectation());

    expect(result).toEqual({ ok: false, error: { kind: 'worker-only' } });
  });

  it('rejects missing evidence fields before accepting a partial report', () => {
    const input = { ...executorEvidence() };
    const withoutEvents: Record<string, unknown> = { ...input };
    delete withoutEvents['events'];

    const result = sealCellEvidence(withoutEvents, expectation());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'missing', field: 'events' },
    });
  });

  it('rejects stale source identity and invocation metadata', () => {
    const stale = executorEvidence({ startCommit: 'd'.repeat(40) });

    const result = sealCellEvidence(stale, expectation());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'stale', field: 'startCommit' },
    });
  });

  it('rejects a sealed record from a different isolated workspace', () => {
    const stale = executorEvidence({ workspaceStartCommit: 'e'.repeat(40) });

    const result = sealCellEvidence(stale, expectation());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'stale', field: 'workspaceStartCommit' },
    });
  });

  it('rejects a contradictory success outcome', () => {
    const contradictory = executorEvidence({
      outcome: {
        kind: 'succeeded',
        exitCode: 1,
        timedOut: false,
        interrupted: false,
        childProcessAlive: false,
      },
    });

    const result = sealCellEvidence(contradictory, expectation());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'contradictory', field: 'outcome' },
    });
  });

  it('keeps interruption and incomplete cleanup explicit without turning them green', () => {
    const interrupted = executorEvidence({
      outcome: {
        kind: 'interrupted',
        exitCode: undefined,
        timedOut: false,
        interrupted: true,
        childProcessAlive: true,
      },
      cleanup: {
        kind: 'incomplete',
        attempts: 2,
        leftovers: ['workspace-child.pid'],
        detail: 'cleanup did not remove the child',
      },
    });

    const result = sealCellEvidence(interrupted, expectation());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome.kind).toBe('interrupted');
      expect(result.value.cleanup.kind).toBe('incomplete');
    }
  });

  it('rejects unbounded output and secret-shaped evidence', () => {
    const oversized = executorEvidence({ output: 'x'.repeat(MAX_EVIDENCE_OUTPUT_BYTES + 1) });
    const overflow = sealCellEvidence(oversized, expectation());
    expect(overflow).toEqual({
      ok: false,
      error: { kind: 'output-overflow', field: 'output' },
    });

    const secret = executorEvidence({ diagnostics: 'Authorization: Bearer super-secret-value' });
    const scrubbed = sealCellEvidence(secret, expectation());
    expect(scrubbed.ok).toBe(true);
    if (scrubbed.ok) {
      expect(scrubbed.value.diagnostics).not.toContain('super-secret-value');
      expect(scrubbed.value.diagnostics).toContain('[REDACTED]');
    }
  });

  it('accepts only the installed runtime executables for shell-free argv', () => {
    expect(validateCellInvocation(INVOCATION)).toBe(true);
    expect(validateCellInvocation({ command: 'sh', args: ['-c', 'echo unsafe'] })).toBe(false);
    expect(validateCellInvocation({ command: 'codex', args: ['--bad\narg'] })).toBe(false);
  });

  it('detects tampering when replay material changes after sealing', () => {
    const sealed = sealCellEvidence(executorEvidence(), expectation());
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;

    expect(verifySealedCellEvidence(sealed.value).ok).toBe(true);
    expect(verifySealedCellEvidence({ ...sealed.value, output: 'tampered' })).toEqual({
      ok: false,
      error: { kind: 'digest-mismatch', field: 'outputDigest' },
    });
    const withoutEventsDigest: Record<string, unknown> = { ...sealed.value };
    delete withoutEventsDigest['eventsDigest'];
    expect(verifySealedCellEvidence(withoutEventsDigest)).toEqual({
      ok: false,
      error: { kind: 'missing', field: 'eventsDigest' },
    });
  });
});
