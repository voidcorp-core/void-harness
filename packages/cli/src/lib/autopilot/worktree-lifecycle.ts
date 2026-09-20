// Pure argv planning. Execution and fresh physical/Git observations belong to the caller.
// git-worktree(1), Git 2.50: move preserves the checkout; remove without force
// refuses dirty work. Main, locked and submodule checkouts are never moved here.
import type { OrchestrationPlan } from './orchestration-plan.js';
import {
  type CleanupRequest, type ObservedWorktree, type WorktreeObservation, type WorktreePlan,
  planSchema, worktreeFailure,
} from './worktree-contract.js';
import { pathKey, pathSemantics, resolveWorktreeRoot, validateInventory, worktreeDestination } from './worktree-location.js';

type Assignment = WorktreePlan['assignments'][number];
export interface WorktreeStep {
  readonly ticketId: string;
  readonly branch: string;
  readonly worktreePath: string;
  readonly command: readonly string[];
}
export interface WorktreeDisposition {
  readonly ticketId: string;
  readonly branch: string;
  readonly worktreePath: string;
  readonly state: 'planned-create' | 'reuse' | 'planned-move' | 'planned-remove'
    | 'retained' | 'already-absent' | 'reobserve-after-prune';
  readonly reason: string;
  readonly nextAction: string;
}
interface PlannedCheckout {
  readonly disposition: WorktreeDisposition;
  readonly step?: WorktreeStep;
}

function checkedPlan(value: unknown): WorktreePlan {
  const parsed = planSchema.safeParse(value);
  if (!parsed.success) worktreeFailure(`invalid v2 worktree plan: ${parsed.error.message}`);
  const plan = parsed.data;
  validateInventory(plan.worktrees);
  if (plan.worktreeRoot !== resolveWorktreeRoot(plan.worktrees)) worktreeFailure('plan worktree root changed');
  const tickets = new Set<string>();
  const branches = new Set<string>();
  const paths = new Set<string>();
  for (const assignment of plan.assignments) {
    const destination = worktreeDestination(plan.worktrees, assignment.branch);
    if (assignment.worktreePath !== destination.canonicalPath) worktreeFailure(`assignment path mismatch: ${assignment.ticketId}`);
    const branch = assignment.branch;
    const path = pathKey(assignment.worktreePath, plan.worktrees.caseSensitive);
    if (tickets.has(assignment.ticketId) || branches.has(branch) || paths.has(path)) worktreeFailure('duplicate worktree ownership');
    tickets.add(assignment.ticketId); branches.add(branch); paths.add(path);
  }
  return plan;
}

function disposition(assignment: Assignment, state: WorktreeDisposition['state'], reason: string, nextAction: string): WorktreeDisposition {
  return { ticketId: assignment.ticketId, branch: assignment.branch, worktreePath: assignment.worktreePath, state, reason, nextAction };
}

function operation(assignment: Assignment, state: WorktreeDisposition['state'], reason: string, command: readonly string[]): PlannedCheckout {
  return {
    disposition: disposition(assignment, state, `${reason}; not executed`, 'execute the planned argv, then refresh Git inventory'),
    step: { ticketId: assignment.ticketId, branch: assignment.branch, worktreePath: assignment.worktreePath, command },
  };
}

function registered(observation: WorktreeObservation, assignment: Assignment): ObservedWorktree | undefined {
  const ref = `refs/heads/${assignment.branch}`;
  const result = observation.worktrees.find((entry) => entry.branch === ref);
  const collision = observation.worktrees.find((entry) => pathKey(entry.path, observation.caseSensitive) === pathKey(assignment.worktreePath, observation.caseSensitive) && entry.branch !== ref);
  if (collision) worktreeFailure(`checkout destination belongs to another branch: ${collision.path}`);
  return result;
}

function unsupported(entry: ObservedWorktree): string | undefined {
  if (entry.main) return 'main checkout';
  if (entry.locked) return 'locked checkout';
  if (entry.hasSubmodules) return 'checkout containing submodules';
  return undefined;
}

function prepareAssignment(plan: WorktreePlan, assignment: Assignment): PlannedCheckout {
  const observation = plan.worktrees;
  const entry = registered(observation, assignment);
  const target = worktreeDestination(observation, assignment.branch);
  if (entry) {
    if (entry.exists && entry.path === assignment.worktreePath) {
      return { disposition: disposition(assignment, 'reuse', 'registered checkout preserved', `resume work at ${entry.path}`) };
    }
    const refusal = unsupported(entry);
    if (refusal) worktreeFailure(`preserved ${entry.path}: cannot move ${refusal}; inspect ownership and re-observe, no fallback`);
    if (!entry.exists) return operation(assignment, 'reobserve-after-prune', 'registration directory disappeared; re-observe before any add', ['git', 'worktree', 'prune']);
    if (target.exists) worktreeFailure(`preserved ${entry.path}: destination occupied at ${target.canonicalPath}`);
    return operation(assignment, 'planned-move', `move from ${entry.path}`, ['git', 'worktree', 'move', entry.path, assignment.worktreePath]);
  }
  if (target.exists) worktreeFailure(`destination occupied at ${target.canonicalPath}; preserve it and resolve ownership`);
  const existing = observation.branches.find((branch) => branch.branch === `refs/heads/${assignment.branch}`);
  return operation(assignment, 'planned-create', existing ? 'checkout existing branch without resetting HEAD' : 'create branch from pinned base',
    existing ? ['git', 'worktree', 'add', assignment.worktreePath, assignment.branch]
      : ['git', 'worktree', 'add', '-b', assignment.branch, assignment.worktreePath, plan.base.sha]);
}

function preparationSteps(item: PlannedCheckout): readonly WorktreeStep[] {
  const step = item.step;
  if (!step) return [];
  if (item.disposition.state !== 'planned-move') return [step];
  // Git move does not create missing parents. The existing executor runs this
  // concrete Node filesystem operation as argv, without interpreting the path.
  // Check the observed physical ancestor before and after directory creation.
  const script = [
    "const fs=require('node:fs'),p=require('node:path'),target=process.argv[1];",
    "let ancestor=target;while(!fs.existsSync(ancestor)){const next=p.dirname(ancestor);if(next===ancestor)throw Error('missing filesystem root');ancestor=next;}",
    "if(p.relative(fs.realpathSync(ancestor),ancestor)!=='')throw Error('physical parent changed; re-observe');",
    "fs.mkdirSync(target,{recursive:true});",
    "if(p.relative(fs.realpathSync(target),target)!=='')throw Error('physical parent changed; re-observe');",
  ].join('');
  return [{ ...step, command: ['node', '-e', script, pathSemantics(step.worktreePath).dirname(step.worktreePath)] }, step];
}

// Prune has repository-wide scope: every missing registration must be owned,
// eligible and explicitly observed to have no unrecovered working/admin data.
function pruneBlocker(observation: WorktreeObservation, assignments: readonly Assignment[], eligible: ReadonlySet<string>): string | undefined {
  for (const entry of observation.worktrees.filter((entry) => !entry.exists)) {
    const owner = assignments.find((assignment) => `refs/heads/${assignment.branch}` === entry.branch && assignment.worktreePath === entry.path);
    if (!owner || !eligible.has(owner.ticketId) || unsupported(entry) || entry.dirty || entry.localData === 'preserve') {
      return `global prune would discard a foreign, held or recoverable registration at ${entry.path}`;
    }
  }
  return undefined;
}

function retainAfterPruneRefusal(items: readonly PlannedCheckout[], reason: string) {
  return { steps: [], dispositions: items.map((item) => ({ ...item.disposition,
    state: 'retained' as const, reason,
    nextAction: 'preserve registration and recover working/index/local data; refresh the complete inventory before retry',
  })) };
}

export function planWorktreePreparation(value: OrchestrationPlan) {
  const plan = checkedPlan(value);
  const items = plan.assignments.map((assignment) => prepareAssignment(plan, assignment));
  // Prune changes the repository inventory. Never combine it with an operation
  // selected from the inventory it invalidates, even for a different ticket.
  const prune = items.find((item) => item.disposition.state === 'reobserve-after-prune');
  if (prune) {
    const blocker = pruneBlocker(plan.worktrees, plan.assignments, new Set(plan.assignments.map((entry) => entry.ticketId)));
    if (blocker) return retainAfterPruneRefusal(items, blocker);
  }
  if (prune) return { steps: prune.step ? [prune.step] : [], dispositions: items.map((item) => ({
    ...item.disposition, state: 'reobserve-after-prune' as const,
    reason: 'prune disappeared registrations, then refresh the complete inventory before setup',
    nextAction: 're-observe and submit action prepare; start no workers yet',
  })) };
  return { steps: items.flatMap(preparationSteps), dispositions: items.map((item) => item.disposition) };
}

/** Compatibility at the internal call site; never computes unconditional cleanup. */
export function planWorktreeSetup(plan: OrchestrationPlan): readonly WorktreeStep[] {
  return planWorktreePreparation(plan).steps;
}

export function planWorktreeTeardown(_plan: OrchestrationPlan): readonly WorktreeStep[] {
  return [];
}

function uniqueIds(ids: readonly string[], label: string): Set<string> {
  const set = new Set(ids);
  if (set.size !== ids.length) worktreeFailure(`duplicate ${label} ticket IDs`);
  return set;
}

function validateMerge(request: CleanupRequest, now: string): void {
  const owned = uniqueIds(request.plan.assignments.map((entry) => entry.ticketId), 'owned');
  const included = uniqueIds(request.integration.included.map((entry) => entry.ticketId), 'included');
  const excluded = uniqueIds(request.integration.excludedTicketIds, 'excluded');
  const merged = uniqueIds(request.merge.ticketIds, 'merged');
  const held = uniqueIds(request.retainedTicketIds, 'retained');
  if ([...included, ...excluded, ...merged, ...held].some((id) => !owned.has(id))
    || [...included].some((id) => excluded.has(id) || !merged.has(id))
    || merged.size !== included.size || included.size + excluded.size !== owned.size) {
    worktreeFailure('merge evidence ticket IDs do not match owned included/excluded assignments');
  }
  if (request.integration.sha !== request.merge.integrationSha) worktreeFailure('merge integration SHA does not match verified integration');
  const mergedAt = Date.parse(request.merge.observedAt);
  const observedAt = Date.parse(request.worktrees.observedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(current) || observedAt < mergedAt || observedAt > current || mergedAt > current) {
    worktreeFailure('stale or future merge/inventory observation; observe merge then current inventory');
  }
}

function cleanupAssignment(request: CleanupRequest, assignment: Assignment): PlannedCheckout {
  const included = request.integration.included.find((entry) => entry.ticketId === assignment.ticketId);
  const retain = (reason: string): PlannedCheckout => ({ disposition: disposition(assignment, 'retained', reason,
    `preserve ${assignment.worktreePath}; resolve the reason and refresh inventory before cleanup`) });
  if (!included || request.retainedTicketIds.includes(assignment.ticketId)) return retain('ticket excluded, unmerged or explicitly retained');
  const entry = registered(request.worktrees, assignment);
  const target = worktreeDestination(request.worktrees, assignment.branch);
  if (!entry) {
    if (target.exists) return retain('destination still occupied without the owned branch registration');
    return { disposition: disposition(assignment, 'already-absent', 'checkout already removed', 'no action required') };
  }
  if (entry.path !== assignment.worktreePath) return retain(`registered location changed to ${entry.path}`);
  const refusal = unsupported(entry);
  if (refusal) return retain(refusal);
  if (!entry.exists) return operation(assignment, 'reobserve-after-prune', 'directory disappeared', ['git', 'worktree', 'prune']);
  if (entry.headSha !== included.headSha) return retain('branch HEAD changed after integration');
  if (entry.dirty) return retain('checkout is dirty');
  if (entry.localData === 'preserve') return retain('useful ignored local data/evidence must be archived and verified before removal');
  return operation(assignment, 'planned-remove', 'matched merged ticket and clean checkout', ['git', 'worktree', 'remove', assignment.worktreePath]);
}

export function planWorktreeCleanup(request: CleanupRequest, now: string) {
  const plan = checkedPlan(request.plan);
  validateMerge(request, now);
  validateInventory(request.worktrees);
  if (request.worktrees.repository.root !== plan.worktrees.repository.root
    || request.worktrees.repository.name !== plan.worktrees.repository.name
    || resolveWorktreeRoot(request.worktrees) !== plan.worktreeRoot) worktreeFailure('cleanup repository or durable root changed');
  for (const assignment of plan.assignments) {
    if (worktreeDestination(request.worktrees, assignment.branch).canonicalPath !== assignment.worktreePath) {
      worktreeFailure(`cleanup physical destination changed: ${assignment.ticketId}`);
    }
  }
  const items = plan.assignments.map((assignment) => cleanupAssignment(request, assignment));
  const prune = items.find((item) => item.disposition.state === 'reobserve-after-prune');
  if (prune) {
    const eligible = new Set(request.integration.included.map((entry) => entry.ticketId)
      .filter((ticketId) => !request.retainedTicketIds.includes(ticketId)));
    const blocker = pruneBlocker(request.worktrees, plan.assignments, eligible);
    if (blocker) return retainAfterPruneRefusal(items, blocker);
  }
  return {
    steps: prune?.step ? [prune.step] : items.flatMap((item) => item.step ? [item.step] : []),
    dispositions: prune ? items.map((item) => ({ ...item.disposition,
      state: 'reobserve-after-prune' as const, reason: 'refresh inventory after prune before cleanup',
      nextAction: 're-observe and submit action cleanup',
    })) : items.map((item) => item.disposition),
  };
}
