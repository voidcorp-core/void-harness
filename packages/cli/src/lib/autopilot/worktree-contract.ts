// tdd-cover: e2e packages/cli/src/commands/autopilot-worktrees.test.ts
// Zod 4 strict objects: https://zod.dev/api#zstrictobject. No implicit legacy migration.
import { z } from 'zod';
import { autopilotFailure } from './errors.js';

export const WORKTREE_SHA = z.string().regex(/^[0-9a-f]{40}$/);
const text = z.string().min(1).max(4096);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const instant = z.string().datetime();
const strings = z.array(text).max(4096);
export const repositorySchema = z.strictObject({ name: id, root: text });
export const bindingSchema = z.strictObject({ ticketId: id, branch: text });
export const assignmentSchema = z.strictObject({
  ...bindingSchema.shape, worktreePath: text, lane: z.enum(['parallel', 'sequential']),
  order: z.number().int().nonnegative(),
});
export const worktreeObservationSchema = z.strictObject({
  repository: repositorySchema,
  environment: z.strictObject({ home: text, xdgDataHome: z.string().max(4096).optional(), voidWorktrees: z.string().max(4096).optional() }),
  observedAt: instant, caseSensitive: z.boolean(),
  worktrees: z.array(z.strictObject({
    path: text, branch: text.optional(), headSha: WORKTREE_SHA.optional(),
    exists: z.boolean(), main: z.boolean(), locked: z.boolean(),
    hasSubmodules: z.boolean(), dirty: z.boolean(),
    localData: z.enum(['none', 'preserve', 'archived']),
  })).max(4096),
  branches: z.array(z.strictObject({ branch: text, headSha: WORKTREE_SHA })).max(4096),
  destinations: z.array(z.strictObject({ path: text, canonicalPath: text, exists: z.boolean() })).max(4096),
  temporaryRoots: strings,
});
export type WorktreeObservation = z.infer<typeof worktreeObservationSchema>;
export type ObservedWorktree = WorktreeObservation['worktrees'][number];

export const planSchema = z.strictObject({
  schemaVersion: z.literal(2), runId: id, clusterId: id,
  base: z.strictObject({ branch: text, sha: WORKTREE_SHA }),
  concurrency: z.number().int().positive(), assignments: z.array(assignmentSchema).min(1).max(4096),
  worktreeRoot: text, worktrees: worktreeObservationSchema,
  ticketRunnerSkill: z.literal('implement'), panelProvider: z.literal('orchestrator'),
  planPath: text, specPath: text,
  workerMayPush: z.literal(false), workerMayOpenPullRequest: z.literal(false),
  workerMayTransitionTicket: z.literal(false), workerMayWriteSharedGitState: z.literal(false),
  workerMayPruneMissions: z.literal(false),
  sharedGitState: z.strictObject({
    rule: z.literal('no-write-to-repository-shared-git-state'), shared: strings,
    exception: text, examples: strings, instead: strings, source: text,
  }),
});
export type WorktreePlan = z.infer<typeof planSchema>;

const prepareSchema = z.strictObject({
  schemaVersion: z.literal(2), action: z.literal('prepare'), runId: id, clusterId: id,
  base: z.strictObject({ branch: text, sha: WORKTREE_SHA }), tickets: z.array(id).min(1).max(4096),
  footprints: z.array(z.strictObject({
    id, areas: strings, highRisk: z.boolean(), confidence: z.number().min(0).max(1), touchesMigration: z.boolean(),
  })).max(4096),
  sequentialOwnership: strings.optional(), minConfidence: z.number().min(0).max(1).optional(),
  clusterSize: z.number().int().positive(), planPath: text, specPath: text,
  worktrees: worktreeObservationSchema, ticketBranches: z.array(bindingSchema).min(1).max(4096),
});
const cleanupSchema = z.strictObject({
  schemaVersion: z.literal(2), action: z.literal('cleanup'), plan: planSchema,
  integration: z.strictObject({
    sha: WORKTREE_SHA, included: z.array(z.strictObject({ ticketId: id, headSha: WORKTREE_SHA })).min(1).max(4096),
    excludedTicketIds: z.array(id).max(4096),
  }),
  merge: z.strictObject({ integrationSha: WORKTREE_SHA, mergeSha: WORKTREE_SHA, ticketIds: z.array(id).min(1).max(4096), observedAt: instant }),
  worktrees: worktreeObservationSchema, retainedTicketIds: z.array(id).max(4096),
});
const requestSchema = z.discriminatedUnion('action', [prepareSchema, cleanupSchema]);
export type CleanupRequest = z.infer<typeof cleanupSchema>;
export type PrepareRequest = z.infer<typeof prepareSchema>;

export function worktreeRecovery(action?: string): string {
  const prepare = 'prepare: submit schemaVersion 2 (v2), action prepare, explicit ticketBranches, location and fresh worktrees inventory';
  const cleanup = 'cleanup: submit schemaVersion 2 (v2), action cleanup, saved plan, integration and merge evidence, fresh worktrees observation and retainedTicketIds';
  return `${action === 'cleanup' ? cleanup : action === 'prepare' ? prepare : `${prepare}; ${cleanup}`}; preserve existing checkouts`;
}

export function worktreeFailure(cause: string, action?: string): never {
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT', 'the worktree observation cannot authorize this plan', cause,
    worktreeRecovery(action),
  );
}

export function readWorktreeRequest(value: unknown) {
  const result = requestSchema.safeParse(value);
  if (!result.success) {
    const action = value && typeof value === 'object' && 'action' in value && typeof value.action === 'string' ? value.action : undefined;
    worktreeFailure(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), action);
  }
  return result.data;
}

export function readWorktreeObservation(value: unknown): WorktreeObservation {
  const result = worktreeObservationSchema.safeParse(value);
  if (!result.success) worktreeFailure(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return result.data;
}
