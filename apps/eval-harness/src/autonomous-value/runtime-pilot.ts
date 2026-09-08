import { createHash } from 'node:crypto';
import { parsePilotApproval } from './approval.js';
import { type MicroUsd, parseBudgetPlan } from './budget.js';
import { type PilotCampaignCellRunInput, type PilotCampaignResult, runAutonomousValuePilot } from './campaign.js';
import { buildConsumerPrompt, buildConsumerRuntimeInvocation } from './consumer.js';
import { type DurablePilotInput, runDurableAutonomousValuePilot } from './durable.js';
import { type SealedCellEvidence, verifySealedCellEvidence } from './evidence.js';
import { createPilotSchedule, type PilotResult } from './pilot.js';
import { type CellExecutorInput, type CellExecutorObservation, type CellRuntimeConfiguration,
  type CellWorkspaceFactory, runAutonomousValueCell } from './runner.js';
import { type QualityObservation, scoreAutonomousValueCell } from './scorer.js';

/** Trusted infrastructure port, never parsed from worker JSON or a CLI flag.
 * Its implementation must enforce the supplied cap across all covered effects.
 * No production implementation is supplied: tests use a zero-cost transport. */
export interface BoundedRuntimeAdapter {
  readonly kind: 'bounded';
  readonly runtime: 'codex' | 'claude';
  readonly model: string;
  readonly modelVersion: string;
  readonly effort: string;
  readonly proofDigest: string;
  readonly coverage: 'all-in-flight-and-descendants';
  readonly execute: (input: CellExecutorInput & {
    readonly executionId: string;
    readonly maxCostMicroUsd: MicroUsd;
  }) => Promise<CellExecutorObservation>;
}

type Review = { readonly kind: 'unavailable' } | {
  readonly kind: 'reviewed';
  readonly score: number;
  readonly quality: QualityObservation;
};

export interface RuntimePilotInput extends DurablePilotInput {
  readonly artifactDigest: string;
  /** Versioned identities, changed whenever the corresponding trusted policy changes. */
  readonly reviewerKey: string;
  readonly workspaceFactory: CellWorkspaceFactory;
  readonly loadTask: (input: PilotCampaignCellRunInput) => {
    readonly fixture: Readonly<Record<string, string>>;
    readonly task: string;
    readonly skillBody: string | undefined;
  };
  /** Independent grader of sealed evidence, never an interpretation of worker success prose. */
  readonly assess: (input: PilotCampaignCellRunInput & {
    readonly evidence: SealedCellEvidence;
  }) => Promise<Review>;
}

/** Connect the real bounded executor to the existing durable campaign, with no paid default. */
export async function runDurableRuntimePilot(
  input: RuntimePilotInput,
  adapter: BoundedRuntimeAdapter | { readonly kind: 'unavailable' } = { kind: 'unavailable' },
): Promise<PilotCampaignResult> {
  const configuration = input.manifest.comparability;
  const runtimeName = configuration.runtime;
  if (runtimeName !== 'codex' && runtimeName !== 'claude') throw new Error('unsupported runtime');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.artifactDigest)
    || !/^[a-zA-Z0-9._/:-]{1,512}$/.test(input.reviewerKey)) {
    throw new Error('invalid runtime adapter identity');
  }
  const authority = input.budget;
  const approval = parsePilotApproval(authority?.approval, input.manifest);
  if (adapter.kind !== 'bounded' || adapter.runtime !== runtimeName
    || adapter.model !== configuration.model || adapter.modelVersion !== configuration.modelVersion
    || adapter.effort !== configuration.effort || !/^sha256:[a-f0-9]{64}$/.test(adapter.proofDigest)
    || adapter.coverage !== 'all-in-flight-and-descendants'
    || authority === undefined || authority.provenance.kind !== 'verified' || !approval.ok) {
    return runAutonomousValuePilot(input.manifest,
      async () => ({ status: 'blocked', reason: 'verified spending authority unavailable' }),
      { concurrency: 1, stopOnUnknown: true });
  }
  if (approval.value.artifactDigest !== input.artifactDigest) throw new Error('artifact identity mismatch');
  const reservations = authority.reservations.map((entry) => Object.freeze({ ...entry }));
  const budget = { ...authority, approval: approval.value,
    provenance: { ...authority.provenance }, reservations: Object.freeze(reservations) };
  const plan = parseBudgetPlan({ budgetUsd: approval.value.budgetUsd, reservations },
    createPilotSchedule(input.manifest).map(({ executionId }) => executionId));
  if (!plan.ok) throw new Error('invalid runtime reservation plan');
  const { execute, ...capability } = adapter;
  const tasks = new Map(createPilotSchedule(input.manifest).map((execution) => [
    execution.executionId,
    input.loadTask({ execution, cell: input.manifest.cells[execution.cellId] }),
  ]));
  const adapterIdentity = createHash('sha256').update(JSON.stringify({
    version: 1, artifactDigest: input.artifactDigest,
    capability, reviewerKey: input.reviewerKey,
    tasks: [...tasks],
  })).digest('hex');
  return runDurableAutonomousValuePilot({ ...input, budget, adapterIdentity }, async (cellInput) => {
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
    const reservation = plan.value.reservations.find(({ executionId }) => executionId === cellInput.execution.executionId);
    if (reservation === undefined) return { status: 'blocked', reason: 'reservation unavailable' };
    const started = performance.now();
    const result = await runAutonomousValueCell({ cell: cellInput.cell, fixture: task.fixture,
      runtime, executor: (request) => execute({ ...request, executionId: reservation.executionId,
        maxCostMicroUsd: reservation.microUsd }), workspaceFactory: input.workspaceFactory });
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
