import type { PilotExecution, PilotObservation } from './pilot.js';
import type { RuntimeInvocation } from '../runtime/types.js';

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

/** Execute sequentially, once per schedule entry, and preserve failures as unknown. */
export async function runPilotSchedule(
  schedule: readonly PilotExecution[],
  runCell: PilotCellRun,
): Promise<readonly PilotObservation[]> {
  const observations: PilotObservation[] = [];
  for (const execution of schedule) {
    try {
      const observation = await runCell({ execution });
      if (observation.executionId !== execution.executionId) {
        observations.push({
          executionId: execution.executionId,
          result: { status: 'unknown', reason: 'adapter returned mismatched execution' },
        });
        continue;
      }
      observations.push(observation);
    } catch {
      observations.push({
        executionId: execution.executionId,
        result: { status: 'unknown', reason: 'pilot execution failed' },
      });
    }
  }
  return Object.freeze(observations);
}
