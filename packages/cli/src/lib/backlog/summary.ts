// Run summary for the backlog-loop: aggregate per-iteration results into the
// dense terminal recap the human reads when they take the loop back to merge.
//
// `buildSummary` is pure (table-tested); `renderSummary` is the thin writer.

import { c, glyph } from '../render.js';
import type { IterationResult, IterationStatus } from './orchestrator.js';
import type { Write } from './render.js';

export type StopReason = 'drained' | 'max-iterations' | 'circuit-break';

export interface TicketOutcome {
  readonly ticket: string;
  readonly status: IterationStatus;
  readonly decisions: readonly string[];
  readonly detail?: string;
  readonly pr?: string;
}

export interface RunSummary {
  readonly completed: number;
  readonly blocked: number;
  readonly failed: number;
  readonly tickets: readonly TicketOutcome[];
  readonly stopReason: StopReason;
}

function toOutcome(result: IterationResult): TicketOutcome {
  const decisions = result.events.flatMap((e) => (e.kind === 'decision' ? [e.text] : []));
  const pr = result.events.flatMap((e) => (e.kind === 'pr' ? [e.ref] : [])).at(-1);
  return {
    ticket: result.ticket ?? 'unknown',
    status: result.status,
    decisions,
    ...(result.detail !== undefined ? { detail: result.detail } : {}),
    ...(pr !== undefined ? { pr } : {}),
  };
}

/** Aggregate the worked tickets (no_tickets is the drain signal, not a ticket). */
export function buildSummary(results: readonly IterationResult[], stopReason: StopReason): RunSummary {
  const tickets = results.map(toOutcome);
  return {
    completed: tickets.filter((t) => t.status === 'completed').length,
    blocked: tickets.filter((t) => t.status === 'blocked').length,
    failed: tickets.filter((t) => t.status === 'failed').length,
    tickets,
    stopReason,
  };
}

const STOP_LABEL: Record<StopReason, string> = {
  drained: 'backlog drained',
  'max-iterations': 'reached max iterations',
  'circuit-break': 'circuit breaker tripped',
};

function ticketLine(t: TicketOutcome): string {
  const mark =
    t.status === 'completed' ? c.green(glyph.check) : t.status === 'blocked' ? c.yellow(glyph.up) : c.red('x');
  const pr = t.pr !== undefined ? ` ${c.cyan(t.pr)}` : '';
  const decisions = t.decisions.length > 0 ? c.dim(`  (${t.decisions.join('; ')})`) : '';
  const detail = t.status !== 'completed' && t.detail !== undefined ? c.dim(`: ${t.detail}`) : '';
  return `  ${mark} ${t.ticket}${pr}${detail}${decisions}`;
}

/** Render the dense end-of-run recap via `write`. */
export function renderSummary(summary: RunSummary, write: Write): void {
  write('');
  write(
    `${c.bold('end of run')} ${c.dim(glyph.dash)} ${summary.completed} done ${c.dim(glyph.dot)} ${summary.blocked} blocked ${c.dim(glyph.dot)} ${summary.failed} failed ${c.dim(`(${STOP_LABEL[summary.stopReason]})`)}`,
  );
  for (const t of summary.tickets) write(ticketLine(t));

  const toMerge = summary.tickets.flatMap((t) => (t.status === 'completed' && t.pr !== undefined ? [t.pr] : []));
  if (toMerge.length > 0) write(`  ${c.dim(glyph.to)} to merge: ${toMerge.join(', ')}`);
}
