import type { EventStreamState } from '../events/reducer.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';

export const MAX_RECOVERY_NODES = 256;

export type RecoveryAttempt = 'initial' | 'retry' | 'replacement' | 'sequential';

export interface RecoveryReplacement {
  readonly id: string;
  readonly tier: string;
}

export interface RecoveryNode {
  readonly id: string;
  readonly tier: string;
  readonly inputHash: string;
  readonly independenceEssential: boolean;
  readonly replacement?: RecoveryReplacement;
  readonly sideEffectKey?: string;
}

export type RecoveryAction =
  | {
      readonly kind: 'run-node';
      readonly nodeId: string;
      readonly attempt: RecoveryAttempt;
      readonly specialistId: string;
      readonly tier: string;
      readonly inputHash: string;
      readonly reducedContext: boolean;
      readonly execution: 'parallel' | 'sequential';
      readonly idempotencyKey?: string;
    }
  | {
      readonly kind: 'finalize-node';
      readonly nodeId: string;
      readonly receiptId: string;
    }
  | { readonly kind: 'await-plan' }
  | { readonly kind: 'complete' }
  | { readonly kind: 'stop'; readonly reasons: readonly string[] };

export interface RecoveryDecision {
  readonly schemaVersion: 1;
  readonly status: 'active' | 'waiting' | 'complete' | 'blocked' | 'degraded';
  readonly action: RecoveryAction;
  readonly reasons: readonly string[];
}

interface NodeDefinitionResult {
  readonly nodes: readonly RecoveryNode[];
  readonly issues: readonly string[];
}

interface RecoveryEventPayload extends Readonly<Record<string, JsonValue>> {
  readonly attempt?: JsonValue;
  readonly independenceEssential?: JsonValue;
  readonly inputHash?: JsonValue;
  readonly nodeId?: JsonValue;
  readonly receiptId?: JsonValue;
  readonly replacementId?: JsonValue;
  readonly replacementTier?: JsonValue;
  readonly sideEffectKey?: JsonValue;
  readonly specialistId?: JsonValue;
  readonly tier?: JsonValue;
  readonly transient?: JsonValue;
}

function record(value: JsonValue): RecoveryEventPayload | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecoveryEventPayload
    : undefined;
}

function label(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 256
    && [...value].every((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0x20 && point !== 0x7f;
    });
}

function inputHash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isAttempt(value: unknown): value is RecoveryAttempt {
  return value === 'initial'
    || value === 'retry'
    || value === 'replacement'
    || value === 'sequential';
}

function stop(
  status: 'blocked' | 'degraded',
  reasons: readonly string[],
): RecoveryDecision {
  const stableReasons = Object.freeze([...reasons]);
  return Object.freeze({
    schemaVersion: 1,
    status,
    action: Object.freeze({ kind: 'stop', reasons: stableReasons }),
    reasons: stableReasons,
  });
}

function sameNode(left: RecoveryNode, right: RecoveryNode): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function definition(event: CanonicalEvent): RecoveryNode | string {
  const payload = record(event.payload);
  if (
    !label(event.subject)
    || !label(payload?.tier)
    || !inputHash(payload?.inputHash)
    || typeof payload?.independenceEssential !== 'boolean'
  ) {
    return `node definition '${event.subject}' is invalid`;
  }
  const replacementId = payload.replacementId;
  const replacementTier = payload.replacementTier;
  if (
    (replacementId === undefined) !== (replacementTier === undefined)
    || (replacementId !== undefined && !label(replacementId))
    || (replacementTier !== undefined && !label(replacementTier))
  ) {
    return `node definition '${event.subject}' has an invalid replacement`;
  }
  if (replacementTier !== undefined && replacementTier !== payload.tier) {
    return `node definition '${event.subject}' changes replacement tier`;
  }
  const sideEffectKey = payload.sideEffectKey;
  if (sideEffectKey !== undefined && !label(sideEffectKey)) {
    return `node definition '${event.subject}' has an invalid side-effect key`;
  }
  return Object.freeze({
    id: event.subject,
    tier: payload.tier,
    inputHash: payload.inputHash,
    independenceEssential: payload.independenceEssential,
    ...(replacementId === undefined
      ? {}
      : {
          replacement: Object.freeze({
            id: replacementId as string,
            tier: replacementTier as string,
          }),
        }),
    ...(sideEffectKey === undefined
      ? {}
      : { sideEffectKey: sideEffectKey as string }),
  });
}

export function recoveryNodesFromStream(
  stream: EventStreamState,
): NodeDefinitionResult {
  const nodes = new Map<string, RecoveryNode>();
  const issues: string[] = [];
  for (const event of stream.events) {
    if (event.kind !== 'orchestration.node-defined') continue;
    const parsed = definition(event);
    if (typeof parsed === 'string') {
      issues.push(parsed);
      continue;
    }
    const current = nodes.get(parsed.id);
    if (current !== undefined && !sameNode(current, parsed)) {
      issues.push(`node definition '${parsed.id}' changed during the mission`);
      continue;
    }
    if (current === undefined) {
      if (nodes.size >= MAX_RECOVERY_NODES) {
        issues.push(`recovery plan exceeds ${MAX_RECOVERY_NODES} nodes`);
        break;
      }
      nodes.set(parsed.id, parsed);
    }
  }
  return Object.freeze({
    nodes: Object.freeze([...nodes.values()]),
    issues: Object.freeze(issues),
  });
}

function validateNodes(nodes: readonly RecoveryNode[]): readonly string[] {
  const issues: string[] = [];
  if (nodes.length > MAX_RECOVERY_NODES) {
    issues.push(`recovery plan exceeds ${MAX_RECOVERY_NODES} nodes`);
  }
  const ids = new Set<string>();
  const sideEffectKeys = new Set<string>();
  for (const node of nodes) {
    if (!label(node.id) || !label(node.tier) || !inputHash(node.inputHash)) {
      issues.push('recovery node IDs, tiers, and input hashes must be valid');
      continue;
    }
    if (ids.has(node.id)) issues.push(`duplicate recovery node '${node.id}'`);
    ids.add(node.id);
    if (
      node.replacement !== undefined
      && (
        !label(node.replacement.id)
        || node.replacement.tier !== node.tier
      )
    ) {
      issues.push(`replacement for '${node.id}' must retain tier '${node.tier}'`);
    }
    if (node.sideEffectKey !== undefined && !label(node.sideEffectKey)) {
      issues.push(`side-effect key for '${node.id}' is invalid`);
    } else if (
      node.sideEffectKey !== undefined
      && sideEffectKeys.has(node.sideEffectKey)
    ) {
      issues.push(`side-effect key '${node.sideEffectKey}' is not unique`);
    } else if (node.sideEffectKey !== undefined) {
      sideEffectKeys.add(node.sideEffectKey);
    }
  }
  return Object.freeze(issues);
}

function receiptFor(
  stream: EventStreamState,
  node: RecoveryNode,
): { readonly receipt?: string; readonly issue?: string } {
  if (node.sideEffectKey === undefined) return Object.freeze({});
  const receipts = new Set<string>();
  for (const event of stream.events) {
    if (event.kind !== 'side-effect.completed') continue;
    const payload = record(event.payload);
    if (
      event.subject !== node.sideEffectKey
      && payload?.nodeId !== node.id
    ) continue;
    if (
      event.subject !== node.sideEffectKey
      || payload?.nodeId !== node.id
      || !label(payload.receiptId)
      || payload.inputHash !== node.inputHash
    ) {
      return Object.freeze({
        issue: `side-effect receipt for '${node.id}' is invalid`,
      });
    }
    receipts.add(payload.receiptId);
  }
  if (receipts.size > 1) {
    return Object.freeze({
      issue: `side-effect receipt for '${node.id}' is conflicting`,
    });
  }
  const receipt = [...receipts][0];
  return receipt === undefined
    ? Object.freeze({})
    : Object.freeze({ receipt });
}

function nodeLifecycleIssue(
  event: CanonicalEvent,
  node: RecoveryNode,
): string | undefined {
  if (
    event.subject !== node.id
    || (
      event.kind !== 'orchestration.node-started'
      && event.kind !== 'orchestration.node-failed'
    )
  ) return undefined;
  const payload = record(event.payload);
  if (!isAttempt(payload?.attempt)) {
    return `node '${node.id}' has an invalid recovery attempt`;
  }
  if (payload.attempt === 'sequential' && node.independenceEssential) {
    return `node '${node.id}' cannot waive required independence`;
  }
  if (
    event.kind === 'orchestration.node-started'
    && payload.attempt === 'replacement'
    && payload.specialistId !== node.replacement?.id
  ) {
    return `node '${node.id}' has an invalid replacement identity`;
  }
  if (
    event.kind === 'orchestration.node-started'
    && payload.attempt !== 'replacement'
    && payload.specialistId !== undefined
    && payload.specialistId !== node.id
  ) {
    return `node '${node.id}' has an unexpected specialist identity`;
  }
  if (event.kind === 'orchestration.node-failed') {
    const transient = payload?.transient;
    if (transient !== undefined && typeof transient !== 'boolean') {
      return `node '${node.id}' has an invalid failure classification`;
    }
  }
  return undefined;
}

function nextAttemptAfterFailure(
  node: RecoveryNode,
  event: CanonicalEvent,
): RecoveryAttempt | undefined {
  const payload = record(event.payload);
  if (payload?.attempt === 'initial' && payload.transient === true) {
    return 'retry';
  }
  if (
    (payload?.attempt === 'initial' || payload?.attempt === 'retry')
    && node.replacement !== undefined
  ) return 'replacement';
  if (payload?.attempt !== 'sequential' && !node.independenceEssential) {
    return 'sequential';
  }
  return undefined;
}

function lifecycleSequenceIssue(
  history: readonly CanonicalEvent[],
  node: RecoveryNode,
): string | undefined {
  let previous: CanonicalEvent | undefined;
  for (const current of history) {
    const currentAttempt = record(current.payload)?.attempt;
    if (current.kind === 'orchestration.node-started') {
      const expected = previous === undefined
        ? 'initial'
        : previous.kind === 'orchestration.node-failed'
          ? nextAttemptAfterFailure(node, previous)
          : undefined;
      if (currentAttempt !== expected) {
        return `node '${node.id}' has an invalid recovery transition`;
      }
    } else {
      const previousAttempt = previous === undefined
        ? undefined
        : record(previous.payload)?.attempt;
      if (
        previous?.kind !== 'orchestration.node-started'
        || previousAttempt !== currentAttempt
      ) {
        return `node '${node.id}' failure has no matching start`;
      }
    }
    previous = current;
  }
  return undefined;
}

function runAction(
  node: RecoveryNode,
  attempt: RecoveryAttempt,
): RecoveryAction {
  const replacement = attempt === 'replacement' ? node.replacement : undefined;
  return Object.freeze({
    kind: 'run-node',
    nodeId: node.id,
    attempt,
    specialistId: replacement?.id ?? node.id,
    tier: replacement?.tier ?? node.tier,
    inputHash: node.inputHash,
    reducedContext: attempt === 'retry',
    execution: attempt === 'sequential' ? 'sequential' : 'parallel',
    ...(node.sideEffectKey === undefined
      ? {}
      : { idempotencyKey: node.sideEffectKey }),
  });
}

function afterFailure(
  node: RecoveryNode,
  event: CanonicalEvent,
): RecoveryDecision {
  const attempt = nextAttemptAfterFailure(node, event);
  if (attempt === 'retry') {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: runAction(node, 'retry'),
      reasons: Object.freeze(['one reduced-context retry is allowed']),
    });
  }
  if (attempt === 'replacement') {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: runAction(node, 'replacement'),
      reasons: Object.freeze(['same-tier specialist replacement is required']),
    });
  }
  if (attempt === 'sequential') {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: runAction(node, 'sequential'),
      reasons: Object.freeze(['independence is not essential for this node']),
    });
  }
  return stop('blocked', [
    `node '${node.id}' exhausted safe recovery without waiving independence`,
  ]);
}

function decisionForNode(
  stream: EventStreamState,
  node: RecoveryNode,
): RecoveryDecision | undefined {
  const history = stream.events.filter((event) =>
    event.subject === node.id
    && (
      event.kind === 'orchestration.node-started'
      || event.kind === 'orchestration.node-failed'
    )
  );
  const issue = history
    .map((event) => nodeLifecycleIssue(event, node))
    .find((item) => item !== undefined);
  if (issue !== undefined) return stop('degraded', [issue]);
  const sequenceIssue = lifecycleSequenceIssue(history, node);
  if (sequenceIssue !== undefined) return stop('degraded', [sequenceIssue]);
  const receipt = receiptFor(stream, node);
  if (receipt.issue !== undefined) return stop('degraded', [receipt.issue]);
  if (stream.events.some((event) =>
    event.kind === 'orchestration.node-completed' && event.subject === node.id
  )) return undefined;
  if (receipt.receipt !== undefined) {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: Object.freeze({
        kind: 'finalize-node',
        nodeId: node.id,
        receiptId: receipt.receipt,
      }),
      reasons: Object.freeze(['side effect already has a durable receipt']),
    });
  }
  const latest = history.at(-1);
  if (latest === undefined) {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: runAction(node, 'initial'),
      reasons: Object.freeze(['node has not started']),
    });
  }
  const payload = record(latest.payload);
  if (latest.kind === 'orchestration.node-started') {
    return Object.freeze({
      schemaVersion: 1,
      status: 'active',
      action: runAction(node, payload?.attempt as RecoveryAttempt),
      reasons: Object.freeze(['resume uses the durable attempt and idempotency key']),
    });
  }
  return afterFailure(node, latest);
}

export function planMissionRecovery(
  stream: EventStreamState,
  declaredNodes?: readonly RecoveryNode[],
): RecoveryDecision {
  if (stream.continuity === 'partial' || stream.duplicateEventIds > 0) {
    return stop('degraded', ['event continuity cannot be proved']);
  }
  const missionId = stream.events[0]?.missionId;
  if (
    missionId !== undefined
    && stream.events.some((event) =>
      event.missionId !== missionId || event.correlationId !== missionId
    )
  ) {
    return stop('degraded', ['cross-mission event linkage was observed']);
  }
  const derived = declaredNodes === undefined
    ? recoveryNodesFromStream(stream)
    : Object.freeze({ nodes: declaredNodes, issues: Object.freeze([]) });
  const issues = [...derived.issues, ...validateNodes(derived.nodes)];
  if (issues.length > 0) return stop('degraded', issues);
  if (derived.nodes.length === 0) {
    return Object.freeze({
      schemaVersion: 1,
      status: 'waiting',
      action: Object.freeze({ kind: 'await-plan' }),
      reasons: Object.freeze(['no durable orchestration node is defined']),
    });
  }
  for (const node of derived.nodes) {
    const decision = decisionForNode(stream, node);
    if (decision !== undefined) return decision;
  }
  return Object.freeze({
    schemaVersion: 1,
    status: 'complete',
    action: Object.freeze({ kind: 'complete' }),
    reasons: Object.freeze([]),
  });
}

export function recoveryCheckpoint(stream: EventStreamState): string {
  return stream.events
    .filter((event) => event.kind !== 'mission.resumed')
    .at(-1)?.eventId ?? 'empty';
}
