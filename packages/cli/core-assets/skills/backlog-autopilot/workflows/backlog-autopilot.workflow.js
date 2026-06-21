// backlog-autopilot — deterministic Workflow that drains CONFIRMED Linear clusters,
// each ticket worked end-to-end by a worktree-isolated subagent, then reconciles
// each cluster's green branches into ONE PR per cluster gated by the full suite.
//
// This script is pure orchestration: the in-session launcher does the Linear
// selection + footprint estimation + cluster detection + topological order + human
// confirmation, then invokes this Workflow with the confirmed plan as `args`. The
// Workflow never prompts — it executes the plan it is given.
//
// args (the confirmed plan) — preferred shape:
//   {
//     clusters: [
//       { id, parallel: [{ id, title }], sequential: [{ id, title }], order: [ids] }
//     ],
//     branchPrefix, reviewState, verifyCmd, autoMerge
//   }
// Back-compat shape (a single batch-of-4 with no logical cluster): top-level
// { parallel, sequential, batchId } is treated as one implicit cluster.
//
// Isolation (autoplan T2): every worker runs in its own git worktree — "worktree
// always". Parallel tickets fan out concurrently; sequential tickets run in topo
// order; reconciliation merges the green branches in topo order. (One shared
// cluster worktree across sequential agents is not expressible in the Workflow
// runtime; per-worker worktrees are the runtime form of "never without a worktree",
// which is the safety property T2 asked for.)

export const meta = {
  name: 'backlog-autopilot',
  description: 'Drain confirmed Linear clusters in worktree subagents, reconcile to one PR per cluster',
  phases: [
    { title: 'Workers', detail: 'one worktree subagent per ticket (parallel group, then sequential queue) per cluster' },
    { title: 'Reconcile', detail: 'merge each cluster\'s green branches, gate on the full suite, open one PR per cluster' },
  ],
}

// The Workflow runtime delivers `args` as a JSON STRING, not a parsed object
// (issue #21). Without parsing, the lists collapse to [] and the run silently
// no-ops. Parse a string; use an object as-is; surface a malformed payload loudly.
function resolvePlan(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch (err) {
      throw new Error(`backlog-autopilot: args is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return raw || {}
}

const plan = resolvePlan(args)
const branchPrefix = plan.branchPrefix || 'auto/'
const verifyCmd = plan.verifyCmd || 'pnpm -s test'
const reviewState = plan.reviewState || 'In Review'

// Normalize to a list of clusters. The back-compat batch shape becomes one cluster.
function normalizeClusters(p) {
  if (Array.isArray(p.clusters) && p.clusters.length > 0) {
    return p.clusters.map((c, i) => ({
      id: c.id || `cluster-${i + 1}`,
      parallel: Array.isArray(c.parallel) ? c.parallel : [],
      sequential: Array.isArray(c.sequential) ? c.sequential : [],
    }))
  }
  const parallel = Array.isArray(p.parallel) ? p.parallel : []
  const sequential = Array.isArray(p.sequential) ? p.sequential : []
  if (parallel.length === 0 && sequential.length === 0) return []
  return [{ id: p.batchId || 'batch', parallel, sequential }]
}

const clusters = normalizeClusters(plan)

log(
  `backlog-autopilot: ${clusters.length} cluster(s) — ` +
    clusters.map((c) => `${c.id}[${c.parallel.length}p+${c.sequential.length}s]`).join(', '),
)

const WORKER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ticket: { type: 'string' },
    status: { type: 'string', enum: ['completed', 'blocked'] },
    branch: { type: 'string' },
    detail: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['ticket', 'status', 'branch'],
}

const RECONCILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['opened', 'blocked'] },
    pr: { type: 'string' },
    conflictsResolved: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' },
  },
  required: ['status'],
}

function workerPrompt(ticket) {
  return `You are ONE worktree-isolated worker in a backlog-autopilot cluster. You own
exactly ONE Linear ticket end to end, on your OWN branch, in your OWN git worktree.
Do NOT open a pull request — reconciliation opens one PR for the whole cluster.

Ticket: ${ticket.id} — ${ticket.title || ''}

1. Move ${ticket.id} to "In Progress" (Linear MCP). Create/use branch \`${branchPrefix}${ticket.id}\`.
2. Don't assume it is unimplemented — search first, build on what exists.
3. Use the void skills: brainstorming, source-driven-development, writing-plans, tdd,
   commit-discipline. Stay strictly within this ticket's scope. Atomic commits with "why".
4. Verify: run \`${verifyCmd}\` (plus typecheck/lint if defined). Tests are the only judge.
   - Green → commit everything, leave the branch ready for integration.
   - Cannot reach green after a genuine effort → do NOT fake it: post failure evidence as a
     Linear comment, push the WIP branch, and report status "blocked" with the reason.
5. Emit a DECISION line for each structural choice (with the rejected alternative).

Return: { ticket: "${ticket.id}", status, branch: "${branchPrefix}${ticket.id}", detail, decisions }.`
}

function reconcilePrompt(clusterId, green) {
  const list = green.map((g) => `- ${g.ticket} on ${g.branch}`).join('\n')
  return `You reconcile the GREEN branches of ONE backlog-autopilot cluster into ONE PR.
Blocked tickets are NOT yours — they were excluded upstream.

Cluster: ${clusterId}
Green branches to integrate (merge in this order):
${list}

Steps:
1. Create branch \`cluster/${clusterId}\` from the base branch.
2. Merge each green branch into it, in the listed order. On a conflict, resolve it KEEPING
   BOTH tickets' intent (never drop one side's work). Watch lockfiles and migration numbering.
3. Run the FULL suite: \`${verifyCmd}\` (plus typecheck/lint). This is the judge.
   - Green → open ONE pull request from \`cluster/${clusterId}\`, body referencing every
     ticket (${green.map((g) => g.ticket).join(', ')}) and the decisions taken. Move those
     tickets to "${reviewState}". Report status "opened" with the PR number/url.
   - Red → do NOT open a PR. Report status "blocked" with the failing evidence; preserve
     all branches for the human.

Return: { status, pr, conflictsResolved, detail }.`
}

// Order the sequential queue so a dependency is worked before its dependents. The
// launcher passes `order` (from cluster-order); fall back to the given order.
function orderedSequential(cluster) {
  if (!Array.isArray(cluster.order) || cluster.order.length === 0) return cluster.sequential
  const byId = new Map(cluster.sequential.map((t) => [t.id, t]))
  const ordered = cluster.order.map((id) => byId.get(id)).filter(Boolean)
  // Append any sequential ticket missing from `order` (defensive).
  for (const t of cluster.sequential) if (!cluster.order.includes(t.id)) ordered.push(t)
  return ordered
}

async function runCluster(cluster) {
  phase('Workers')
  const parallelResults = await parallel(
    cluster.parallel.map((t) => () =>
      agent(workerPrompt(t), {
        label: `work:${cluster.id}:${t.id}`,
        phase: 'Workers',
        schema: WORKER_SCHEMA,
        isolation: 'worktree',
      }),
    ),
  )

  const sequentialResults = []
  for (const t of orderedSequential(cluster)) {
    const r = await agent(workerPrompt(t), {
      label: `work:${cluster.id}:${t.id}`,
      phase: 'Workers',
      schema: WORKER_SCHEMA,
      isolation: 'worktree',
    })
    sequentialResults.push(r)
  }

  const all = [...parallelResults, ...sequentialResults].filter(Boolean)
  const green = all.filter((r) => r.status === 'completed')
  const blocked = all.filter((r) => r.status === 'blocked')
  log(`cluster ${cluster.id}: ${green.length} green, ${blocked.length} blocked`)

  if (green.length === 0) {
    return {
      cluster: cluster.id,
      pr: undefined,
      status: 'blocked',
      included: [],
      blocked: blocked.map((b) => ({ ticket: b.ticket, reason: b.detail })),
      note: 'no green branch to integrate',
    }
  }

  phase('Reconcile')
  const reconcile = await agent(reconcilePrompt(cluster.id, green), {
    label: `reconcile:${cluster.id}`,
    phase: 'Reconcile',
    schema: RECONCILE_SCHEMA,
  })

  return {
    cluster: cluster.id,
    pr: reconcile?.pr,
    status: reconcile?.status,
    included: green.map((g) => g.ticket),
    blocked: blocked.map((b) => ({ ticket: b.ticket, reason: b.detail })),
    conflictsResolved: reconcile?.conflictsResolved ?? [],
  }
}

// Clusters are processed one at a time (each is its own PR). Cross-cluster
// sequencing, stacked PRs and auto-merge are the launcher's job (P4), not here.
const results = []
for (const cluster of clusters) {
  results.push(await runCluster(cluster))
}

return { clusters: results }
