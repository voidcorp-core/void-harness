import type { EdgeKind } from '@voidcorp/harness-graph';

export type Family = 'routing' | 'tension' | 'wiring' | 'overlay';

export const FAMILIES: readonly Family[] = ['routing', 'tension', 'wiring', 'overlay'];

export const FAMILY_LABELS: Record<Family, string> = {
  routing: 'Routing & composition',
  tension: 'Conflict & overlap',
  wiring: 'Wiring (companion / invokes / enforces)',
  overlay: 'Pack overlay',
};

export const FAMILY_KINDS: Record<Family, readonly EdgeKind[]> = {
  routing: ['routes-to', 'composes'],
  tension: ['conflicts', 'overlaps'],
  wiring: ['companion-of', 'invokes', 'enforces'],
  overlay: ['extends'],
};

const KIND_TO_FAMILY: Record<EdgeKind, Family> = {
  'routes-to': 'routing',
  composes: 'routing',
  conflicts: 'tension',
  overlaps: 'tension',
  'companion-of': 'wiring',
  invokes: 'wiring',
  extends: 'overlay',
  enforces: 'wiring',
};

export function familyOf(kind: EdgeKind): Family {
  return KIND_TO_FAMILY[kind];
}
