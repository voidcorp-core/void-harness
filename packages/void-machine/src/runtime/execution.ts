// tdd-cover: e2e packages/void-machine/test/note-contract.test.ts
import { z } from 'zod';

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
export type ExecutionIssueCode =
  | 'execution.uncorrelated' | 'execution.invalid-observation'
  | 'execution.failed' | 'execution.unavailable' | 'execution.interrupted' | 'execution.timeout';
export type Cancellation = 'not-requested' | 'requested-unconfirmed';
export interface ExecutionStop {
  readonly kind: 'stopped';
  readonly issue: { readonly code: ExecutionIssueCode; readonly cause: string; readonly action: string };
  readonly cancellation: Cancellation;
}
export type ExecutionOutcome = { readonly kind: 'result'; readonly payload: unknown } | ExecutionStop;

const correlationSchema = z.object({ executionId: z.string().min(1) });
const message = z.string().min(1).max(2000);
const observationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('result'), executionId: z.string(), payload: z.unknown() }),
  z.strictObject({ kind: z.literal('unavailable'), executionId: z.string(), cause: message, action: message }),
  z.strictObject({ kind: z.literal('interrupted'), executionId: z.string(), cause: message, action: message }),
  z.strictObject({ kind: z.literal('failed'), executionId: z.string(), cause: message, action: message }),
]);

function stopped(code: ExecutionIssueCode, cause: string, action: string,
  cancellation: Cancellation = 'not-requested'): ExecutionStop {
  return { kind: 'stopped', issue: { code, cause, action }, cancellation };
}

function admitObservation(raw: unknown, executionId: string): ExecutionOutcome {
  const correlation = correlationSchema.safeParse(raw);
  if (!correlation.success || correlation.data.executionId !== executionId) {
    return stopped('execution.uncorrelated', 'Observation does not belong to the requested execution',
      'Collect the observation for the current execution identifier');
  }
  const observation = observationSchema.safeParse(raw);
  if (!observation.success) {
    return stopped('execution.invalid-observation', 'Executor returned an invalid observation envelope',
      'Correct the runtime adapter observation contract');
  }
  const value = observation.data;
  if (value.kind === 'result') return { kind: 'result', payload: value.payload };
  return stopped(`execution.${value.kind}`, value.cause, value.action);
}

/** Caller-owned deadline; requesting cancellation does not attest remote termination. */
export function executeBounded(
  execute: Execute,
  request: Omit<ExecutionRequest, 'signal'>,
  clock: Clock,
): Promise<ExecutionOutcome> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    let cancelDeadline = () => { /* Deadline has not been armed yet. */ };
    const finish = (outcome: ExecutionOutcome): void => {
      if (settled) return;
      settled = true;
      cancelDeadline();
      resolve(outcome);
    };
    const fail = (): void => finish(stopped('execution.failed', 'Executor could not return an observation',
      'Inspect the runtime adapter and supply a new execution when ready'));
    try {
      cancelDeadline = clock.schedule(request.timeoutMs, () => {
        if (settled) return;
        // Settle first so a synchronous abort listener cannot win with a late result.
        finish(stopped('execution.timeout', 'Caller deadline elapsed before an observation was accepted',
          'Check the outstanding execution before starting another', 'requested-unconfirmed'));
        controller.abort();
      });
      if (settled) { cancelDeadline(); return; }
      Promise.resolve(execute({ ...request, signal: controller.signal })).then((observation) => {
        if (settled) return;
        try { finish(admitObservation(observation, request.executionId)); }
        catch { fail(); }
      }, fail);
    } catch {
      fail();
    }
  });
}
