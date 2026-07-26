import type { MissionPassId } from '../policy/schema.js';

export type MissionPassState = 'pending' | 'not-applicable' | 'unknown';

export interface MissionDagNode {
  readonly id: MissionPassId;
  readonly dependsOn: readonly MissionPassId[];
  readonly initialState: MissionPassState;
}

export interface MissionDag {
  readonly schemaVersion: 1;
  readonly nodes: readonly MissionDagNode[];
}

const DEPENDENCIES: Readonly<Record<MissionPassId, readonly MissionPassId[]>> = {
  product: [],
  architecture: ['product'],
  tdd: ['architecture'],
  qa: ['tdd'],
  security: ['architecture', 'tdd'],
  observability: ['tdd'],
  migration: ['architecture'],
  'ux-ui': ['tdd'],
  accessibility: ['ux-ui'],
  performance: ['tdd'],
  'stack-patterns': ['architecture'],
  pdf: ['qa'],
  retrospective: [
    'product',
    'architecture',
    'tdd',
    'qa',
    'security',
    'observability',
    'migration',
    'ux-ui',
    'accessibility',
    'performance',
    'stack-patterns',
    'pdf',
  ],
};

export function buildMissionDag(
  states: ReadonlyMap<MissionPassId, MissionPassState>,
  passOrder: readonly MissionPassId[],
): MissionDag {
  const nodes = passOrder.map((id) => Object.freeze({
    id,
    dependsOn: Object.freeze([...DEPENDENCIES[id]]),
    initialState: states.get(id) ?? 'unknown',
  }));
  return Object.freeze({ schemaVersion: 1, nodes: Object.freeze(nodes) });
}
