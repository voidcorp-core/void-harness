import type { RuntimeInvocation } from '../runtime/types.js';
import type { PilotExecution, PilotObservation } from './pilot.js';

const MAX_PROMPT_LENGTH = 64 * 1024;

export interface ConsumerPromptInput {
  readonly objective: string;
  readonly task: string;
  readonly condition: 'agent-alone' | 'implement' | 'autopilot';
  readonly skillBody: string | undefined;
}

export interface ConsumerRuntimeInvocationInput {
  readonly runtime: 'codex' | 'claude';
  readonly model: string;
  readonly prompt: string;
}

export interface PilotCellRunInput {
  readonly execution: PilotExecution;
}

export type PilotCellRun = (
  input: PilotCellRunInput,
) => Promise<PilotObservation>;

export interface PilotScheduleOptions {
  /** Maximum number of isolated cells allowed to run at once. */
  readonly concurrency?: number;
  /** Stop admitting new cells after the first unknown or blocked result. */
  readonly stopOnUnknown?: boolean;
  /** Observe each result as soon as it is available for durable progress. */
  readonly onObservation?: (observation: PilotObservation) => void | Promise<void>;
}

function bounded(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_PROMPT_LENGTH || /\0/.test(trimmed)) {
    throw new Error(`${label} is empty, too long, or contains NUL`);
  }
  return trimmed;
}

/** Build the single condition prompt without importing unrelated installed skills. */
export function buildConsumerPrompt(input: ConsumerPromptInput): string {
  const objective = bounded(input.objective, 'objective');
  const task = bounded(input.task, 'task');
  const skill = input.skillBody === undefined
    ? undefined
    : bounded(input.skillBody, 'skill body');
  const sections = [
    'You are executing one isolated engineering evaluation cell.',
    `Objective: ${objective}`,
    '',
    '<task>',
    task,
    '</task>',
    '',
    'Safety contract:',
    '- Work only in the supplied checkout.',
    '- Do not modify lockfiles, secrets, keys, or files outside the checkout.',
    '- Do not claim success without observable evidence.',
    '- Leave the checkout ready for the harness to capture and verify.',
    '- Do not run the full release verification suite; use only targeted checks for this task.',
  ];
  if (skill !== undefined) {
    sections.push('', '<active-skill>', skill, '</active-skill>');
  }
  return sections.join('\n').slice(0, MAX_PROMPT_LENGTH);
}

/** Build argv directly so runtime prompts cannot be interpreted by a shell. */
export function buildConsumerRuntimeInvocation(
  input: ConsumerRuntimeInvocationInput,
): RuntimeInvocation {
  const model = bounded(input.model, 'model');
  const prompt = bounded(input.prompt, 'prompt');
  if (input.runtime === 'codex') {
    return {
      command: 'codex',
      args: [
        'exec',
        '--ephemeral',
        '--sandbox',
        'workspace-write',
        '--ignore-user-config',
        '--model',
        model,
        prompt,
      ],
    };
  }
  return {
    command: 'claude',
    args: [
      '-p',
      prompt,
      '--permission-mode',
      'dontAsk',
      '--output-format',
      'json',
      '--model',
      model,
      '--no-session-persistence',
    ],
  };
}

const MAX_SCHEDULE_CONCURRENCY = 4;

function scheduleConcurrency(requested: number | undefined, scheduleLength: number): number {
  if (scheduleLength === 0) return 0;
  if (requested === undefined || !Number.isFinite(requested)) return 1;
  return Math.max(1, Math.min(MAX_SCHEDULE_CONCURRENCY, Math.trunc(requested), scheduleLength));
}

function isUnknownObservation(observation: PilotObservation): boolean {
  return observation.result === undefined
    || observation.result.status === 'unknown'
    || observation.result.status === 'blocked';
}

/** Execute isolated cells with bounded parallelism and deterministic output order. */
export async function runPilotSchedule(
  schedule: readonly PilotExecution[],
  runCell: PilotCellRun,
  options: PilotScheduleOptions = {},
): Promise<readonly PilotObservation[]> {
  const results = new Map<string, PilotObservation>();
  let nextIndex = 0;
  let stopAdmitting = false;

  const runOne = async (execution: PilotExecution): Promise<void> => {
    let observation: PilotObservation;
    try {
      observation = await runCell({ execution });
      if (observation.executionId !== execution.executionId) {
        observation = {
          executionId: execution.executionId,
          result: { status: 'unknown', reason: 'adapter returned mismatched execution' },
        };
      }
    } catch {
      observation = {
        executionId: execution.executionId,
        result: { status: 'unknown', reason: 'pilot execution failed' },
      };
    }
    results.set(execution.executionId, observation);
    if (options.stopOnUnknown === true && isUnknownObservation(observation)) {
      stopAdmitting = true;
    }
    await options.onObservation?.(observation);
  };

  const worker = async (): Promise<void> => {
    while (true) {
      if (stopAdmitting) return;
      const execution = schedule[nextIndex];
      nextIndex += 1;
      if (execution === undefined) return;
      await runOne(execution);
    }
  };

  await Promise.all(
    Array.from({ length: scheduleConcurrency(options.concurrency, schedule.length) }, () => worker()),
  );

  return Object.freeze(schedule.map((execution): PilotObservation => results.get(execution.executionId) ?? {
    executionId: execution.executionId,
    result: { status: 'unknown', reason: 'not run after infrastructure failure' },
  }));
}
