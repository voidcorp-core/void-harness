// Pure helpers for the `graph live` SSE server: parse the append-only
// activations log and split an incrementally-read buffer into complete lines.
// No I/O here — the imperative shell (commands/graph.ts) does the file follow.

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

/**
 * Parse one JSONL activation line into a typed event. Tolerant: returns undefined
 * on empty/malformed/non-object input or when the load-bearing fields (kind in the
 * union, string name, trigger object) are missing or wrong.
 */
export function parseActivationLine(line: string): ActivationEvent | undefined {
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

/**
 * Split an accumulated read buffer into complete lines plus the trailing partial
 * line ("rest") to carry over to the next read. Pure and allocation-light.
 */
export function splitNewLines(buf: string): { lines: string[]; rest: string } {
  const parts = buf.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}
