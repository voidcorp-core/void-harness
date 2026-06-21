// The machine-readable worker-event protocol, shared by the live flux renderer,
// the run reconciliation, and (from backlog-autopilot onward) the in-session
// worker-output contract the thin orchestrator consumes.
//
// A worker emits semantic markers the orchestrator cannot infer otherwise:
//     VOID_EVENT: PHASE <name>
//     VOID_EVENT: DECISION <text>
//     VOID_EVENT: BRANCH <name>
//     VOID_EVENT: PR <ref>
//     VOID_AUTONOMOUS_RESULT: <COMPLETED|BLOCKED|NO_TICKETS> [ticket] [detail]
//
// This module is pure: it parses text into domain events and never throws.
// Malformed lines are dropped. It carries no dependency on any subprocess
// stream envelope — that envelope (Claude Code's `-p` stream-json) was removed
// with the out-of-session loop; the protocol below outlives it.

export type ResultStatus = 'completed' | 'blocked' | 'no_tickets';

export type BacklogEvent =
  | { readonly kind: 'init'; readonly model?: string }
  | { readonly kind: 'phase'; readonly phase: string }
  | { readonly kind: 'decision'; readonly text: string }
  | { readonly kind: 'branch'; readonly name: string }
  | { readonly kind: 'skill'; readonly name: string }
  | { readonly kind: 'edit'; readonly path?: string }
  | { readonly kind: 'bash'; readonly command?: string }
  | { readonly kind: 'commit'; readonly subject?: string }
  | { readonly kind: 'pr'; readonly ref: string }
  | { readonly kind: 'tool'; readonly name: string }
  | { readonly kind: 'result'; readonly status: ResultStatus; readonly ticket?: string; readonly detail?: string }
  | { readonly kind: 'session-end'; readonly isError: boolean; readonly costUsd?: number }
  | { readonly kind: 'unknown' };

const RESULT_STATUS: Record<string, ResultStatus> = {
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  NO_TICKETS: 'no_tickets',
};

/** Pull PHASE / DECISION / BRANCH / PR / RESULT markers out of one text block. */
export function parseWorkerEvents(text: string): readonly BacklogEvent[] {
  const out: BacklogEvent[] = [];
  for (const raw of text.split('\n')) {
    const lineText = raw.trim();

    const phase = /^VOID_EVENT:\s*PHASE\s+(.+)$/.exec(lineText);
    if (phase?.[1] !== undefined) {
      out.push({ kind: 'phase', phase: phase[1].trim() });
      continue;
    }

    const decision = /^VOID_EVENT:\s*DECISION\s+(.+)$/.exec(lineText);
    if (decision?.[1] !== undefined) {
      out.push({ kind: 'decision', text: decision[1].trim() });
      continue;
    }

    const branch = /^VOID_EVENT:\s*BRANCH\s+(.+)$/.exec(lineText);
    if (branch?.[1] !== undefined) {
      out.push({ kind: 'branch', name: branch[1].trim() });
      continue;
    }

    const pr = /^VOID_EVENT:\s*PR\s+(.+)$/.exec(lineText);
    if (pr?.[1] !== undefined) {
      out.push({ kind: 'pr', ref: pr[1].trim() });
      continue;
    }

    const result = /^VOID_AUTONOMOUS_RESULT:\s*([A-Z_]+)(?:\s+(\S+))?(?:\s+(.+))?$/.exec(lineText);
    if (result?.[1] !== undefined) {
      const status = RESULT_STATUS[result[1]];
      if (status === 'no_tickets') {
        out.push({ kind: 'result', status });
      } else if (status !== undefined) {
        out.push({
          kind: 'result',
          status,
          ...(result[2] !== undefined ? { ticket: result[2] } : {}),
          ...(result[3] !== undefined ? { detail: result[3].trim() } : {}),
        });
      }
    }
  }
  return out;
}
