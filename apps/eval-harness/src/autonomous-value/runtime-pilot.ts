import { createHash } from 'node:crypto';
import type { PilotCampaignCellRunInput, PilotCampaignResult } from './campaign.js';
import { buildConsumerPrompt, buildConsumerRuntimeInvocation } from './consumer.js';
import { type DurablePilotInput, runDurableAutonomousValuePilot } from './durable.js';
import { type SealedCellEvidence, verifySealedCellEvidence } from './evidence.js';
import { createPilotSchedule, type PilotResult } from './pilot.js';
import { type CellExecutor, type CellRuntimeConfiguration, type CellWorkspaceFactory,
  createConformanceCellExecutor, runAutonomousValueCell } from './runner.js';
import { type QualityObservation, scoreAutonomousValueCell } from './scorer.js';

interface AdmissionRequest extends PilotCampaignCellRunInput {
  readonly configurationKey: string;
  readonly runtime: CellRuntimeConfiguration;
}

type Admission = { readonly kind: 'refused' } | {
  readonly kind: 'admitted';
  readonly executionId: string;
  readonly configurationKey: string;
};

type Review = { readonly kind: 'unavailable' } | {
  readonly kind: 'reviewed';
  readonly score: number;
  readonly quality: QualityObservation;
};

export interface RuntimePilotInput extends DurablePilotInput {
  readonly artifactDigest: string;
  /** Versioned identities, changed whenever the corresponding trusted policy changes. */
  readonly admissionPolicyKey: string;
  readonly reviewerKey: string;
  readonly workspaceFactory: CellWorkspaceFactory;
  readonly loadTask: (input: PilotCampaignCellRunInput) => {
    readonly fixture: Readonly<Record<string, string>>;
    readonly task: string;
    readonly skillBody: string | undefined;
  };
  /** Trusted external authority: reserve durable budget before returning admitted.
   * This module does not implement a financial ledger. Absence refuses all effects. */
  readonly admit?: ((input: AdmissionRequest) => Promise<Admission>) | undefined;
  /** Independent grader of sealed evidence, never an interpretation of worker success prose. */
  readonly assess: (input: PilotCampaignCellRunInput & {
    readonly evidence: SealedCellEvidence;
  }) => Promise<Review>;
}

/** Connect the real bounded executor to the existing durable campaign, with no paid default. */
export async function runDurableRuntimePilot(
  input: RuntimePilotInput,
  executor: CellExecutor = createConformanceCellExecutor(),
): Promise<PilotCampaignResult> {
  const configuration = input.manifest.comparability;
  const runtimeName = configuration.runtime;
  if (runtimeName !== 'codex' && runtimeName !== 'claude') throw new Error('unsupported runtime');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.artifactDigest)
    || ![input.admissionPolicyKey, input.reviewerKey].every((key) => /^[a-zA-Z0-9._/:-]{1,512}$/.test(key))) {
    throw new Error('invalid runtime adapter identity');
  }
  const tasks = new Map(createPilotSchedule(input.manifest).map((execution) => [
    execution.executionId,
    input.loadTask({ execution, cell: input.manifest.cells[execution.cellId] }),
  ]));
  const adapterIdentity = createHash('sha256').update(JSON.stringify({
    version: 1, artifactDigest: input.artifactDigest,
    admissionPolicyKey: input.admissionPolicyKey, reviewerKey: input.reviewerKey,
    tasks: [...tasks],
  })).digest('hex');
  return runDurableAutonomousValuePilot({ ...input, adapterIdentity }, async (cellInput) => {
    if (input.admit === undefined) return { status: 'blocked', reason: 'paid admission unavailable' };
    const task = tasks.get(cellInput.execution.executionId);
    if (task === undefined) return { status: 'blocked', reason: 'task unavailable' };
    if (cellInput.cell.condition !== 'agent-alone' && task.skillBody === undefined) {
      return { status: 'blocked', reason: 'condition skill unavailable' };
    }
    const prompt = buildConsumerPrompt({ ...task, objective: cellInput.cell.objective,
      condition: cellInput.cell.condition,
      skillBody: cellInput.cell.condition === 'agent-alone' ? undefined : task.skillBody });
    const runtime: CellRuntimeConfiguration = {
      argv: buildConsumerRuntimeInvocation({ runtime: runtimeName, model: configuration.model,
        effort: configuration.effort, prompt }),
      model: configuration.model, modelVersion: configuration.modelVersion,
      effort: configuration.effort, artifactDigest: input.artifactDigest,
    };
    const admission = await input.admit({ ...cellInput, runtime, configurationKey: input.configurationKey });
    if (admission.kind !== 'admitted' || admission.executionId !== cellInput.execution.executionId
      || admission.configurationKey !== input.configurationKey) {
      return { status: 'blocked', reason: 'paid admission refused or mismatched' };
    }
    const started = performance.now();
    const result = await runAutonomousValueCell({ cell: cellInput.cell, fixture: task.fixture,
      runtime, executor, workspaceFactory: input.workspaceFactory });
    const durationMs = performance.now() - started;
    if (result.kind !== 'sealed' || !verifySealedCellEvidence(result.evidence).ok
      || result.evidence.outcome.kind !== 'succeeded' || result.evidence.cleanup.kind !== 'complete') {
      return { status: 'unknown', reason: 'execution or cleanup evidence unavailable' };
    }
    const review = await input.assess({ ...cellInput, evidence: result.evidence });
    if (review.kind !== 'reviewed' || !Number.isFinite(review.score) || review.score < 0 || review.score > 1) {
      return { status: 'unknown', reason: 'independent quality review unavailable' };
    }
    const score = scoreAutonomousValueCell({ evidence: result.evidence, quality: review.quality,
      comparability: { expected: input.configurationKey, actual: input.configurationKey } });
    if (!score.admissible) return { status: 'blocked', reason: 'absolute quality gate refused' };
    return { status: 'completed', score: review.score, criticalDefect: review.quality.criticalDefect,
      sourceCommit: result.evidence.startCommit, artifactDigest: result.evidence.artifactDigest,
      configurationKey: input.configurationKey, durationMs: { kind: 'known', value: durationMs },
      costUsd: { kind: 'unknown', reason: 'trusted cost meter unavailable' } } satisfies PilotResult;
  });
}
