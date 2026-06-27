import { parse } from 'yaml';
import type { EdgeKind, GraphEdge } from '../model/types.js';

const KINDS: readonly EdgeKind[] = ['routes-to', 'composes', 'conflicts', 'overlaps', 'companion-of', 'invokes', 'extends'];

interface RawEdge {
  from?: unknown;
  to?: unknown;
  kind?: unknown;
  evidence?: unknown;
}

export function loadDeclaredEdges(yamlText: string): GraphEdge[] {
  if (yamlText.trim() === '') return [];
  const doc = parse(yamlText) as { edges?: readonly RawEdge[] } | null; // allow-null: yaml parser returns null for empty or null YAML
  const raw = doc?.edges ?? [];
  return raw.map((e, i) => {
    const from = str(e.from, i, 'from');
    const to = str(e.to, i, 'to');
    const kind = str(e.kind, i, 'kind');
    if (!KINDS.includes(kind as EdgeKind)) throw new Error(`relations[${i}]: unknown edge kind "${kind}"`);
    return { from, to, kind: kind as EdgeKind, origin: 'declared' as const, evidence: str(e.evidence, i, 'evidence') };
  });
}

function str(v: unknown, i: number, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`relations[${i}]: "${field}" must be a non-empty string`);
  return v.trim();
}
