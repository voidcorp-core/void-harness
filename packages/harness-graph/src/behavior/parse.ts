import type { ActivationEvent, ActivationKind } from './types.js';

const KINDS: ReadonlySet<string> = new Set(['skill', 'agent', 'workflow', 'tool']);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function parseLine(line: string): ActivationEvent | undefined {
  if (line.trim() === '') return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined; // allow-null: JSON.parse can yield a null value
  const o = raw as Record<string, unknown>;
  const kind = o['kind'];
  const name = o['name'];
  if (typeof kind !== 'string' || !KINDS.has(kind)) return undefined;
  if (typeof name !== 'string') return undefined;
  const rawTrigger = o['trigger'];
  const t = (typeof rawTrigger === 'object' && rawTrigger !== null ? rawTrigger : {}) as Record<string, unknown>; // allow-null: guarding a parsed JSON value
  const ts = o['ts'];
  const sessionId = o['sessionId'];
  const tool = t['tool'];
  return {
    ts: typeof ts === 'string' ? ts : '',
    kind: kind as ActivationKind,
    name,
    trigger: {
      tool: typeof tool === 'string' ? tool : '',
      fileGlobs: asStringArray(t['fileGlobs']),
      ext: asStringArray(t['ext']),
    },
    sessionId: typeof sessionId === 'string' ? sessionId : '',
  };
}

/** Parse a `.void/activations.jsonl` body into typed events. Tolerant: bad lines are skipped. */
export function parseActivations(text: string): ActivationEvent[] {
  const events: ActivationEvent[] = [];
  for (const line of text.split('\n')) {
    const ev = parseLine(line);
    if (ev !== undefined) events.push(ev);
  }
  return events;
}
