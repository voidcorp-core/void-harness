/**
 * Test-only absent implementation for the first RED of a new application boundary.
 * It deliberately returns no outcome. No production implementation or fallback.
 * After RED, tests will import the real application and this file will be removed.
 */
export interface ExecutionRequest {
  readonly executionId: string;
  readonly instruction: string;
  readonly input: unknown;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}
export type Execute = (request: ExecutionRequest) => Promise<unknown>;
export interface Clock {
  readonly schedule: (delayMs: number, onElapsed: () => void) => () => void;
}
export interface NoteDependencies {
  readonly extract: Execute;
  readonly synthesize: Execute;
  readonly executionIds: { readonly extraction: string; readonly synthesis: string };
  readonly timeoutMs: number;
  readonly clock: Clock;
}

export async function runNote(_input: unknown, _dependencies: NoteDependencies): Promise<unknown> {
  return undefined;
}
