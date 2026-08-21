// autopilot — the Claude adapter. It executes an OrchestrationPlan the CLI
// already computed, and decides nothing.
//
// Everything that could be a judgement call was made upstream: which tickets,
// which lane, which branch, which worktree. This script fans out, collects, and
// returns. That is what makes the two runtimes comparable — Codex runs the same
// plan through native subagents and must produce the same results.
//
// The worktrees already exist when this runs. The controller creates them before
// any spawn, so a worker never chooses its checkout and never lands in the
// operator's tree.
//
// args: the OrchestrationPlan (object, or the JSON string the runtime delivers).

export const meta = {
  name: 'autopilot',
  description: 'Run one bounded ticket cluster, each ticket through implement in its own worktree',
  phases: [
    { title: 'Parallel', detail: 'disjoint tickets, one worktree subagent each' },
    { title: 'Sequential', detail: 'overlapping, risky or migration tickets, one at a time' },
  ],
}

// The runtime may deliver `args` as a JSON string. Parsing it wrong silently
// collapses the assignment list to empty and the run no-ops while reporting
// success — so a malformed payload is loud.
function resolvePlan(raw) {
  const plan = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!plan || typeof plan !== 'object') {
    throw new Error('autopilot: the orchestration plan is missing or not an object')
  }
  if (plan.schemaVersion !== 1) {
    throw new Error(`autopilot: unknown orchestration plan schemaVersion ${String(plan.schemaVersion)}`)
  }
  if (!Array.isArray(plan.assignments) || plan.assignments.length === 0) {
    throw new Error('autopilot: the orchestration plan carries no assignment')
  }
  return plan
}

const plan = resolvePlan(args)

// The schema every worker answers with. Enforced here so a prose answer is
// retried by the runtime rather than parsed by hand downstream.
const WORKER_RESULT_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'ticketId', 'status', 'branch', 'baseSha', 'headSha', 'commits', 'files', 'proofs', 'decisions', 'blocker'],
  additionalProperties: true,
  properties: {
    schemaVersion: { const: 1 },
    ticketId: { type: 'string' },
    status: { enum: ['completed', 'blocked'] },
    branch: { type: 'string' },
    baseSha: { type: 'string' },
    headSha: { type: ['string', 'null'] },
    commits: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } },
    proofs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'command', 'hash'],
        properties: {
          name: { type: 'string' },
          command: { type: 'array', items: { type: 'string' } },
          hash: { type: 'string' },
        },
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'basis'],
        properties: {
          summary: { type: 'string' },
          basis: { enum: ['ticket', 'plan', 'doctrine', 'convention', 'safest'] },
        },
      },
    },
    blocker: { type: ['string', 'null'] },
  },
}

function workerPrompt(assignment) {
  return [
    `Work ticket ${assignment.ticketId} to completion by running the ${plan.ticketRunnerSkill} skill, whole and once.`,
    '',
    `Worktree: ${assignment.worktreePath} — it already exists. Work there and nowhere else.`,
    `Branch: ${assignment.branch} — already checked out. Do not create or switch branches.`,
    `Base commit: ${plan.base.sha} on ${plan.base.branch}.`,
    `Global plan: ${plan.planPath}`,
    `Approved spec: ${plan.specPath}`,
    '',
    'Re-fetch the complete ticket from the tracker before starting. Never work from a summary.',
    'Run every implement pass whose predicate fires. Run your own targeted gates, not the',
    'whole cluster suite. Apply a migration only against the dev/local database.',
    '',
    'You must NOT: push, open or update a pull request, merge anything, or move the ticket to',
    'In Review or Done. Stop at a committed branch. The reconciler owns everything after that.',
    '',
    'Return the WorkerResult object. Commits must be full 40-character ids, in order, and the',
    'head must be the last of them. Every proof carries the argv that ran and a sha256 of its',
    'output — a proof you did not run is not a proof.',
  ].join('\n')
}

function runWorker(assignment, phaseTitle) {
  return agent(workerPrompt(assignment), {
    label: `ticket:${assignment.ticketId}`,
    phase: phaseTitle,
    schema: WORKER_RESULT_SCHEMA,
  })
}

const parallel_ = plan.assignments.filter((a) => a.lane === 'parallel')
const sequential = plan.assignments
  .filter((a) => a.lane === 'sequential')
  .slice()
  .sort((a, b) => a.order - b.order)

const results = []

if (parallel_.length > 0) {
  phase('Parallel')
  log(`${parallel_.length} disjoint ticket(s), width ${plan.concurrency}`)
  const answers = await parallel(parallel_.map((assignment) => () => runWorker(assignment, 'Parallel')))
  // A null answer means the agent died or was skipped. It is not a result, and
  // partial-success resolution treats the ticket as unanswered.
  answers.forEach((answer, index) => {
    if (answer) results.push(answer)
    else log(`no result from ${parallel_[index].ticketId}`)
  })
}

// Sequential tickets run one at a time BECAUSE they collide — with each other,
// with a lockfile, or with shared dev state. Awaiting each one is the point.
for (const assignment of sequential) {
  phase('Sequential')
  log(`sequential: ${assignment.ticketId} (${assignment.order})`)
  const answer = await runWorker(assignment, 'Sequential')
  if (answer) results.push(answer)
  else log(`no result from ${assignment.ticketId}`)
}

// The adapter returns results. It never writes run state and never comments on
// the tracker — the L0 skill owns both, so there is one writer.
return { schemaVersion: 1, runId: plan.runId, clusterId: plan.clusterId, results }
