import {
  completionEvent,
  failureEvent,
  jsonRecord,
  type RuntimeInvocation,
  type SpecialistEventDraft,
  type SpecialistInvocationInput,
  type SpecialistProcessResult,
} from './types.js';

export {
  createClaudeRunOnce,
  DEFAULT_ADAPTER,
  type AdapterConfig,
} from '../claude-adapter.js';

export interface ClaudeSpecialistInvocationInput extends SpecialistInvocationInput {
  readonly outputSchema: Readonly<Record<string, unknown>>;
}

export function buildClaudeSpecialistInvocation(
  input: ClaudeSpecialistInvocationInput,
): RuntimeInvocation {
  return {
    command: 'claude',
    args: [
      '-p',
      input.prompt,
      '--agent',
      input.specialistName,
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      'Read,Glob,Grep',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(input.outputSchema),
      '--setting-sources',
      'project',
      '--no-session-persistence',
    ],
  };
}

export function parseClaudeSpecialistRun(
  input: SpecialistProcessResult,
): SpecialistEventDraft {
  if (input.timedOut) {
    return failureEvent('runtime:claude', input, 'timeout', input.stderr || 'timed out');
  }
  if (input.exitCode !== 0) {
    return failureEvent(
      'runtime:claude',
      input,
      'process-failed',
      input.stderr || `exit ${String(input.exitCode)}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(input.stdout);
  } catch {
    return failureEvent('runtime:claude', input, 'invalid-output', 'stdout is not JSON');
  }
  const result = jsonRecord(raw);
  if (result?.['is_error'] === true) {
    return failureEvent('runtime:claude', input, 'process-failed', 'runtime reported an error');
  }
  let completion = result?.['structured_output'];
  if (completion === undefined && typeof result?.['result'] === 'string') {
    try {
      completion = JSON.parse(result['result'].trim());
    } catch {
      completion = undefined;
    }
  }
  return completionEvent(
    'runtime:claude',
    input,
    result?.['session_id'],
    completion,
  );
}
