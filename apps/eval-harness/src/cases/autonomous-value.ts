import type {
  AutonomousValueCell,
  AutonomousValueCellId,
  AutonomousValueComparability,
  AutonomousValueCondition,
  AutonomousValueManifest,
  AutonomousValuePath,
} from '../types.js';

const PATHS = ['implement', 'autopilot', 'brainstorm'] as const;
const CONDITIONS = ['agent-alone', 'implement', 'autopilot'] as const;
const PATH_SET = new Set<string>(PATHS);
const CONDITION_SET = new Set<string>(CONDITIONS);
const CELL_ID_SET = new Set<string>(
  PATHS.flatMap((path) => CONDITIONS.map((condition) => `${path}-${condition}`)),
);
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_FIXTURE_PATH = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const MAX_TEXT_LENGTH = 512;
const MAX_ORACLE_ITEMS = 16;

export type AutonomousValueManifestError =
  | { readonly kind: 'invalid-manifest' }
  | { readonly kind: 'invalid-comparability' }
  | { readonly kind: 'unsupported-schema'; readonly schemaVersion: number }
  | { readonly kind: 'invalid-cell'; readonly cellId: string }
  | {
      readonly kind: 'incomparable-cell';
      readonly cellId: string;
      readonly field: 'startCommit' | 'objective' | 'fixture';
    }
  | { readonly kind: 'duplicate-cell-id'; readonly cellId: string }
  | { readonly kind: 'incomplete-matrix'; readonly missingCellId: string };

export type AutonomousValueManifestResult =
  | { readonly ok: true; readonly value: AutonomousValueManifest }
  | { readonly ok: false; readonly error: AutonomousValueManifestError };

type RecordValue = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is RecordValue {
  return value instanceof Object && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isPath(value: unknown): value is AutonomousValuePath {
  return typeof value === 'string' && PATH_SET.has(value);
}

function isCondition(value: unknown): value is AutonomousValueCondition {
  return typeof value === 'string' && CONDITION_SET.has(value);
}

function isCellId(value: string): value is AutonomousValueCellId {
  return CELL_ID_SET.has(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return isUnknownArray(value)
    && value.length > 0
    && value.length <= MAX_ORACLE_ITEMS
    && value.every((item) => typeof item === 'string'
      && item.length > 0
      && item.length <= MAX_TEXT_LENGTH);
}

function hasOnlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function isFixturePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && SAFE_FIXTURE_PATH.test(value);
}

function cellIdAt(value: RecordValue, index: number): string {
  return typeof value['id'] === 'string' ? value['id'] : `cell-${index}`;
}

function parseCell(
  value: unknown,
  index: number,
): AutonomousValueCell | AutonomousValueManifestError {
  if (!isRecord(value)) return { kind: 'invalid-cell', cellId: `cell-${index}` };

  if (!hasOnlyKeys(value, [
    'id', 'path', 'condition', 'startCommit', 'objective', 'defectOracle', 'fixture',
    'fixtureDigest',
  ])) return { kind: 'invalid-cell', cellId: cellIdAt(value, index) };

  const id = cellIdAt(value, index);
  const path = value['path'];
  const condition = value['condition'];
  const startCommit = value['startCommit'];
  const objective = value['objective'];
  const defectOracle = value['defectOracle'];
  const fixture = value['fixture'];
  const fixtureDigest = value['fixtureDigest'];
  const expectedId = isPath(path) && isCondition(condition) ? `${path}-${condition}` : id;

  if (
    id !== expectedId
    || !isCellId(id)
    || !isPath(path)
    || !isCondition(condition)
    || typeof startCommit !== 'string'
    || !COMMIT_SHA.test(startCommit)
    || !isText(objective)
    || !isStringArray(defectOracle)
    || !isFixturePath(fixture)
    || typeof fixtureDigest !== 'string'
    || !DIGEST.test(fixtureDigest)
  ) {
    return { kind: 'invalid-cell', cellId: id };
  }

  return {
    id,
    path,
    condition,
    startCommit,
    objective,
    defectOracle: Object.freeze([...defectOracle]),
    fixture: Object.freeze({ path: fixture, digest: fixtureDigest }),
  };
}

function parseComparability(value: unknown): AutonomousValueComparability | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'runtime', 'model', 'modelVersion', 'effort', 'resourceProfile', 'orderSeed',
    'humanIntervention',
  ])) return undefined;

  const runtime = value['runtime'];
  const model = value['model'];
  const modelVersion = value['modelVersion'];
  const effort = value['effort'];
  const resourceProfile = value['resourceProfile'];
  const orderSeed = value['orderSeed'];
  const humanIntervention = value['humanIntervention'];
  if (
    !isText(runtime)
    || !isText(model)
    || !isText(modelVersion)
    || !isText(effort)
    || !isText(resourceProfile)
    || !isText(orderSeed)
    || humanIntervention !== 'none'
  ) return undefined;

  return { runtime, model, modelVersion, effort, resourceProfile, orderSeed, humanIntervention };
}

function requiredCellIds(): readonly string[] {
  return PATHS.flatMap((path) => CONDITIONS.map((condition) => `${path}-${condition}`));
}

function validateCellComparability(
  cells: readonly AutonomousValueCell[],
): AutonomousValueManifestError | undefined {
  const first = cells[0];
  if (first === undefined) return { kind: 'invalid-manifest' };

  for (const cell of cells) {
    if (cell.startCommit !== first.startCommit) {
      return { kind: 'incomparable-cell', cellId: cell.id, field: 'startCommit' };
    }
  }

  const firstByPath = new Map<AutonomousValuePath, AutonomousValueCell>();
  for (const cell of cells) {
    const firstForPath = firstByPath.get(cell.path);
    if (firstForPath === undefined) {
      firstByPath.set(cell.path, cell);
      continue;
    }
    if (cell.objective !== firstForPath.objective) {
      return { kind: 'incomparable-cell', cellId: cell.id, field: 'objective' };
    }
    if (
      cell.fixture.path !== firstForPath.fixture.path
      || cell.fixture.digest !== firstForPath.fixture.digest
    ) {
      return { kind: 'incomparable-cell', cellId: cell.id, field: 'fixture' };
    }
  }
  return undefined;
}

function normalizeCells(
  cells: readonly AutonomousValueCell[],
): Readonly<Record<AutonomousValueCellId, AutonomousValueCell>> {
  const byId = new Map(cells.map((cell) => [cell.id, Object.freeze(cell)]));
  const cellAt = (id: AutonomousValueCellId): AutonomousValueCell => {
    const cell = byId.get(id);
    if (cell === undefined) throw new Error(`AUTONOMOUS_VALUE_INVARIANT: missing ${id}`);
    return cell;
  };
  return Object.freeze({
    'implement-agent-alone': cellAt('implement-agent-alone'),
    'implement-implement': cellAt('implement-implement'),
    'implement-autopilot': cellAt('implement-autopilot'),
    'autopilot-agent-alone': cellAt('autopilot-agent-alone'),
    'autopilot-implement': cellAt('autopilot-implement'),
    'autopilot-autopilot': cellAt('autopilot-autopilot'),
    'brainstorm-agent-alone': cellAt('brainstorm-agent-alone'),
    'brainstorm-implement': cellAt('brainstorm-implement'),
    'brainstorm-autopilot': cellAt('brainstorm-autopilot'),
  });
}

export function parseAutonomousValueManifest(input: unknown): AutonomousValueManifestResult {
  if (!isRecord(input) || !hasOnlyKeys(input, [
    'schemaVersion', 'campaignId', 'comparability', 'cells',
  ])) {
    return { ok: false, error: { kind: 'invalid-manifest' } };
  }

  const schemaVersion = input['schemaVersion'];
  if (schemaVersion !== 1) {
    return {
      ok: false,
      error: {
        kind: 'unsupported-schema',
        schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 0,
      },
    };
  }

  if (!isText(input['campaignId'])) {
    return { ok: false, error: { kind: 'invalid-manifest' } };
  }
  const comparability = parseComparability(input['comparability']);
  if (!isUnknownArray(input['cells'])) {
    return { ok: false, error: { kind: 'invalid-manifest' } };
  }
  if (comparability === undefined) {
    return { ok: false, error: { kind: 'invalid-comparability' } };
  }

  const cells: AutonomousValueCell[] = [];
  const seen = new Set<string>();
  for (const [index, rawCell] of input['cells'].entries()) {
    const candidateId = isRecord(rawCell) ? cellIdAt(rawCell, index) : undefined;
    if (candidateId !== undefined && seen.has(candidateId)) {
      return { ok: false, error: { kind: 'duplicate-cell-id', cellId: candidateId } };
    }
    const parsed = parseCell(rawCell, index);
    if ('kind' in parsed) return { ok: false, error: parsed };
    if (seen.has(parsed.id)) {
      return { ok: false, error: { kind: 'duplicate-cell-id', cellId: parsed.id } };
    }
    seen.add(parsed.id);
    cells.push(parsed);
  }

  if (cells.length !== requiredCellIds().length) {
    const missingCellId = requiredCellIds().find((id) => !seen.has(id));
    if (missingCellId !== undefined) {
      return { ok: false, error: { kind: 'incomplete-matrix', missingCellId } };
    }
    return { ok: false, error: { kind: 'invalid-manifest' } };
  }

  const comparabilityError = validateCellComparability(cells);
  if (comparabilityError !== undefined) return { ok: false, error: comparabilityError };

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      campaignId: input['campaignId'],
      comparability: Object.freeze(comparability),
      cells: normalizeCells(cells),
    }),
  };
}
