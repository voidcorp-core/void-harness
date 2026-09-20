// tdd-cover: e2e packages/void-machine/test/note-contract.test.ts
import { z } from 'zod';
import {
  type Cancellation, type Clock, type Execute, type ExecutionStop, executeBounded,
} from '../runtime/execution.js';
import {
  type Note, type NoteInput, admitExtraction, admitNote, noteInputSchema,
} from '../verticals/sourced-note/note.js';

export interface NoteDependencies {
  readonly extract: Execute;
  readonly synthesize: Execute;
  readonly executionIds: { readonly extraction: string; readonly synthesis: string };
  readonly timeoutMs: number;
  readonly clock: Clock;
}
type Stage = 'input' | 'extraction' | 'synthesis';
export interface NoteStop {
  readonly kind: 'stopped';
  readonly stage: Stage;
  readonly issue: { readonly code: string; readonly cause: string;
    readonly owner: 'caller' | 'extractor' | 'synthesizer'; readonly action: string };
  readonly cancellation: Cancellation;
}
export type NoteOutcome = { readonly kind: 'completed'; readonly note: Note } | NoteStop;

const optionsSchema = z.strictObject({
  executionIds: z.strictObject({ extraction: z.string().min(1).max(200),
    synthesis: z.string().min(1).max(200) })
    .refine((value) => value.extraction !== value.synthesis),
  // Compatible with bounded host timers, without requiring a particular clock.
  timeoutMs: z.number().int().min(1).max(2_147_483_647),
});

function stop(stage: Stage, code: string, cause: string, action: string,
  cancellation: Cancellation = 'not-requested'): NoteStop {
  return { kind: 'stopped', stage, issue: { code, cause, action,
    owner: stage === 'input' ? 'caller' : stage === 'extraction' ? 'extractor' : 'synthesizer' },
    cancellation };
}

function executionStop(stage: 'extraction' | 'synthesis', outcome: ExecutionStop): NoteStop {
  return stop(stage, outcome.issue.code, outcome.issue.cause, outcome.issue.action, outcome.cancellation);
}

function materials(input: NoteInput) {
  return { requestId: input.requestId, question: input.question, sources: input.sources };
}

export async function runNote(raw: unknown, dependencies: NoteDependencies): Promise<NoteOutcome> {
  const input = noteInputSchema.safeParse(raw);
  const options = optionsSchema.safeParse({ executionIds: dependencies.executionIds,
    timeoutMs: dependencies.timeoutMs });
  if (!input.success || !options.success) {
    return stop('input', 'input.invalid', 'Request or execution bounds are invalid',
      'Provide a question, two distinct bounded sources, distinct execution IDs and a positive deadline');
  }
  const extraction = await executeBounded(dependencies.extract, {
    executionId: options.data.executionIds.extraction, timeoutMs: options.data.timeoutMs,
    instruction: 'Extract exact quotations relevant to the question from the supplied sources. Return evidence and limitations.',
    input: materials(input.data),
  }, dependencies.clock);
  if (extraction.kind === 'stopped') return executionStop('extraction', extraction);
  const admitted = admitExtraction(extraction.payload, input.data);
  if (!admitted.ok) {
    return stop('extraction', 'extraction.invalid', 'Extraction is not bounded and traceable to the supplied sources',
      'Supply valid extraction evidence before requesting synthesis');
  }
  const synthesis = await executeBounded(dependencies.synthesize, {
    executionId: options.data.executionIds.synthesis, timeoutMs: options.data.timeoutMs,
    instruction: 'Return a sourced note with title, summary, evidence and limitations. Cite both supplied sources using exact quotations.',
    input: { ...materials(input.data), extraction: admitted.value },
  }, dependencies.clock);
  if (synthesis.kind === 'stopped') return executionStop('synthesis', synthesis);
  const note = admitNote(synthesis.payload, input.data);
  return note.ok ? { kind: 'completed', note: note.value }
    : stop('synthesis', 'note.invalid', 'Note is not bounded, traceable and supported by both sources',
      'Supply a structurally valid note with quotations from each source');
}
