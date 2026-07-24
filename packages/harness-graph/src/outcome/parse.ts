import { parseEventLine } from '@voidcorp/mission-engine';
import type { ActivationKind } from '../behavior/types.js';
import type { OutcomeEvent, OutcomeStatus } from './types.js';

const KINDS: ReadonlySet<string> = new Set(['skill', 'agent', 'workflow', 'tool']);
const STATUSES: ReadonlySet<string> = new Set(['ok', 'error', 'unknown']);

function asObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function parseLine(line: string): OutcomeEvent | undefined {
  if (line.trim() === '') return undefined;
  const canonical = parseEventLine(line);
  if (canonical.ok) {
    const event = canonical.value;
    if (event.kind === 'runtime.session.stopped') {
      return { event: 'Stop', ts: event.ts, sessionId: event.missionId };
    }
    if (event.kind === 'runtime.tool.completed') {
      const separator = event.subject.indexOf(':');
      if (separator < 1) return undefined;
      const kind = event.subject.slice(0, separator);
      const name = event.subject.slice(separator + 1);
      if (!KINDS.has(kind) || name === '') return undefined;
      const rawStatus = asObject(event.payload)?.['status'];
      const status: OutcomeStatus =
        typeof rawStatus === 'string' && STATUSES.has(rawStatus)
          ? rawStatus as OutcomeStatus
          : 'unknown';
      return {
        event: 'PostToolUse',
        ts: event.ts,
        kind: kind as ActivationKind,
        name,
        status,
        sessionId: event.missionId,
      };
    }
  }
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

/** Parse canonical or legacy outcome JSONL. Bad/truncated lines are skipped. */
export function parseOutcomes(text: string): OutcomeEvent[] {
  const events: OutcomeEvent[] = [];
  for (const line of text.split('\n')) {
    const ev = parseLine(line);
    if (ev !== undefined) events.push(ev);
  }
  return events;
}
