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
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !KINDS.has(o.kind)) return undefined;
  if (typeof o.name !== 'string') return undefined;
  const t = (typeof o.trigger === 'object' && o.trigger !== null ? o.trigger : {}) as Record<string, unknown>;
  return {
    ts: typeof o.ts === 'string' ? o.ts : '',
    kind: o.kind as ActivationKind,
    name: o.name,
    trigger: {
      tool: typeof t.tool === 'string' ? t.tool : '',
      fileGlobs: asStringArray(t.fileGlobs),
      ext: asStringArray(t.ext),
    },
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
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
