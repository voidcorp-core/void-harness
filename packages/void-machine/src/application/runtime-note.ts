import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  createClaudeExecutor, type ClaudeExecutorConfig, type ClaudeSpawn, type ClaudeUsage,
} from '../adapters/runtime/claude.js';
import type { Clock, Execute } from '../runtime/execution.js';
import {
  extractionSchema, noteSchema,
} from '../verticals/sourced-note/note.js';
import { runNote, type NoteOutcome } from './note.js';

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
  return {
    executable: config.executable,
    cwd: config.cwd,
    model,
    outputSchema,
    ...environment,
    ...process,
    ...usage,
  };
}

function execute(config: ClaudeNoteConfig, model: string,
  outputSchema: Readonly<Record<string, unknown>>, role: RuntimeNoteUsage['role']): Execute {
  return createClaudeExecutor(executorConfig(config, model, outputSchema, role));
}

export function runClaudeNote(raw: unknown, config: ClaudeNoteConfig): Promise<NoteOutcome> {
  const extraction = execute(config, config.extractionModel,
    z.toJSONSchema(extractionSchema, { target: 'draft-07' }), 'extractor');
  const synthesis = execute(config, config.synthesisModel,
    z.toJSONSchema(noteSchema, { target: 'draft-07' }), 'synthesizer');
  return runNote(raw, {
    extract: extraction,
    synthesize: synthesis,
    executionIds: { extraction: randomUUID(), synthesis: randomUUID() },
    timeoutMs: config.timeoutMs,
    clock: config.clock ?? systemClock(),
  });
}
