import type { ActivationKind } from '../behavior/types.js';
import type { OutcomeEvent, OutcomeStatus } from './types.js';

const KINDS: ReadonlySet<string> = new Set(['skill', 'agent', 'workflow', 'tool']);
const STATUSES: ReadonlySet<string> = new Set(['ok', 'error', 'unknown']);

function parseLine(line: string): OutcomeEvent | undefined {
  if (line.trim() === '') return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined; // allow-null: JSON.parse can yield null
  const o = raw as Record<string, unknown>;
  const event = o['event'];
  const ts = typeof o['ts'] === 'string' ? (o['ts'] as string) : '';
  const sessionId = typeof o['sessionId'] === 'string' ? (o['sessionId'] as string) : '';

  if (event === 'Stop') return { event: 'Stop', ts, sessionId };
  if (event !== 'PostToolUse') return undefined;

  const kind = o['kind'];
  const name = o['name'];
  if (typeof kind !== 'string' || !KINDS.has(kind)) return undefined;
  if (typeof name !== 'string' || name === '') return undefined;
  const rawStatus = o['status'];
  const status: OutcomeStatus =
    typeof rawStatus === 'string' && STATUSES.has(rawStatus) ? (rawStatus as OutcomeStatus) : 'unknown';
  return { event: 'PostToolUse', ts, kind: kind as ActivationKind, name, status, sessionId };
}

/** Parse a `.void/outcomes.jsonl` body into typed events. Tolerant: bad/truncated lines are skipped. */
export function parseOutcomes(text: string): OutcomeEvent[] {
  const events: OutcomeEvent[] = [];
  for (const line of text.split('\n')) {
    const ev = parseLine(line);
    if (ev !== undefined) events.push(ev);
  }
  return events;
}
