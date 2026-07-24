import { parseEventLine } from '@voidcorp/mission-engine';
import type { ActivationEvent, ActivationKind } from './types.js';

const KINDS: ReadonlySet<string> = new Set(['skill', 'agent', 'workflow', 'tool']);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function canonicalActivation(line: string): ActivationEvent | undefined {
  const parsed = parseEventLine(line);
  if (!parsed.ok || parsed.value.kind !== 'runtime.tool.started') return undefined;
  const separator = parsed.value.subject.indexOf(':');
  if (separator < 1) return undefined;
  const kind = parsed.value.subject.slice(0, separator);
  const name = parsed.value.subject.slice(separator + 1);
  if (!KINDS.has(kind) || name === '') return undefined;
  const payload = asObject(parsed.value.payload);
  if (payload === undefined) return undefined;
  return {
    ts: parsed.value.ts,
    kind: kind as ActivationKind,
    name,
    trigger: {
      tool: typeof payload['tool'] === 'string' ? payload['tool'] : '',
      fileGlobs: asStringArray(payload['fileGlobs']),
      ext: asStringArray(payload['extensions']),
    },
    sessionId: parsed.value.missionId,
  };
}

function parseLine(line: string): ActivationEvent | undefined {
  if (line.trim() === '') return undefined;
  const canonical = canonicalActivation(line);
  if (canonical !== undefined) return canonical;
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

/** Parse canonical or legacy activation JSONL into typed events. Bad lines are skipped. */
export function parseActivations(text: string): ActivationEvent[] {
  const events: ActivationEvent[] = [];
  for (const line of text.split('\n')) {
    const ev = parseLine(line);
    if (ev !== undefined) events.push(ev);
  }
  return events;
}
