import { createHash } from 'node:crypto';

export type ProgressEffectKind = 'provider-deduplicated' | 'machine-reconciled' | 'non-idempotent';
export interface ProgressEffectInput { readonly runId: string; readonly unitId: string; readonly revision: number; readonly operation: string; readonly payload: string; readonly kind: ProgressEffectKind; }
export interface ProgressEffect extends ProgressEffectInput { readonly effectId: string; }
export type ProgressObservation =
  | { readonly kind: 'applied' | 'duplicate'; readonly effectId: string; readonly revision: number }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ambiguous'; readonly detail: string }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly kind: 'refused'; readonly detail: string };
export type ProgressReconciliation =
  | { readonly kind: 'applied'; readonly revision: number }
  | { readonly kind: 'retry-read' }
  | { readonly kind: 'retry-after'; readonly retryAfterMs: number }
  | { readonly kind: 'human-wait' | 'blocked'; readonly detail: string };

export interface CiCheckObservation { readonly name: string; readonly required: boolean; readonly conclusion: string; readonly sha: string; readonly url: string; }
export type CiReconciliation = { readonly kind: 'accepted'; readonly checks: readonly string[] };

const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const canonical = (input: ProgressEffectInput): string => [input.runId, input.unitId, input.revision, input.operation, input.payload, input.kind].map((part) => `${JSON.stringify(part).length}:${JSON.stringify(part)}`).join('|');
const validSha = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);

export const createProgressEffect = (input: ProgressEffectInput): ProgressEffect => {
  if (!input.runId || !input.unitId || !input.operation || !input.payload) throw new Error('progress effect identifiers and payload are required');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('progress effect revision is invalid');
  return { ...input, effectId: `progress-effect-v1:sha256:${digest(canonical(input))}` };
};

export const reconcileProgressEffect = (effect: ProgressEffect, observation: ProgressObservation): ProgressReconciliation => {
  switch (observation.kind) {
    case 'applied':
    case 'duplicate':
      if (observation.effectId !== effect.effectId || observation.revision !== effect.revision) return { kind: 'retry-read' };
      return { kind: 'applied', revision: observation.revision };
    case 'not-found':
      return effect.kind === 'non-idempotent' ? { kind: 'human-wait', detail: 'effect outcome is unknown' } : { kind: 'retry-read' };
    case 'ambiguous':
      return { kind: 'human-wait', detail: observation.detail };
    case 'rate-limited':
      if (!Number.isSafeInteger(observation.retryAfterMs) || observation.retryAfterMs < 0) return { kind: 'human-wait', detail: 'provider returned an invalid retry bound' };
      return { kind: 'retry-after', retryAfterMs: observation.retryAfterMs };
    case 'refused':
      return { kind: 'blocked', detail: observation.detail };
  }
};

export const reconcileRequiredChecks = (requiredNames: readonly string[], observations: readonly CiCheckObservation[], integrationSha: string): CiReconciliation => {
  if (!validSha(integrationSha)) throw new Error('integration SHA is invalid');
  const accepted: string[] = [];
  for (const name of requiredNames) {
    const matching = observations.filter((check) => check.name === name && check.required);
    const current = matching.find((check) => check.sha === integrationSha);
    if (current === undefined) {
      if (matching.length === 0) throw new Error(`required check is missing: ${name}`);
      throw new Error(`required check is not on the exact SHA: ${name}`);
    }
    if (current.conclusion !== 'success') throw new Error(`required check is not settled successfully: ${name}`);
    accepted.push(name);
  }
  return { kind: 'accepted', checks: accepted };
};
