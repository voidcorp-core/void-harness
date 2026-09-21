// tdd-cover: e2e packages/void-machine/test/runtime-note-contract.test.ts
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  createClaudeExecutor, type ClaudeExecutorConfig, type ClaudeSpawn, type ClaudeUsage,
} from '../adapters/runtime/claude.js';
import { createFileJournal } from '../adapters/store/file-journal.js';
import type { Clock, Execute } from '../runtime/execution.js';
import {
  extractionSchema, noteSchema,
} from '../verticals/sourced-note/note.js';
import { noteInstructions, runNote, type NoteOutcome } from './note.js';
import type { MissionDependencies, MissionUsage } from './note-mission.js';

export interface RuntimeNoteUsage extends ClaudeUsage {
  readonly role: 'extractor' | 'synthesizer';
}

export interface ClaudeNoteConfig {
  readonly executable: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly extractionModel: string;
  readonly synthesisModel: string;
  readonly timeoutMs: number;
  readonly spawn?: ClaudeSpawn;
  readonly clock?: Clock;
  readonly onUsage?: (usage: RuntimeNoteUsage) => void;
  readonly sessionFromExecutionId?: boolean;
}

function systemClock(): Clock {
  return {
    schedule(delayMs, fire) {
      const timer = setTimeout(fire, delayMs);
      return () => clearTimeout(timer);
    },
  };
}

function executorConfig(
  config: ClaudeNoteConfig,
  model: string,
  outputSchema: Readonly<Record<string, unknown>>,
  role: RuntimeNoteUsage['role'],
): ClaudeExecutorConfig {
  const usage = config.onUsage === undefined ? {} : {
    onUsage: (value: ClaudeUsage): void => config.onUsage?.({ ...value, role }),
  };
  const environment = config.env === undefined ? {} : { env: config.env };
  const process = config.spawn === undefined ? {} : { spawn: config.spawn };
  const session = config.sessionFromExecutionId === undefined ? {}
    : { sessionFromExecutionId: config.sessionFromExecutionId };
  return {
    executable: config.executable,
    cwd: config.cwd,
    model,
    outputSchema,
    ...environment,
    ...process,
    ...session,
    ...usage,
  };
}

function execute(config: ClaudeNoteConfig, model: string,
  outputSchema: Readonly<Record<string, unknown>>, role: RuntimeNoteUsage['role']): Execute {
  return createClaudeExecutor(executorConfig(config, model, outputSchema, role));
}

// Claude's native JSON Schema contract accepts Draft-7; objects stay closed.
const extractionOutput = z.toJSONSchema(extractionSchema, { target: 'draft-07' });
const noteOutput = z.toJSONSchema(noteSchema, { target: 'draft-07' });

/** What a recorded mission was dispatched under; a resume under another contract refuses. */
export const claudeNoteContract = `sha256:${createHash('sha256').update(JSON.stringify({
  instructions: noteInstructions, extraction: extractionOutput, note: noteOutput,
})).digest('hex')}`;

export function runClaudeNote(raw: unknown, config: ClaudeNoteConfig): Promise<NoteOutcome> {
  const extraction = execute(config, config.extractionModel, extractionOutput, 'extractor');
  const synthesis = execute(config, config.synthesisModel, noteOutput, 'synthesizer');
  return runNote(raw, {
    extract: extraction,
    synthesize: synthesis,
    executionIds: { extraction: randomUUID(), synthesis: randomUUID() },
    timeoutMs: config.timeoutMs,
    clock: config.clock ?? systemClock(),
  });
}

/** Local process context for a durable mission; models and deadline come from its record. */
export interface ClaudeMissionConfig {
  readonly executable: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly store: string;
  readonly missionId: string;
  readonly spawn?: ClaudeSpawn;
  readonly clock?: Clock;
}

export function claudeMissionDependencies(config: ClaudeMissionConfig): MissionDependencies {
  return {
    journal: createFileJournal({ root: config.store }),
    missionId: config.missionId,
    contract: claudeNoteContract,
    executionId: randomUUID,
    clock: config.clock ?? systemClock(),
    runtime: (mission) => {
      const observed: MissionUsage[] = [];
      // Each native session is named by the dispatch intent recorded before it.
      const note: ClaudeNoteConfig = { ...config, ...mission, sessionFromExecutionId: true,
        onUsage: (value) => { observed.push({ ...value }); } };
      return {
        extract: execute(note, mission.extractionModel, extractionOutput, 'extractor'),
        synthesize: execute(note, mission.synthesisModel, noteOutput, 'synthesizer'),
        drainUsage: () => observed.splice(0),
      };
    },
  };
}
