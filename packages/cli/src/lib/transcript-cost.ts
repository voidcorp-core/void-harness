// Transcript adapter (sub-project A, phase 2): reads Claude Code session
// transcripts and aggregates per-session real token cost. PRIVACY: only the
// `usage` counters + timestamp + sessionId + model are read — never prompt or
// response content, which never leaves this process. Tolerant to format drift:
// malformed lines are skipped and counted, never crash the caller.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SessionCost, SessionTokens } from '@voidcorp/harness-graph';

export interface AggregateResult {
  readonly costs: SessionCost[];
  /** Lines that looked cost-bearing but were malformed / drifted. */
  readonly skipped: number;
}

interface Acc {
  model: string;
  tokens: { in: number; out: number; cacheRead: number; cacheCreation: number };
  first: string;
  last: string;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Pure: aggregate per-session token cost from transcript JSONL text. A line is
 * cost-bearing when it carries `message.usage`; those missing sessionId or
 * timestamp are drift (skipped + counted). Non-cost lines (no usage) are simply
 * ignored. Deterministic; no I/O.
 */
export function aggregateSessionCosts(text: string): AggregateResult {
  const acc = new Map<string, Acc>();
  let skipped = 0;

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    let o: { sessionId?: unknown; timestamp?: unknown; message?: { model?: unknown; usage?: unknown } };
    try {
      o = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }
    const usage = o?.message?.usage as Record<string, unknown> | undefined;
    if (usage === undefined || typeof usage !== 'object') continue; // non-cost line
    const sessionId = o.sessionId;
    const ts = o.timestamp;
    if (typeof sessionId !== 'string' || typeof ts !== 'string') {
      skipped += 1;
      continue;
    }
    const model = typeof o.message?.model === 'string' ? o.message.model : '';
    let e = acc.get(sessionId);
    if (!e) {
      e = { model, tokens: { in: 0, out: 0, cacheRead: 0, cacheCreation: 0 }, first: ts, last: ts };
      acc.set(sessionId, e);
    }
    e.tokens.in += num(usage.input_tokens);
    e.tokens.out += num(usage.output_tokens);
    e.tokens.cacheRead += num(usage.cache_read_input_tokens);
    e.tokens.cacheCreation += num(usage.cache_creation_input_tokens);
    if (model) e.model = model; // last non-empty model wins
    if (ts < e.first) e.first = ts;
    if (ts > e.last) e.last = ts;
  }

  const costs: SessionCost[] = [...acc].map(([sessionId, e]) => ({
    sessionId,
    model: e.model,
    tokens: e.tokens as SessionTokens,
    tsRange: { first: e.first, last: e.last },
  }));
  return { costs, skipped };
}

/** `/Users/x/void-harness` -> `-Users-x-void-harness` (Claude Code dir scheme). */
function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Shell adapter: read every transcript for `cwd` and aggregate. Graceful:
 * a missing projects dir yields empty costs (static-only degrade upstream).
 * `projectsDir` is injectable for tests.
 */
export function readSessionCosts(
  cwd: string,
  opts: { projectsDir?: string } = {},
): AggregateResult {
  const projectsDir = opts.projectsDir ?? join(homedir(), '.claude', 'projects');
  const dir = join(projectsDir, encodeCwd(cwd));
  if (!existsSync(dir)) return { costs: [], skipped: 0 };
  const merged: string[] = [];
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.jsonl')) merged.push(readFileSync(join(dir, f), 'utf8'));
  }
  return aggregateSessionCosts(merged.join('\n'));
}
