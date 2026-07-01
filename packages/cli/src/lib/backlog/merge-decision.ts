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
  let context: MergeDecisionContext;
  try {
    context = JSON.parse(stdinRaw) as MergeDecisionContext;
  } catch {
    return { ok: false, error: 'stdin is not valid JSON' };
  }
  const decision = decideMerge({ ...context, autoMerge: config.autoMerge, method: config.autoMergeMethod });
  return { ok: true, decision };
}
