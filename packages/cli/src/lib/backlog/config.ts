// Resolved configuration for `void-harness backlog-autopilot`.
//
// Precedence is `flags > env > .void/autonomous.json > defaults`, resolved
// field by field. The merge (`resolveConfig`) is pure and table-tested; I/O
// (reading the file) lives in the command, and the interactive wizard
// (Step 6) writes the file — neither belongs here.

/**
 * The GitHub merge strategy backlog-autopilot may arm for an integration PR.
 * `merge` (a merge commit) preserves the cluster's per-ticket history, so it is
 * the default; `squash` would collapse N tickets into one commit, against
 * commit-discipline's "the git log is documentation". This is a configuration
 * value (set by flag/env/file), so it lives in the config layer; the execution
 * layer (`integrate.ts`) imports it from here.
 */
export type MergeMethod = 'merge' | 'squash' | 'rebase';

const MERGE_METHODS: readonly MergeMethod[] = ['merge', 'squash', 'rebase'];

/** Narrow an arbitrary string to a MergeMethod, or undefined when unrecognized. */
export function parseMergeMethod(raw: string | undefined): MergeMethod | undefined {
  return MERGE_METHODS.includes(raw as MergeMethod) ? (raw as MergeMethod) : undefined;
}

export interface BacklogConfig {
  /** Human description of the eligible Linear view (team/project/cycle). */
  readonly linearScope: string;
  /** Linear state that means "ready to work". */
  readonly targetState: string;
  /** Linear state a finished ticket moves to (human merges from there). */
  readonly reviewState: string;
  /** Per-ticket branch prefix. */
  readonly branchPrefix: string;
  /** Hard cap on tickets worked this run. */
  readonly maxIterations: number;
  /** Consecutive failures before the circuit breaker stops the loop. */
  readonly maxFailures: number;
  /** Model for the worker sessions, or undefined for the CLI default. */
  readonly model: string | undefined;
  /** Merge the PR after green CI + close the ticket (HITL escape hatch). */
  readonly autoMerge: boolean;
  /** Strategy for the armed auto-merge; `merge` keeps per-ticket history (#31). */
  readonly autoMergeMethod: MergeMethod;
  /** Opt-in: do NOT strip API creds, allowing pay-per-token billing. */
  readonly allowApi: boolean;
  /** Render the live append-only flux (false → `--no-stream` text fallback). */
  readonly stream: boolean;
  /** Resolve + print config and exit without spawning any worker. */
  readonly dryRun: boolean;
  /** Pass `--dangerously-skip-permissions` (sandbox-gated downstream). */
  readonly fullAuto: boolean;
}

/** Flags actually present on the command line. Absent keys are omitted. */
export interface FlagConfig {
  readonly linearScope?: string;
  readonly targetState?: string;
  readonly reviewState?: string;
  readonly branchPrefix?: string;
  readonly maxIterations?: number;
  readonly maxFailures?: number;
  readonly model?: string;
  readonly autoMerge?: boolean;
  readonly autoMergeMethod?: MergeMethod;
  readonly allowApi?: boolean;
  readonly stream?: boolean;
  readonly dryRun?: boolean;
  readonly fullAuto?: boolean;
}

/** Shape of `.void/autonomous.json` (every key optional). */
export interface FileConfig {
  readonly linearScope?: string;
  readonly targetState?: string;
  readonly reviewState?: string;
  readonly branchPrefix?: string;
  readonly maxIterations?: number;
  readonly maxFailures?: number;
  readonly model?: string;
  readonly autoMerge?: boolean;
  readonly autoMergeMethod?: MergeMethod;
}

export interface ConfigSources {
  readonly flags: FlagConfig;
  readonly env: Record<string, string | undefined>;
  readonly file: FileConfig | undefined;
}

const DEFAULTS = {
  linearScope: 'the default Linear team backlog',
  targetState: 'Todo',
  reviewState: 'In Review',
  branchPrefix: 'auto/',
  maxIterations: 20,
  maxFailures: 2,
  autoMerge: false,
  autoMergeMethod: 'merge',
} as const;

/** Extract `--name value` or `--name=value`; undefined if absent. */
function flagValue(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) return args[i + 1];
  }
  return undefined;
}

/** Parse an integer, or undefined when the input is missing or non-numeric. */
function intOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Map "1"/"true" → true, "0"/"false" → false, anything else → undefined. */
function boolOrUndefined(raw: string | undefined): boolean | undefined {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return undefined;
}

/** Pure parse of argv into the flags that were actually provided. */
export function parseFlags(args: readonly string[]): FlagConfig {
  const flags: Record<string, unknown> = {};
  const setStr = (key: string, name: string) => {
    const v = flagValue(args, name);
    if (v !== undefined) flags[key] = v;
  };
  const setInt = (key: string, name: string) => {
    const v = intOrUndefined(flagValue(args, name));
    if (v !== undefined) flags[key] = v;
  };

  setStr('linearScope', 'scope');
  setStr('targetState', 'target');
  setStr('reviewState', 'review');
  setStr('branchPrefix', 'branch-prefix');
  setInt('maxIterations', 'max');
  setInt('maxFailures', 'max-failures');
  setStr('model', 'model');

  const method = parseMergeMethod(flagValue(args, 'auto-merge-method'));
  if (method !== undefined) flags.autoMergeMethod = method;

  if (args.includes('--auto-merge')) flags.autoMerge = true;
  if (args.includes('--allow-api')) flags.allowApi = true;
  if (args.includes('--no-stream')) flags.stream = false;
  if (args.includes('--dry-run')) flags.dryRun = true;
  if (args.includes('--full-auto')) flags.fullAuto = true;

  return flags as FlagConfig;
}

/** First defined of flag, env, file; else the default. */
function pickStr(
  flag: string | undefined,
  env: string | undefined,
  file: string | undefined,
  fallback: string,
): string {
  return flag ?? env ?? file ?? fallback;
}

function pickInt(
  flag: number | undefined,
  env: string | undefined,
  file: number | undefined,
  fallback: number,
): number {
  return flag ?? intOrUndefined(env) ?? file ?? fallback;
}

function pickBool(
  flag: boolean | undefined,
  env: string | undefined,
  file: boolean | undefined,
  fallback: boolean,
): boolean {
  return flag ?? boolOrUndefined(env) ?? file ?? fallback;
}

/** Merge the three sources into a fully-resolved config (pure). */
export function resolveConfig({ flags, env, file }: ConfigSources): BacklogConfig {
  const f = file ?? {};
  const model = flags.model ?? (env.MODEL || undefined) ?? f.model;
  return {
    linearScope: pickStr(flags.linearScope, env.LINEAR_SCOPE, f.linearScope, DEFAULTS.linearScope),
    targetState: pickStr(flags.targetState, env.TARGET_STATE, f.targetState, DEFAULTS.targetState),
    reviewState: pickStr(flags.reviewState, env.REVIEW_STATE, f.reviewState, DEFAULTS.reviewState),
    branchPrefix: pickStr(flags.branchPrefix, env.BRANCH_PREFIX, f.branchPrefix, DEFAULTS.branchPrefix),
    maxIterations: pickInt(flags.maxIterations, env.MAX_ITERATIONS, f.maxIterations, DEFAULTS.maxIterations),
    maxFailures: pickInt(flags.maxFailures, env.MAX_FAILURES, f.maxFailures, DEFAULTS.maxFailures),
    model: model === '' ? undefined : model,
    autoMerge: pickBool(flags.autoMerge, env.AUTO_MERGE, f.autoMerge, DEFAULTS.autoMerge),
    autoMergeMethod:
      flags.autoMergeMethod ??
      parseMergeMethod(env.AUTO_MERGE_METHOD) ??
      f.autoMergeMethod ??
      DEFAULTS.autoMergeMethod,
    allowApi: flags.allowApi ?? false,
    stream: flags.stream ?? true,
    dryRun: flags.dryRun ?? false,
    fullAuto: flags.fullAuto ?? boolOrUndefined(env.UNSAFE_FULL_AUTO) ?? false,
  };
}
