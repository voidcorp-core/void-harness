// The active program contract: the durable, human-authored consent that says
// which program is executing, which tracker owns its state, and whether
// autopilot may act at all.
//
// `plans/ACTIVE.md` is a stable pointer, never a cursor — it deliberately holds
// no current or next ticket, because the tracker owns progress. What lives here
// is what a session cannot rediscover: intent, scope, and permission.
//
// Every field is validated on read. A file that is present but wrong is an
// error, never a shrug: silently falling back to a default would let a typo in
// `mergeGate` hand a merge to a machine.

import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { autopilotFailure } from './errors.js';

export type ProgramStatus = 'executing' | 'completed';

export interface TrackerScope {
  /** Only `linear` is supported at this increment. */
  readonly provider: 'linear';
  /** Native workspace/project/repository query, opaque to the harness. */
  readonly scope: string;
  /** Deterministic tie-break order among simultaneously ready tickets. */
  readonly issues: readonly string[];
  /** Native states meaning "may be started". */
  readonly readyStates: readonly string[];
  readonly startedState: string;
  readonly reviewState: string;
  readonly doneStates: readonly string[];
}

export interface AutopilotOwnership {
  /** Paths a single writer must own; anything touching them runs sequentially. */
  readonly sequential: readonly string[];
  /** Generated artefacts only the reconciler may rebuild. */
  readonly reconcileOnly: readonly string[];
}

export interface AutopilotConfig {
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  /** Ceiling on one cluster, 1..4. */
  readonly clusterSize: number;
  /** `auto` resolves develop then main; anything else must exist. */
  readonly base: string;
  /** Only `human` is accepted: merging is the human boundary of the feature. */
  readonly mergeGate: 'human';
  /** argv arrays, executed with shell:false. */
  readonly verifyCommands: readonly (readonly string[])[];
  readonly ownership: AutopilotOwnership;
}

export interface ActiveProgram {
  readonly status: ProgramStatus;
  readonly program: string;
  readonly plan: string;
  readonly spec: string;
  readonly tracker: TrackerScope;
  readonly humanGates: readonly string[];
  readonly autopilot: AutopilotConfig;
}

const DEFAULT_ACTIVE_PATH = join('plans', 'ACTIVE.md');
const MAX_CLUSTER_SIZE = 4;
const SUPPORTED_PROVIDERS = ['linear'] as const;

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_ACTIVE_PROGRAM', problem, cause, fix);
}

function frontmatterOf(text: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) {
    invalid(
      'the active program file carries no frontmatter',
      'the file does not open with a `---` delimited YAML block',
      'start the file with a `---` block declaring status, program, plan, spec, tracker and autopilot',
    );
  }
  return match[1] as string;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(
      `the active program has no usable \`${field}\` block`,
      `\`${field}\` is ${Array.isArray(value) ? 'a list' : String(value)}, not a mapping`,
      `declare \`${field}:\` as a mapping of its documented fields`,
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(source: Record<string, unknown>, field: string, context: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(
      `the active program is missing \`${context}.${field}\``,
      value === undefined ? `\`${field}\` is absent` : `\`${field}\` is not a non-empty string`,
      `set \`${field}\` in the \`${context}\` block to the value it names`,
    );
  }
  return value;
}

function nonEmptyStringList(value: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
  ) {
    invalid(
      `the active program has no usable \`${field}\``,
      `\`${field}\` must be a non-empty list of non-empty strings`,
      `declare \`${field}\` as a YAML list naming the values your tracker actually uses`,
    );
  }
  return value as string[];
}

/**
 * Repo-relative and non-escaping. A program that can point at `/etc` or `../`
 * is a path traversal with a YAML syntax, so the check lives at the contract
 * boundary rather than at each consumer.
 */
function confinedPath(value: string, field: string): string {
  if (isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    invalid(
      `the active program \`${field}\` leaves the repository`,
      `\`${value}\` is absolute or walks up out of the project root`,
      `set \`${field}\` to a path relative to the repository root, without \`..\``,
    );
  }
  return value;
}

function pathList(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    invalid(
      `the active program \`${field}\` is not a list of paths`,
      `\`${field}\` must be a list of non-empty strings`,
      `declare \`${field}\` as a YAML list of repo-relative path patterns`,
    );
  }
  return (value as string[]).map((entry) => confinedPath(entry, field));
}

function verifyCommands(value: unknown): readonly (readonly string[])[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    invalid(
      'the active program `autopilot.verifyCommands` is not a list',
      `\`verifyCommands\` is ${String(value)}`,
      'declare `verifyCommands` as a list of argv arrays, for example `- [pnpm, test]`',
    );
  }
  return value.map((command) => {
    // argv arrays only: a bare string would have to be split by a shell, and
    // shell:false is precisely what keeps a project's verify step from being an
    // injection point.
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.some((word) => typeof word !== 'string' || word.trim().length === 0)
    ) {
      invalid(
        'the active program has an unusable entry in `autopilot.verifyCommands`',
        `\`${JSON.stringify(command)}\` is not a non-empty array of non-empty strings`,
        'write each command as an argv array, for example `- [pnpm, test]`; commands run with shell:false',
      );
    }
    return command as string[];
  });
}

function parseAutopilot(value: unknown): AutopilotConfig {
  if (value === undefined) {
    invalid(
      'the active program declares no `autopilot` block',
      'the contract requires an explicit autopilot decision, even a negative one',
      'add an `autopilot:` block with `schemaVersion: 1`, `enabled: false` and `mergeGate: human` to opt out',
    );
  }
  const block = record(value, 'autopilot');

  const schemaVersion = block.schemaVersion;
  if (schemaVersion !== 1) {
    invalid(
      'the active program declares an autopilot schema this CLI cannot read',
      schemaVersion === undefined
        ? '`autopilot.schemaVersion` is absent'
        : `\`autopilot.schemaVersion\` is ${String(schemaVersion)}`,
      'set `autopilot.schemaVersion: 1`, or upgrade the harness to a version that reads this schema',
    );
  }

  if (typeof block.enabled !== 'boolean') {
    invalid(
      'the active program does not say whether autopilot is enabled',
      '`autopilot.enabled` is not a boolean',
      'set `autopilot.enabled` to true or false; consent is never inferred',
    );
  }

  if (block.mergeGate !== 'human') {
    invalid(
      'the active program declares a merge gate autopilot will not honour',
      `\`autopilot.mergeGate\` is ${String(block.mergeGate)}, and only \`human\` exists`,
      'set `autopilot.mergeGate: human`; merging the integration PR is a human action',
    );
  }

  const clusterSize = block.clusterSize ?? MAX_CLUSTER_SIZE;
  if (!Number.isInteger(clusterSize) || (clusterSize as number) < 1 || (clusterSize as number) > MAX_CLUSTER_SIZE) {
    invalid(
      'the active program declares an unusable cluster size',
      `\`autopilot.clusterSize\` is ${String(clusterSize)}, outside 1..${MAX_CLUSTER_SIZE}`,
      `set \`autopilot.clusterSize\` between 1 and ${MAX_CLUSTER_SIZE}`,
    );
  }

  const base = block.base ?? 'auto';
  if (typeof base !== 'string' || base.trim().length === 0) {
    invalid(
      'the active program declares an unusable base branch',
      '`autopilot.base` is not a non-empty string',
      'set `autopilot.base` to `auto`, or to the exact name of an existing branch',
    );
  }

  const ownership = block.ownership === undefined ? {} : record(block.ownership, 'autopilot.ownership');
  return {
    schemaVersion: 1,
    enabled: block.enabled,
    clusterSize: clusterSize as number,
    base,
    mergeGate: 'human',
    verifyCommands: verifyCommands(block.verifyCommands),
    ownership: {
      sequential: pathList(ownership.sequential, 'autopilot.ownership.sequential'),
      reconcileOnly: pathList(ownership.reconcileOnly, 'autopilot.ownership.reconcileOnly'),
    },
  };
}

function parseTracker(value: unknown): TrackerScope {
  const block = record(value, 'tracker');
  const provider = requiredString(block, 'provider', 'tracker');
  if (!SUPPORTED_PROVIDERS.includes(provider as (typeof SUPPORTED_PROVIDERS)[number])) {
    invalid(
      'the active program names a tracker provider this harness does not support',
      `\`tracker.provider\` is \`${provider}\`; supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
      'set `tracker.provider: linear`, or drive this program manually until its provider ships',
    );
  }

  return {
    provider: 'linear',
    scope: requiredString(block, 'scope', 'tracker'),
    issues: nonEmptyStringList(block.issues, 'tracker.issues'),
    readyStates: nonEmptyStringList(block.readyStates, 'tracker.readyStates'),
    startedState: requiredString(block, 'startedState', 'tracker'),
    reviewState: requiredString(block, 'reviewState', 'tracker'),
    doneStates: nonEmptyStringList(block.doneStates, 'tracker.doneStates'),
  };
}

/** Pure: validate the frontmatter of an active program file. */
export function parseActiveProgram(text: string): ActiveProgram {
  const frontmatter = frontmatterOf(text);

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter);
  } catch (error) {
    invalid(
      'the active program frontmatter is not valid YAML',
      error instanceof Error ? error.message : String(error),
      'fix the YAML syntax reported above in the frontmatter block',
    );
  }
  const root = record(parsed, 'frontmatter');

  const status = root.status;
  if (status !== 'executing' && status !== 'completed') {
    invalid(
      'the active program declares an unknown status',
      `\`status\` is ${String(status)}`,
      'set `status` to `executing` while the program runs, or `completed` once it is finished',
    );
  }

  const humanGates = root.humanGates;
  if (humanGates !== undefined && (!Array.isArray(humanGates) || humanGates.some((g) => typeof g !== 'string'))) {
    invalid(
      'the active program lists unusable human gates',
      '`humanGates` must be a list of ticket identifiers',
      'declare `humanGates` as a YAML list of ticket ids, or remove it',
    );
  }

  return {
    status,
    program: requiredString(root, 'program', 'frontmatter'),
    plan: confinedPath(requiredString(root, 'plan', 'frontmatter'), 'plan'),
    spec: confinedPath(requiredString(root, 'spec', 'frontmatter'), 'spec'),
    tracker: parseTracker(root.tracker),
    humanGates: (humanGates as string[] | undefined) ?? [],
    autopilot: parseAutopilot(root.autopilot),
  };
}

/**
 * Read the active program of a project, or undefined when it declares none.
 *
 * Absent is a normal state — most projects run no program. Present-but-invalid
 * is not: it surfaces, because a broken contract that reads as "no program"
 * would silently disable every guarantee the file exists to carry.
 */
export function readActiveProgram(root: string, relativePath: string = DEFAULT_ACTIVE_PATH): ActiveProgram | undefined {
  const rootPath = resolve(root);
  const target = resolve(rootPath, relativePath);
  if (isAbsolute(relativePath) || (target !== rootPath && !target.startsWith(rootPath + sep))) {
    invalid(
      'the requested active program file is outside the project root',
      `\`${relativePath}\` resolves to ${target}, which is not under ${rootPath}`,
      'pass a path relative to the project root, without `..`',
    );
  }

  let text: string;
  try {
    text = readFileSync(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    invalid(
      'the active program file could not be read',
      error instanceof Error ? error.message : String(error),
      'check the file permissions, then run the command again',
    );
  }
  return parseActiveProgram(text);
}
