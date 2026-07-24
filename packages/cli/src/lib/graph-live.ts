import { createHash } from 'node:crypto';
import {
  parseEventLine,
  replayEventLog,
  type EventContinuity,
  type JsonValue,
} from '@voidcorp/mission-engine';

// Pure helpers for the `graph live` SSE server.

export type ActivationKind = 'skill' | 'agent' | 'workflow' | 'tool';

export interface ActivationTrigger {
  readonly tool: string;
  readonly fileGlobs: readonly string[];
  readonly ext: readonly string[];
}

export interface ActivationEvent {
  readonly ts: string;
  readonly kind: ActivationKind;
  readonly name: string;
  readonly event: string;
  readonly trigger: ActivationTrigger;
  readonly sessionId: string;
}

const KINDS: ReadonlySet<string> = new Set(['skill', 'agent', 'workflow', 'tool']);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asObject(value: JsonValue): Readonly<Record<string, JsonValue>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
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
    event: 'PreToolUse',
    trigger: {
      tool: typeof payload.tool === 'string' ? payload.tool : '',
      fileGlobs: asStringArray(payload['fileGlobs']),
      ext: asStringArray(payload['extensions']),
    },
    sessionId: parsed.value.missionId,
  };
}

/**
 * Parse one JSONL activation line into a typed event. Tolerant: returns undefined
 * on empty/malformed/non-object input or when the load-bearing fields (kind in the
 * union, string name, trigger object) are missing or wrong.
 */
export function parseActivationLine(line: string): ActivationEvent | undefined {
  if (line.trim() === '') return undefined;
  const canonical = canonicalActivation(line);
  if (canonical !== undefined) return canonical;
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
  if (typeof o.trigger !== 'object' || o.trigger === null) return undefined;
  const t = o.trigger as Record<string, unknown>;
  return {
    ts: typeof o.ts === 'string' ? o.ts : '',
    kind: o.kind as ActivationKind,
    name: o.name,
    event: typeof o.event === 'string' ? o.event : '',
    trigger: {
      tool: typeof t.tool === 'string' ? t.tool : '',
      fileGlobs: asStringArray(t.fileGlobs),
      ext: asStringArray(t.ext),
    },
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
  };
}

export interface LiveEvent {
  readonly id: string;
  readonly activation: ActivationEvent;
}

export interface LiveSnapshot {
  readonly events: readonly LiveEvent[];
  readonly continuity: EventContinuity;
  readonly truncated: boolean;
}

function looksCanonical(line: string): boolean {
  return line.includes('"schemaVersion"')
    || line.includes('"missionId"')
    || line.includes('"eventId"');
}

function legacyId(line: string, ordinal: number): string {
  return `legacy_${createHash('sha256')
    .update(`${ordinal}\0${line}`)
    .digest('hex')
    .slice(0, 24)}`;
}

/**
 * Build a bounded, deterministic replay snapshot. Sequence continuity is checked
 * independently per mission; legacy transition events receive stable local IDs.
 */
export function buildLiveSnapshot(text: string, max = 5_000): LiveSnapshot {
  const missionLines = new Map<string, string[]>();
  const events: LiveEvent[] = [];
  let partial = false;
  let ordinal = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    ordinal += 1;
    const parsed = parseEventLine(line);
    if (parsed.ok) {
      const lines = missionLines.get(parsed.value.missionId) ?? [];
      lines.push(line);
      missionLines.set(parsed.value.missionId, lines);
      const activation = canonicalActivation(line);
      if (activation !== undefined) {
        events.push({ id: parsed.value.eventId, activation });
      }
      continue;
    }
    const activation = parseActivationLine(line);
    if (activation !== undefined) {
      events.push({ id: legacyId(line, ordinal), activation });
    } else if (looksCanonical(line)) {
      partial = true;
    }
  }
  for (const lines of missionLines.values()) {
    if (replayEventLog(lines.join('\n')).continuity === 'partial') partial = true;
  }
  events.sort((a, b) =>
    a.activation.ts.localeCompare(b.activation.ts) || a.id.localeCompare(b.id),
  );
  const boundedMax = Math.max(1, max);
  const truncated = events.length > boundedMax;
  return {
    events: truncated ? events.slice(events.length - boundedMax) : events,
    continuity: events.length === 0 && !partial
      ? 'empty'
      : partial ? 'partial' : 'complete',
    truncated,
  };
}

/**
 * Split an accumulated read buffer into complete lines plus the trailing partial
 * line ("rest") to carry over to the next read. Pure and allocation-light.
 */
export function splitNewLines(buf: string): { lines: string[]; rest: string } {
  const parts = buf.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}
