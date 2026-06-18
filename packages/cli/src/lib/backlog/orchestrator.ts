// Backlog-loop orchestrator: spawn one fresh `claude -p` worker per ticket,
// stream its output through the parser into the live renderer, and classify
// the machine-readable result. The full loop (circuit-break + summary) builds
// on `runIteration` in a later slice.

import { spawn } from 'node:child_process';
import { subscriptionEnv } from './billing.js';
import { renderEvent, type Write } from './render.js';
import { type BacklogEvent, parseLine, type ResultStatus } from './stream.js';
import { type RunSummary, type StopReason, buildSummary } from './summary.js';

export type IterationStatus = ResultStatus | 'failed';

export interface IterationResult {
  /** Classified outcome: the last result marker, or 'failed' if none arrived. */
  readonly status: IterationStatus;
  readonly ticket?: string;
  readonly detail?: string;
  /** Every domain event observed, in order (for the run summary). */
  readonly events: readonly BacklogEvent[];
}

export interface RunIterationOptions {
  /** Executable to spawn (the `claude` binary, or a stub in tests). */
  readonly command: string;
  /** Args after the executable (e.g. -p --output-format stream-json ...). */
  readonly claudeArgs: readonly string[];
  /** Prompt piped to the worker's stdin. */
  readonly prompt: string;
  readonly cwd: string;
  /** Parent env; API creds are stripped unless `allowApi`. */
  readonly env: Record<string, string | undefined>;
  readonly allowApi: boolean;
  /** Render the live flux (false → silent, events still collected). */
  readonly stream: boolean;
  /** Line sink for the live flux (defaults to stdout). */
  readonly write?: Write;
  /** Raw line sink for the on-disk run log (stdout + stderr). */
  readonly onRaw?: (line: string) => void;
}

function classify(events: readonly BacklogEvent[]): IterationResult {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.kind === 'result') {
      return {
        status: event.status,
        ...(event.ticket !== undefined ? { ticket: event.ticket } : {}),
        ...(event.detail !== undefined ? { detail: event.detail } : {}),
        events,
      };
    }
  }
  return { status: 'failed', events };
}

/** Run a single worker session end to end and classify its result. */
export function runIteration(opts: RunIterationOptions): Promise<IterationResult> {
  const write: Write = opts.write ?? ((line) => process.stdout.write(`${line}\n`));
  const events: BacklogEvent[] = [];

  const ingest = (line: string): void => {
    opts.onRaw?.(line);
    for (const event of parseLine(line)) {
      events.push(event);
      if (opts.stream) renderEvent(event, write);
    }
  };

  return new Promise((resolve) => {
    const child = spawn(opts.command, [...opts.claudeArgs], {
      cwd: opts.cwd,
      env: subscriptionEnv(opts.env, opts.allowApi) as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        ingest(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => opts.onRaw?.(chunk));

    // A worker that exits before draining stdin must not crash the loop.
    child.stdin.on('error', () => {});

    child.on('error', () => resolve(classify(events)));
    child.on('close', () => {
      if (buffer.length > 0) ingest(buffer);
      resolve(classify(events));
    });

    child.stdin.end(opts.prompt);
  });
}

export interface RunLoopOptions {
  readonly maxIterations: number;
  readonly maxFailures: number;
  /** Run one iteration; injected so the loop is testable without spawning. */
  readonly iterate: (iteration: number) => Promise<IterationResult>;
  /** Observe each iteration's result (e.g. for inter-ticket flux separators). */
  readonly onIteration?: (iteration: number, result: IterationResult) => void;
}

/**
 * Drive iterations until the backlog drains, the iteration cap is hit, or the
 * circuit breaker trips on consecutive failures. A clean outcome
 * (completed/blocked) resets the failure streak; only 'failed' increments it.
 */
export async function runLoop(opts: RunLoopOptions): Promise<RunSummary> {
  const results: IterationResult[] = [];
  let failures = 0;
  let stopReason: StopReason = 'max-iterations';

  for (let i = 1; i <= opts.maxIterations; i++) {
    if (failures >= opts.maxFailures) {
      stopReason = 'circuit-break';
      break;
    }
    const result = await opts.iterate(i);
    opts.onIteration?.(i, result);
    if (result.status === 'no_tickets') {
      stopReason = 'drained';
      break;
    }
    results.push(result);
    failures = result.status === 'failed' ? failures + 1 : 0;
  }

  return buildSummary(results, stopReason);
}
