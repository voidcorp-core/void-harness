// Compose the (already tested) auto-merge gates into a single dry-run decision. Pure: it decides,
// it never merges. The skill's Layer-1 step feeds it observations and acts on the result via gh.

import {
  type AutoMergeRisk,
  type MergeObservation,
  autoMergeGate,
  classifyMergeState,
  protectionGate,
} from './auto-merge.js';
import { assertSubscription } from './billing.js';
import type { ProtectionStatus } from './branch-protection.js';
import { parseFlags, resolveConfig } from './config.js';
import { riskSignalsFromDiff } from './merge-risk.js';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MergeDecisionInput {
  readonly autoMerge: boolean;
  readonly method?: MergeMethod;
  readonly clusterId: string;
  /** Files in the integration PR's diff. */
  readonly files: readonly string[];
  /** Another cluster stacks on this one. Always false in the attended MVP. */
  readonly isStackRoot?: boolean;
  readonly protection: ProtectionStatus;
  readonly observation: MergeObservation;
  readonly maxFiles?: number;
}

export interface MergeDecision {
  readonly arm: boolean;
  readonly action: 'merge' | 'rebase' | 'wait' | 'block';
  readonly method: MergeMethod;
  readonly reason: string;
}

/**
 * Decide whether to arm `gh pr merge` for one reconciled integration PR. Order: auto-merge
 * requested? -> branch protection (unknown = fatal under auto-merge) -> risk gate (low-risk only)
 * -> live merge state (clean/conflict/checks/base). Arms only when all three say go.
 */
export function decideMerge(input: MergeDecisionInput): MergeDecision {
  const method: MergeMethod = input.method ?? 'merge';
  if (!input.autoMerge) return { arm: false, action: 'block', method, reason: 'auto-merge not requested' };

  const protection = protectionGate(input.protection, input.autoMerge);
  if (!protection.proceed) {
    return { arm: false, action: 'block', method, reason: protection.reason ?? 'branch protection gate' };
  }

  const risk: AutoMergeRisk = {
    clusterId: input.clusterId,
    isStackRoot: input.isStackRoot ?? false,
    ...riskSignalsFromDiff(input.files),
  };
  const gate = autoMergeGate(risk, input.autoMerge, { maxFiles: input.maxFiles ?? 10 });
  if (!gate.arm) return { arm: false, action: 'block', method, reason: gate.reason };

  const state = classifyMergeState(input.observation, input.autoMerge);
  if (state.kind !== 'merge') {
    const reason = state.kind === 'block' ? state.reason : `not ready to merge (${state.kind})`;
    return { arm: false, action: state.kind, method, reason };
  }
  return { arm: true, action: 'merge', method, reason: gate.reason };
}

/** Observation context on stdin; autoMerge/method come from the resolved flags, not the JSON. */
export type MergeDecisionContext = Omit<MergeDecisionInput, 'autoMerge' | 'method'>;

export type MergeDecisionResult =
  | { readonly ok: true; readonly decision: MergeDecision }
  | { readonly ok: false; readonly error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
function isOneOf<T extends string>(v: unknown, opts: readonly T[]): v is T {
  return typeof v === 'string' && opts.some((o) => o === v);
}

function parseProtection(v: unknown): ProtectionStatus | undefined {
  if (!isRecord(v)) return undefined;
  if (v.kind === 'protected' || v.kind === 'unprotected') return { kind: v.kind };
  if (v.kind === 'unknown') {
    return { kind: 'unknown', reason: typeof v.reason === 'string' ? v.reason : 'unspecified' };
  }
  return undefined;
}

function parseObservation(v: unknown): MergeObservation | undefined {
  if (!isRecord(v)) return undefined;
  if (
    isOneOf(v.mergeable, ['clean', 'conflict', 'unknown'] as const) &&
    isOneOf(v.checks, ['pass', 'pending', 'fail'] as const) &&
    typeof v.baseUpToDate === 'boolean' &&
    isOneOf(v.protection, ['protected', 'unprotected', 'unknown'] as const)
  ) {
    return {
      mergeable: v.mergeable,
      checks: v.checks,
      baseUpToDate: v.baseUpToDate,
      protection: v.protection,
    };
  }
  return undefined;
}

/**
 * Validate the observation context from stdin (a trust boundary — the payload is built by an LLM
 * from gh output). Returns typed data or a precise error; never lets a structurally-wrong-but-valid
 * JSON (e.g. files:null) reach the pure gates and throw.
 */
function parseContext(raw: string): { readonly ok: true; readonly value: MergeDecisionContext } | { readonly ok: false; readonly error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'stdin is not valid JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'stdin must be a JSON object' };
  if (typeof parsed.clusterId !== 'string') return { ok: false, error: 'clusterId (string) is required' };
  if (!isStringArray(parsed.files)) return { ok: false, error: 'files (string[]) is required' };
  const protection = parseProtection(parsed.protection);
  if (protection === undefined) {
    return { ok: false, error: 'protection {kind: protected|unprotected|unknown} is required' };
  }
  const observation = parseObservation(parsed.observation);
  if (observation === undefined) {
    return { ok: false, error: 'observation {mergeable, checks, baseUpToDate, protection} is required' };
  }
  return {
    ok: true,
    value: {
      clusterId: parsed.clusterId,
      files: parsed.files,
      protection,
      observation,
      ...(typeof parsed.isStackRoot === 'boolean' ? { isStackRoot: parsed.isStackRoot } : {}),
      ...(typeof parsed.maxFiles === 'number' ? { maxFiles: parsed.maxFiles } : {}),
    },
  };
}

/**
 * Command core: resolve `--auto-merge` / `--auto-merge-method` from the args (flags > env >
 * defaults), run the subscription preflight when auto-merge is on, parse the observation context
 * from stdin, and decide. Pure (args/stdin/env in, result out) — the command does only I/O + exit.
 */
export function resolveMergeDecision(
  args: readonly string[],
  stdinRaw: string,
  env: Record<string, string | undefined>,
): MergeDecisionResult {
  const config = resolveConfig({ flags: parseFlags(args), env, file: {} });
  if (config.autoMerge) {
    const preflight = assertSubscription(env, config.allowApi);
    if (!preflight.ok) return { ok: false, error: preflight.reason ?? 'subscription preflight failed' };
  }
  const parsed = parseContext(stdinRaw);
  if (!parsed.ok) return parsed;
  const decision = decideMerge({ ...parsed.value, autoMerge: config.autoMerge, method: config.autoMergeMethod });
  return { ok: true, decision };
}
