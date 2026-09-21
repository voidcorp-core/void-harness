// tdd-cover: e2e packages/void-machine/test/note-contract.test.ts
import { z } from 'zod';
import {
  type Cancellation, type Clock, type Execute, type ExecutionStop, executeBounded,
} from '../runtime/execution.js';
import {
  type Extraction, type Note, type NoteInput, admitExtraction, admitNote, noteInputSchema,
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

const executionIdsSchema = z.strictObject({ extraction: z.string().min(1).max(200),
  synthesis: z.string().min(1).max(200) })
  .refine((value) => value.extraction !== value.synthesis);
// Compatible with bounded host timers, without requiring a particular clock.
const timeoutSchema = z.number().int().min(1).max(2_147_483_647);

/** Instructions are part of the execution contract a durable mission records. */
export const noteInstructions = {
  extraction: 'Extract exact quotations relevant to the question from the supplied sources. Return evidence and limitations.',
  synthesis: 'Return a sourced note with title, summary, evidence and limitations. Cite both supplied sources using exact quotations.',
} as const;

function stop(stage: Stage, code: string, cause: string, action: string,
  cancellation: Cancellation = 'not-requested'): NoteStop {
  return { kind: 'stopped', stage, issue: { code, cause, action,
    owner: stage === 'input' ? 'caller' : stage === 'extraction' ? 'extractor' : 'synthesizer' },
    cancellation };
}

function executionStop(stage: 'extraction' | 'synthesis', outcome: ExecutionStop): NoteStop {
  return stop(stage, outcome.issue.code, outcome.issue.cause, outcome.issue.action, outcome.cancellation);
}

export function noteInputStop(): NoteStop {
  return stop('input', 'input.invalid', 'Request or execution bounds are invalid',
    'Provide a question, two distinct bounded sources, distinct execution IDs and a positive deadline');
}

function materials(input: NoteInput) {
  return { requestId: input.requestId, question: input.question, sources: input.sources };
}

export type RequestAdmission = { readonly ok: true; readonly input: NoteInput }
  | { readonly ok: false; readonly stop: NoteStop };

export function admitNoteRequest(raw: unknown, timeoutMs: number): RequestAdmission {
  const input = noteInputSchema.safeParse(raw);
  if (!input.success || !timeoutSchema.safeParse(timeoutMs).success) return { ok: false, stop: noteInputStop() };
  return { ok: true, input: input.data };
}

export interface StageExecution {
  readonly execute: Execute;
  readonly executionId: string;
  readonly timeoutMs: number;
  readonly clock: Clock;
}
export type StageOutcome<T> = { readonly kind: 'accepted'; readonly value: T } | NoteStop;

export async function extractStage(input: NoteInput, stage: StageExecution): Promise<StageOutcome<Extraction>> {
  const extraction = await executeBounded(stage.execute, {
    executionId: stage.executionId, timeoutMs: stage.timeoutMs,
    instruction: noteInstructions.extraction, input: materials(input),
  }, stage.clock);
  if (extraction.kind === 'stopped') return executionStop('extraction', extraction);
  const admitted = admitExtraction(extraction.payload, input);
  return admitted.ok ? { kind: 'accepted', value: admitted.value }
    : stop('extraction', 'extraction.invalid', 'Extraction is not bounded and traceable to the supplied sources',
      'Supply valid extraction evidence before requesting synthesis');
}

export async function synthesizeStage(input: NoteInput, extraction: Extraction,
  stage: StageExecution): Promise<StageOutcome<Note>> {
  const synthesis = await executeBounded(stage.execute, {
    executionId: stage.executionId, timeoutMs: stage.timeoutMs,
    instruction: noteInstructions.synthesis, input: { ...materials(input), extraction },
  }, stage.clock);
  if (synthesis.kind === 'stopped') return executionStop('synthesis', synthesis);
  const note = admitNote(synthesis.payload, input);
  return note.ok ? { kind: 'accepted', value: note.value }
    : stop('synthesis', 'note.invalid', 'Note is not bounded, traceable and supported by both sources',
      'Supply a structurally valid note with quotations from each source');
}

export async function runNote(raw: unknown, dependencies: NoteDependencies): Promise<NoteOutcome> {
  const request = admitNoteRequest(raw, dependencies.timeoutMs);
  const executionIds = executionIdsSchema.safeParse(dependencies.executionIds);
  if (!request.ok || !executionIds.success) return noteInputStop();
  const stage = { timeoutMs: dependencies.timeoutMs, clock: dependencies.clock };
  const extraction = await extractStage(request.input,
    { ...stage, execute: dependencies.extract, executionId: executionIds.data.extraction });
  if (extraction.kind === 'stopped') return extraction;
  const note = await synthesizeStage(request.input, extraction.value,
    { ...stage, execute: dependencies.synthesize, executionId: executionIds.data.synthesis });
  return note.kind === 'stopped' ? note : { kind: 'completed', note: note.value };
}
