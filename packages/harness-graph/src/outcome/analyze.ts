import { activationName } from '../behavior/index.js';
import type { ActivationKind } from '../behavior/types.js';
import type { ComponentOutcome, OutcomeEvent } from './types.js';

/** Key a component by firing kind + bare name, matching the cost/behavior joins. */
export function outcomeKey(kind: ActivationKind, name: string): string {
  return `${kind}\t${activationName(kind, name)}`;
}

/**
 * Tally completions per component from the outcome stream. Stop events are
 * ignored here (they describe sessions, not components). Pure: no I/O.
 */
export function analyzeOutcomes(outcomes: readonly OutcomeEvent[]): Map<string, ComponentOutcome> {
  const acc = new Map<string, { completions: number; ok: number; error: number }>();
  for (const ev of outcomes) {
    if (ev.event !== 'PostToolUse') continue;
    const key = outcomeKey(ev.kind, ev.name);
    const cur = acc.get(key) ?? { completions: 0, ok: 0, error: 0 };
    cur.completions += 1;
    if (ev.status === 'ok') cur.ok += 1;
    else if (ev.status === 'error') cur.error += 1;
    acc.set(key, cur);
  }
  const out = new Map<string, ComponentOutcome>();
  for (const [key, v] of acc) {
    const denom = v.ok + v.error;
    out.set(key, {
      completions: v.completions,
      ok: v.ok,
      error: v.error,
      ...(denom > 0 ? { yield: v.ok / denom } : {}),
    });
  }
  return out;
}

/** Session ids that ended with a Stop event (cleanly closed, from the agent's view). */
export function stoppedSessions(outcomes: readonly OutcomeEvent[]): Set<string> {
  const out = new Set<string>();
  for (const ev of outcomes) if (ev.event === 'Stop' && ev.sessionId !== '') out.add(ev.sessionId);
  return out;
}
