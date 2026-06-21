// backlog-autopilot — deterministic Workflow that drains a CONFIRMED batch of Linear
// tickets, each ticket worked end-to-end by a worktree-isolated subagent, then
// reconciles the green branches into ONE integration PR gated by the full suite.
//
// This script is pure orchestration: the in-session launcher does the Linear
// selection + footprint estimation + risk partition + human confirmation, then
// invokes this Workflow with the confirmed plan as `args`. The Workflow never
// prompts — it executes the plan it is given.
//
// args (the confirmed plan):
//   {
//     batchId: string,                 // label for the integration branch
//     parallel: [{ id, title }],       // low-overlap tickets → run concurrently
//     sequential: [{ id, title }],     // high-overlap/lockfile/migration → run in order
//     branchPrefix: string,            // e.g. "auto/"
//     reviewState: string,             // Linear state for the opened PR's tickets
//     verifyCmd: string,               // full-suite command, e.g. "pnpm -s test"
//     autoMerge: boolean
//   }

export const meta = {
  name: 'backlog-autopilot',
  description: 'Drain a confirmed batch of Linear tickets in parallel worktrees, reconcile to one integration PR',
  phases: [
    { title: 'Workers', detail: 'one worktree subagent per ticket (parallel group, then sequential queue)' },
    { title: 'Reconcile', detail: 'merge green branches to the integration branch, gate on the full suite, open one PR' },
  ],
}

// The Workflow runtime delivers `args` as a JSON STRING, not a parsed object
// (issue #21). Without parsing, plan.parallel / plan.sequential are undefined,
// both lists collapse to [] and the batch silently no-ops (a false "nothing to
// do"). Parse a string; use an object as-is; surface a malformed payload loudly.
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
const parallelTickets = Array.isArray(plan.parallel) ? plan.parallel : []
const sequentialTickets = Array.isArray(plan.sequential) ? plan.sequential : []
const branchPrefix = plan.branchPrefix || 'auto/'
const verifyCmd = plan.verifyCmd || 'pnpm -s test'
const batchId = plan.batchId || 'batch'
const reviewState = plan.reviewState || 'In Review'

// Make the fan-out size visible so an empty batch reads as a real signal, not a
// silent 19 ms no-op (issue #21).
log(`backlog-autopilot "${batchId}": ${parallelTickets.length} parallel + ${sequentialTickets.length} sequential ticket(s)`)

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
  return `You are ONE worktree-isolated worker in an attended parallel backlog batch. You
own exactly ONE Linear ticket end to end, on your OWN branch, in your OWN git
worktree. Do NOT open a pull request — reconciliation opens a single integration
PR for the whole batch.

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

function reconcilePrompt(green) {
  const list = green.map((g) => `- ${g.ticket} on ${g.branch}`).join('\n')
  return `You reconcile the GREEN branches of an attended backlog batch into ONE integration
PR. Blocked tickets are NOT yours — they were excluded upstream.

Green branches to integrate:
${list}

Steps:
1. Create branch \`integration/${batchId}\` from the base branch.
2. Merge each green branch into it, in order. On a conflict, resolve it KEEPING BOTH
   tickets' intent (never drop one side's work). Watch lockfiles and migration numbering.
3. Run the FULL suite: \`${verifyCmd}\` (plus typecheck/lint). This is the judge.
   - Green → open ONE pull request from \`integration/${batchId}\`, body referencing every
     ticket (${green.map((g) => g.ticket).join(', ')}) and the decisions taken. Move those
     tickets to "${reviewState}". Report status "opened" with the PR number/url.
   - Red → do NOT open a PR. Report status "blocked" with the failing evidence; preserve
     all branches for the human.

Return: { status, pr, conflictsResolved, detail }.`
}

// --- Phase 1: workers (parallel group, then sequential queue) ---
phase('Workers')

const parallelResults = await parallel(
  parallelTickets.map((t) => () =>
    agent(workerPrompt(t), { label: `work:${t.id}`, phase: 'Workers', schema: WORKER_SCHEMA, isolation: 'worktree' }),
  ),
)

const sequentialResults = []
for (const t of sequentialTickets) {
  // Serialized: high-overlap tickets run one after another to keep merges clean.
  const r = await agent(workerPrompt(t), {
    label: `work:${t.id}`,
    phase: 'Workers',
    schema: WORKER_SCHEMA,
    isolation: 'worktree',
  })
  sequentialResults.push(r)
}

const all = [...parallelResults, ...sequentialResults].filter(Boolean)
const green = all.filter((r) => r.status === 'completed')
const blocked = all.filter((r) => r.status === 'blocked')

log(`workers done: ${green.length} green, ${blocked.length} blocked`)

if (green.length === 0) {
  return {
    pr: undefined,
    included: [],
    blocked: blocked.map((b) => ({ ticket: b.ticket, reason: b.detail })),
    note: 'no green branch to integrate',
  }
}

// --- Phase 2: reconcile green branches into one integration PR ---
phase('Reconcile')

const reconcile = await agent(reconcilePrompt(green), {
  label: 'reconcile',
  phase: 'Reconcile',
  schema: RECONCILE_SCHEMA,
})

return {
  pr: reconcile?.pr,
  status: reconcile?.status,
  included: green.map((g) => g.ticket),
  blocked: blocked.map((b) => ({ ticket: b.ticket, reason: b.detail })),
  conflictsResolved: reconcile?.conflictsResolved ?? [],
}
