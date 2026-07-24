import { parseEvent } from './schema.js';
import type { CanonicalEvent, JsonValue } from './types.js';

const LEGACY_KINDS = new Set(['skill', 'agent', 'workflow', 'tool']);

interface LegacyImport {
  readonly events: readonly CanonicalEvent[];
  readonly invalidLines: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function legacyPayload(raw: Record<string, unknown>): JsonValue {
  const trigger = asRecord(raw['trigger']);
  return {
    category: typeof raw['kind'] === 'string' ? raw['kind'] : 'tool',
    tool: typeof trigger?.['tool'] === 'string' ? trigger['tool'] : '',
    fileGlobs: stringArray(trigger?.['fileGlobs']),
    extensions: stringArray(trigger?.['ext']),
  };
}

export function importLegacyActivations(
  text: string,
  missionId: string,
): LegacyImport {
  const events: CanonicalEvent[] = [];
  let invalidLines = 0;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      invalidLines += 1;
      continue;
    }
    const record = asRecord(raw);
    const kind = record?.['kind'];
    const name = record?.['name'];
    if (
      record === undefined
      || typeof kind !== 'string'
      || !LEGACY_KINDS.has(kind)
      || typeof name !== 'string'
      || name === ''
    ) {
      invalidLines += 1;
      continue;
    }
    const rawTimestamp = typeof record['ts'] === 'string'
      ? record['ts']
      : '1970-01-01T00:00:00.000Z';
    const timestamp = rawTimestamp.endsWith('Z') && !rawTimestamp.includes('.')
      ? `${rawTimestamp.slice(0, -1)}.000Z`
      : rawTimestamp;
    const candidate: CanonicalEvent = {
      schemaVersion: 1,
      seq: events.length + 1,
      eventId: `evt_legacy_${index + 1}`,
      missionId,
      ts: timestamp,
      source: 'legacy:activation-meter',
      kind: 'runtime.tool.started',
      subject: `${kind}:${name}`,
      correlationId: missionId,
      payload: legacyPayload(record),
    };
    const parsed = parseEvent(candidate);
    if (parsed.ok) events.push(parsed.value);
    else invalidLines += 1;
  }
  return { events, invalidLines };
}
