// autopilot — the cycle itself, as a script.
//
// Before this, the cycle was a numbered list in SKILL.md and the model was the
// mechanism: it read the list, decided when a unit was done, and remembered to
// take the lease. Twenty-seven functions that compute those decisions had no
// caller at all, which is what a procedure made of prose costs. Here the
// control flow is code and the model is left where judgment belongs — inside
// the workers, inside the union reader.
//
// Every decision goes through `void-harness autopilot <step>`, which is pure:
// it observes nothing and writes nothing, it takes an observation and returns a
// plan or a verdict. This script never writes run state and never comments on
// the tracker: it returns what happened, and the caller owns both. This script decides WHAT to ask and WHEN to stop; agents
// observe the world and run the argv that comes back. Neither of them judges
// what the other owns.
//
// args: { root, remote, deployBranch, requested, planPath, specPath, runId,
//         clusterId, assigneeId, programStates, sequentialOwnership,
//         reconcileOnly, verifyCommands, rebuildCommand, expiresAt, now }

export const meta = {
  name: 'autopilot',
  description: 'Drain a ticket pool into one integration pull request, unattended',
  phases: [
    { title: 'Preflight', detail: 'programme, base, tracker — before anything is claimed' },
    { title: 'Reserve', detail: 'take the lease, or stop on a competing claim' },
    { title: 'Parallel', detail: 'disjoint tickets, one worktree subagent each' },
    { title: 'Sequential', detail: 'overlapping, risky or migration tickets, one at a time' },
    { title: 'Reconcile', detail: 'verify every range against git, then merge' },
    { title: 'Verify', detail: 'the declared suite on the merged tree' },
    { title: 'Publish', detail: 'one branch, one pull request, the account in its body' },
    { title: 'Chain', detail: 'take another unit, or stop and say why' },
    { title: 'Progress', detail: 'rewrite the draft body, so a silence is readable as a stall' },
  ],
}

const input = typeof args === 'string' ? JSON.parse(args) : args
if (!input || typeof input !== 'object') {
  throw new Error('autopilot: the run configuration is missing or not an object')
}

/** A step's answer, whatever the step. The runtime retries a prose answer. */
const JSON_RESULT = {
  type: 'object',
  required: ['ok', 'result'],
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    // The parsed stdout of the command, or null when it refused.
    result: { type: ['object', 'null'] },
    // stderr when it refused, so the stop reason is the command's own words.
    detail: { type: 'string' },
  },
}

/**
 * Run one autopilot step: observe what it needs, pipe it in, hand back stdout.
 *
 * The agent is an executor, not a decision maker. It is told the exact command
 * and what to observe; everything it could decide has already been decided by
 * the step it is running, which is why the same prompt shape serves all of them.
 */
function step(name, what, observe, phaseTitle) {
  return agent(
    [
      `Run one step of an unattended autopilot run, in ${input.root}.`,
      '',
      `Step: \`void-harness autopilot ${name} --json\`.`,
      `It needs: ${what}`,
      '',
      'Observe exactly that, in the repository, with read-only commands. Then pipe',
      'the observation as JSON on stdin into the command above, verbatim.',
      '',
      observe,
      '',
      'Return { ok, result, detail }: `result` is the parsed stdout when the command',
      'succeeded, and `detail` is its stderr when it refused. Do not summarise, do not',
      'repair the input, and do not run any other command that writes.',
    ].join('\n'),
    { label: `step:${name}`, phase: phaseTitle, schema: JSON_RESULT },
  )
}

/** Run argv a step returned. The plan decided it; this only executes it. */
function execute(commands, why, phaseTitle) {
  return agent(
    [
      `Execute these commands in ${input.root}, in order, stopping at the first failure:`,
      '',
      ...commands.map((command) => `  ${command.join(' ')}`),
      '',
      `They were computed by autopilot, not by you: ${why}`,
      'Do not substitute, reorder or add to them.',
      '',
      'Return { ok, result, detail } where result carries { ran: <count> } and detail',
      'names the first command that failed, with its stderr.',
    ].join('\n'),
    { label: 'execute', phase: phaseTitle, schema: JSON_RESULT },
  )
}

/**
 * Apply tracker actions a step returned, through the tracker connector.
 *
 * A reservation and a lifecycle plan are lists of tracker WRITES, not argv, and
 * `execute` runs argv. On 2026-09-02 a consumer's first run stopped at the lease:
 * the actions were filtered through `action.command`, which no tracker action
 * carries, so the list came back empty and nothing was written or said. The
 * agent holds the tracker tools; it applies each action exactly once, in order,
 * and returns one receipt per action so the step that planned them judges
 * convergence -- the script never concludes a write worked from having asked.
 */
function apply(actions, why, phaseTitle) {
  return agent(
    [
      'Apply these tracker actions, in order, through the tracker connector (the issue',
      'tracker tools available to you), each exactly once:',
      '',
      JSON.stringify(actions, null, 2),
      '',
      `They were computed by autopilot, not by you: ${why}`,
      'Do not substitute, reorder, merge or add to them. A comment body is written',
      'verbatim. An action whose result you could not observe is `unknown`, never',
      '`applied`; a write with an unknown result is retried as the same write, never',
      'as a second one.',
      '',
      'Return { ok, result, detail } where result carries { receipts: [...] }, one',
      'receipt per action in the same order: for a reservation action',
      '{ issueId, kind, result: "applied" | "failed" | "unknown" }, for a lifecycle',
      'action { idempotencyKey, ok }. `ok` is false when any action failed, and',
      '`detail` names the first one that did.',
    ].join('\n'),
    { label: 'apply', phase: phaseTitle, schema: JSON_RESULT },
  )
}

/** A step that refused stops the run: its own words are the stop reason. */
function required(answer, what) {
  if (!answer || answer.ok !== true || !answer.result) {
    throw new Error(`autopilot stopped at ${what}: ${answer?.detail ?? 'no answer'}`)
  }
  return answer.result
}

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

/**
 * The refusals, read off the plan rather than written here.
 *
 * They used to be a sentence in this function, which made the plan's
 * `workerMayPush` fields decorative: the prompt would have said the same thing
 * had they been true. Rendering them means a prohibition the plan carries
 * reaches the worker, and one it drops disappears from the brief too.
 */
function prohibitions(plan) {
  // Fail closed: only an explicit `true` grants. A plan that lost a field, or
  // an older one that never had it, must not read as permission -- an absent
  // refusal is exactly the silence this whole run treats as denial elsewhere.
  const denied = [
    plan.workerMayPush !== true && 'push',
    plan.workerMayOpenPullRequest !== true && 'open or update a pull request',
    plan.workerMayTransitionTicket !== true && 'merge anything, or move the ticket to In Review or Done',
    plan.workerMayPruneMissions !== true
      && 'run `void-harness mission prune`, which deletes the mission journals of the whole'
        + ' repository -- `.void/machine/` is per-repository state, so pruning from your worktree'
        + ' takes the runs of every worker beside you',
  ].filter(Boolean)
  const lines = [`You must NOT: ${denied.join(', ')}. Stop at a committed branch.`]

  if (plan.workerMayWriteSharedGitState === true) return lines

  const shared = plan.sharedGitState
  if (!shared) {
    // The plan carried no record. Still refuse, in one sentence, rather than
    // hand a worker a brief that says nothing about the shared stack.
    lines.push(
      '',
      'You must NOT write anything the repository shares across its worktrees: refs/stash, tags,',
      'notes, remotes, any branch other than your own, the repository config. A worktree isolates',
      'the working tree, the index and HEAD, and nothing else. To set changes aside, write',
      'git diff > a file inside your own worktree and apply it back.',
    )
    return lines
  }

  lines.push(
    '',
    'You must NOT write anything the repository shares across its worktrees. A worktree',
    'isolates the working tree, the index and HEAD, and nothing else — the entries below are one',
    'namespace for the whole repository, so a second worker in a second worktree writes the',
    'same ones you do, and each of you can silently take the other\'s work:',
    ...shared.shared.map((entry) => `  - ${entry}`),
    `The only exception is ${shared.exception}.`,
    `This is a class, not a list of banned commands. Among the commands that break it: ${shared.examples.join('; ')}.`,
    'Instead:',
    ...shared.instead.map((entry) => `  - ${entry}`),
    `Source: ${shared.source}.`,
  )
  return lines
}

function workerPrompt(assignment, plan) {
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
    ...prohibitions(plan),
    'The reconciler owns everything after that, and it refuses a range that touches a file',
    'another ticket of this cluster declared. Commit the paths your ticket owns, explicitly.',
    '',
    'Return the WorkerResult object. Commits must be full 40-character ids, in order, and the',
    'head must be the last of them. Every proof carries the argv that ran and a sha256 of its',
    'output — a proof you did not run is not a proof.',
  ].join('\n')
}

/**
 * Where a worker's hook telemetry lands, and why nothing is set here.
 *
 * The hooks resolve their root from `VOID_PROJECT_ROOT`, else
 * `CLAUDE_PROJECT_DIR`, else the git toplevel they discover -- and the
 * reconciler deletes the worktree, so a discovered toplevel means the run's
 * telemetry is gone before anyone reads the pull request.
 *
 * This adapter sets neither variable, for two reasons that both have to hold.
 * `agent()` takes label, phase, schema, model, effort, isolation and agentType,
 * and no environment option, so there is nothing to set it through. And the
 * runtime already puts the session's project -- the main checkout -- in
 * `CLAUDE_PROJECT_DIR`, which every subagent inherits, so there is nothing to
 * repair. The Codex adapter has neither property and exports `VOID_PROJECT_ROOT`
 * itself at spawn; see `references/codex-subagents.md`.
 *
 * Saying it in the worker brief would fix nothing, and this is the mechanism
 * rather than a preference: an `export` the agent runs in a shell call
 * does not reach the process the runtime launches hooks in.
 */

/** Fan the cluster out: disjoint tickets at once, colliding ones one by one. */
async function runWorkers(plan) {
  const results = []
  const disjoint = plan.assignments.filter((assignment) => assignment.lane === 'parallel')
  const colliding = plan.assignments
    .filter((assignment) => assignment.lane === 'sequential')
    .slice()
    .sort((a, b) => a.order - b.order)

  if (disjoint.length > 0) {
    phase('Parallel')
    log(`${disjoint.length} disjoint ticket(s), width ${plan.concurrency}`)
    const answers = await parallel(
      disjoint.map((assignment) => () =>
        agent(workerPrompt(assignment, plan), {
          label: `ticket:${assignment.ticketId}`,
          phase: 'Parallel',
          schema: WORKER_RESULT_SCHEMA,
        })),
    )
    // A null answer is not a result: the agent died or was skipped, and
    // partial-success resolution treats the ticket as unanswered.
    answers.forEach((answer, index) => {
      if (answer) results.push(answer)
      else log(`no result from ${disjoint[index].ticketId}`)
    })
  }

  // Awaited one at a time BECAUSE they collide — with each other, with a
  // lockfile, or with shared dev state. That is the point, not a limitation.
  for (const assignment of colliding) {
    phase('Sequential')
    log(`sequential: ${assignment.ticketId} (${assignment.order})`)
    const answer = await agent(workerPrompt(assignment, plan), {
      label: `ticket:${assignment.ticketId}`,
      phase: 'Sequential',
      schema: WORKER_RESULT_SCHEMA,
    })
    if (answer) results.push(answer)
    else log(`no result from ${assignment.ticketId}`)
  }
  return results
}

// ---------------------------------------------------------------------------

phase('Preflight')
const base = required(
  await step(
    'base',
    'the requested base, every branch with its head sha, and the raw protection response for the chosen one',
    'Read the branches with `git branch -r --format=...` and the protection with `gh api`. An unauthenticated `gh` is an answer too: pass its raw response through rather than deciding what it meant.',
    'Preflight',
  ),
  'base selection',
)
if (base.base.kind !== 'selected') throw new Error(`autopilot stopped: ${base.base.detail}`)
if (base.protection && base.protection.allowed !== true) {
  throw new Error(`autopilot stopped: the base is not provably protected — ${base.protection.detail}`)
}
log(`base ${base.base.branch} at ${base.base.sha.slice(0, 7)}`)

const journal = []
const beats = []
let taken = 0

/**
 * The two projections of the journal, because the two words are not synonyms.
 *
 * `taken` is every unit this run claimed, whatever became of it; `merged` is
 * only the ones a merge commit was observed for. The whole journal used to go
 * to both, so the draft body listed a unit waiting on a person under "What
 * merged so far", and the chain read a base as containing a change that was
 * never merged into it. Filtered here rather than asked of the agent: a
 * projection the prompt describes is a projection nobody can prove happened.
 */
const takenUnits = () => journal.map((entry) => ({ tickets: entry.tickets, outcome: entry.outcome }))
const mergedUnits = () =>
  journal
    .filter((entry) => entry.outcome === 'merged')
    .map((entry) => ({
      tickets: entry.tickets,
      integrationSha: entry.integrationSha,
      mergeCommit: entry.mergeCommit,
      unionVerdict: entry.unionVerdict,
      checks: entry.checks,
    }))

/**
 * Write down a unit this run took and could not finish.
 *
 * Where the script used to `break`, it left no trace: the CLI models `blocked`
 * as a third end and nothing shipped ever produced one, so a cluster with no
 * surviving range and a cluster whose proofs refused both ended as a silent
 * stop, and every ticket in them read as still remaining. A unit is taken once.
 * What became of it is a fact about it, not a reason to take it again -- so it
 * is journaled here, the worktrees are reclaimed exactly as they are after a
 * publish, and the chain decides whether the run goes on.
 */
async function blockUnit(tickets, cause, stepName, teardown) {
  journal.push({ tickets, outcome: 'unit-blocked', cause, integrationSha: null, mergeCommit: null, unionVerdict: null, checks: [] })
  taken += 1
  await beat(stepName, cause)
  if (teardown.length > 0) {
    await execute(teardown.map((s) => s.command), 'they reclaim the worktrees; no branch is deleted', 'Reconcile')
  }
}

/**
 * Say where the run is, in the one place a person can read without a terminal.
 *
 * After EVERY decision, not at the end. A run that publishes only when it
 * finishes is indistinguishable, while it runs, from one that died at minute
 * ten — and six hours of that is what the whole unattended cycle was supposed
 * to remove, not create.
 *
 * Failures here are logged and swallowed on purpose: not being readable is bad,
 * and stopping a healthy run because its status could not be posted is worse.
 */
async function beat(stepName, unit) {
  beats.push({ step: stepName, unit })
  const answer = await step(
    'progress',
    'the beats so far, what merged, the instant now, and the ceiling one unit may take',
    `Pass beats: ${JSON.stringify(beats)} with a real instant on each, merged verbatim: ${JSON.stringify(mergedUnits())}, and the run start ${input.now}. Then write the returned body to the path the plan names and run its commands.`,
    'Progress',
  )
  if (!answer || answer.ok !== true) {
    log(`could not publish progress after ${stepName}: ${answer?.detail ?? 'no answer'}`)
    return
  }
  if (answer.result?.plan?.steps?.length) {
    await execute(answer.result.plan.steps.map((s) => s.command), 'they put the run in front of a reader', 'Progress')
  }
}

// The chain decides how long this goes on, from the budget the programme
// declared and what the run has actually spent. Bounded here rather than by a
// count: "drain the backlog while I am out" is a duration, never five tickets.
while (true) {
  phase('Chain')
  const chain = required(
    await step(
      'chain',
      'what this run took and what became of each unit, what merged, elapsed milliseconds, the post-merge state of the base, and the pool',
      `Pass taken verbatim: ${JSON.stringify(takenUnits())}, and merged verbatim: ${JSON.stringify(mergedUnits())}. A unit published and waiting for a person is taken, not remaining, and neither is one this run blocked. Take elapsed from the run start passed in ${input.now}. Observe the base is green from the last verification of this run, and pass the pool as the programme's order minus what is done.`,
      'Chain',
    ),
    'the chain decision',
  )
  if (chain.decision.kind !== 'continue') {
    log(`stop (${chain.decision.reason}): ${chain.decision.detail}`)
    await beat('chain', chain.decision.reason)
    break
  }

  phase('Reserve')
  const reservation = required(
    await step(
      'reserve',
      'the cluster the planner selected and a fresh tracker observation of those issues',
      'Observe every issue in the cluster: state, assignee, comments, blocking relations. Pass them unmodified.',
      'Reserve',
    ),
    'the reservation',
  )
  if (reservation.kind === 'competing-claims') {
    log(`stop: someone else holds ${reservation.claims.map((claim) => claim.issueId).join(', ')}`)
    break
  }
  if (reservation.kind === 'blocked') throw new Error(`autopilot stopped: ${reservation.detail}`)
  if (reservation.kind === 'reserve') {
    const applied = required(await apply(reservation.actions, 'they take the lease this run needs', 'Reserve'), 'taking the lease')
    // The lease is active only once every reserved issue is re-observed in the
    // claimed state; `start` judges that and writes the run cursor the later
    // steps read. A partial convergence is handed back, never worked.
    const lease = required(
      await step(
        'start',
        'the reservation intent, the receipt of every action just applied, a fresh observation of every reserved issue, and the initial run cursor',
        [
          `Pass intent verbatim: ${JSON.stringify(reservation.intent)}.`,
          `Pass applied verbatim: ${JSON.stringify(applied.receipts ?? [])}.`,
          'Then re-observe every issue of the cluster in the tracker (state, assignee, comments, blocking relations) and pass it as reobservation, unmodified.',
          `Build state from the intent: schemaVersion 1, its runId, clusterId and programId, startedAt ${input.now}, base from its marker, one pending ticket per reserved issue (branch null, commits and proofs empty, blocker null), integration { branch: null, headSha: null, prUrl: null, prState: "none" }, trackerSynced false.`,
        ].join(' '),
        'Reserve',
      ),
      'the lease',
    )
    if (lease.kind !== 'active') {
      throw new Error(`autopilot stopped: the lease did not converge (${lease.kind}): ${lease.detail ?? 'see the step output'}`)
    }
  }

  const orchestration = required(
    await step(
      'orchestrate',
      'the reserved cluster, a footprint per ticket, and the paths the programme reserves to one writer',
      'The footprints come from the tickets themselves. A ticket whose footprint you cannot establish is passed with low confidence rather than guessed at: the step sequences what it cannot prove disjoint.',
      'Preflight',
    ),
    'the orchestration',
  )
  required(await execute(orchestration.setup.map((s) => s.command), 'they create the worktrees a worker may write in', 'Preflight'), 'creating the worktrees')

  await beat('orchestrate', chain.nextUnit)
  const results = await runWorkers(orchestration.plan)

  phase('Reconcile')
  const reconciliation = required(
    await step(
      'reconcile',
      'the worker answers and, for each branch, what git actually holds between the base and the head',
      [
        `Pass results verbatim: ${JSON.stringify(results).slice(0, 200)}…`,
        `Pass cluster: ${JSON.stringify(orchestration.plan.assignments.map((a) => a.ticketId))}.`,
        // Handed over, never re-derived. This step runs in a fresh context that
        // never saw the orchestration observation, and the most available way to
        // produce a footprint list you do not have is to read it off the branch
        // diff -- which makes the audit green about the diff it came from.
        `Pass footprints: ${JSON.stringify(orchestration.footprints ?? [])} — verbatim, and add nothing to them.`,
        `Observe each range with \`git log --format='%H %P' base..head\` plus \`git diff --name-only base..head\` as \`observedFiles\`.`,
        `Observe, never trust the worker's own commit list or file list. The audit refuses a range holding a file another ticket of the cluster declared.`,
      ].join('\n'),
      'Reconcile',
    ),
    'the reconciliation',
  )
  if (!reconciliation.plan) {
    log('nothing survived this cluster; every branch is preserved')
    await blockUnit(
      orchestration.plan.assignments.map((a) => a.ticketId),
      `nothing survived reconciliation: ${reconciliation.outcome?.detail ?? 'no range was integrable'}`,
      'reconcile',
      orchestration.teardown,
    )
    continue
  }
  required(await execute(reconciliation.plan.steps.map((s) => s.command), 'they merge only the ranges git confirmed', 'Reconcile'), 'merging the ranges')
  await beat('reconcile', reconciliation.plan.integrate.join(', '))

  phase('Verify')
  const verification = required(
    await step('verify', 'the integration sha and the verify commands the programme declares', 'Resolve the integration branch head with `git rev-parse`.', 'Verify'),
    'the verification plan',
  )
  const ran = required(
    await execute(verification.commands.map((command) => command.command), 'they are the suite the programme declared, and no other', 'Verify'),
    'running the suite',
  )
  const gate = required(
    await step(
      'gate',
      'the required proofs, the evidence that they ran, the merged tree hash, and the panel events',
      `The suite you just ran reported: ${JSON.stringify(ran).slice(0, 200)}…. Seal each outcome as evidence with its exact argv. Evidence you did not produce is not evidence.`,
      'Verify',
    ),
    'the gate',
  )
  if (gate.proofs.kind !== 'merge') {
    log(`stop (${gate.proofs.action}): ${gate.proofs.detail}`)
    await blockUnit(reconciliation.plan.integrate, `the proofs refused (${gate.proofs.action}): ${gate.proofs.detail}`, 'gate', orchestration.teardown)
    // The gate names what it wants: `STOP_CHAIN` ends the run, and anything
    // else ends this unit only. Reading both as "stop" threw away a
    // continuation the gate had already decided was safe.
    if (gate.proofs.action === 'STOP_CHAIN') break
    continue
  }

  phase('Publish')
  const publication = required(
    await step(
      'publish',
      'the integration head, the proof assessment, the worker branches, and the provenance of each merged ticket',
      'Include every excluded ticket with what makes it resumable. The body IS the account someone promotes on.',
      'Publish',
    ),
    'the publication',
  )
  required(await execute(publication.plan.steps.map((s) => s.command), 'one branch, one explicit refspec, one pull request', 'Publish'), 'publishing')

  const GRANT_NEEDS = 'the pull request it just opened, where the checks stand, the observed protection, the changed paths, and the union reading if one ran'
  const GRANT_OBSERVE = [
    'Read the pull request with `gh pr view --json number` and pass it as pullRequest: { "number": <n> }.',
    'A reading nobody ran is passed as null. It refuses, and the refusal hands back the request — running it is a separate act, and claiming it happened is the failure this guards.',
  ].join(' ')
  let decision = required(await step('grant', GRANT_NEEDS, GRANT_OBSERVE, 'Publish'), 'the merge grant')

  // `hold` is not a hand-off to a person. The checks are pending the instant the
  // branch is pushed, so it is the nominal FIRST answer, and reading it as
  // "published, awaiting human" both stated a false reason and abandoned a merge
  // the grant would have given once they settled. So it is asked again, after
  // waiting on the checks themselves -- and bounded, because a check that never
  // settles has to end this unit rather than the run's whole clock.
  const GRANT_REASKS_MAX = 3
  for (let reask = 1; decision.action.action === 'hold' && reask <= GRANT_REASKS_MAX; reask += 1) {
    log(`checks unsettled; asking the grant again (${reask}/${GRANT_REASKS_MAX})`)
    decision = required(
      await step(
        'grant',
        GRANT_NEEDS,
        `The checks had not settled. First wait for them with \`gh pr checks <number> --watch --fail-fast\`, which only reads and returns when they finish or one fails. Then observe everything again. ${GRANT_OBSERVE}`,
        'Publish',
      ),
      'the merge grant',
    )
  }
  log(`grant: ${decision.grant.kind} — next ${decision.action.action}`)

  // A grant is a permission; running it is a separate act, and observing what it
  // produced is a third. Until 2026-09-02 the first was written down as the
  // third: the journal said `merged` on the grant alone, nothing ever ran the
  // merge, and the chain took the next unit on a base that did not hold the
  // first one. The argv comes from the grant, bound to the head it read.
  let landing = null
  if (decision.action.action === 'merge' && decision.merge.steps.length > 0) {
    required(
      await execute(decision.merge.steps.map((s) => s.command), 'the grant permitted this one merge, bound to the head it read', 'Publish'),
      'merging the integration branch',
    )
    landing = required(
      await step(
        'landed',
        'what this run expects of the pull request, and the pull request as GitHub reports it now',
        `Pass expected: { "integrationBranch": "${reconciliation.plan.integrationBranch}", "integrationSha": "${verification.integrationSha}", "baseBranch": "${base.base.branch}", "baseSha": "${base.base.sha}" }. Then re-read the pull request with \`gh pr view --json number,state,headRefName,headRefOid,baseRefName,mergeCommit,statusCheckRollup\` and pass it as pullRequest: { "kind": "value", "value": <the full observation> }, or { "kind": "nil" } when it cannot be read. The command having returned is not a merge: only the merge commit GitHub reports is.`,
        'Publish',
      ),
      'the merge observation',
    )
  }
  const landed = landing?.verdict?.kind === 'merged'

  const lifecycle = required(
    await step(
      'lifecycle',
      'what the tracker should show now: the stage, the pull request, the observed merge commit when there is one, and every ticket with its disposition and native state',
      'Observe each ticket of the cluster in the tracker and pass its current native state. Pass no receipts on this first call: the step plans the actions, and nothing has been applied yet.',
      'Publish',
    ),
    'the tracker lifecycle',
  )
  // The plan is applied by an agent holding the tracker tools, and the SAME step
  // then reads the receipts: the run calls the tracker synced only when the step
  // says every action converged, never from having asked.
  let trackerConverged = true
  if (lifecycle.actions.length > 0) {
    const moved = required(await apply(lifecycle.actions, 'they move the tickets the run integrated, and comment the ones it left out', 'Publish'), 'moving the tickets')
    const reconciled = required(
      await step(
        'lifecycle',
        'the same observation as the previous lifecycle call, plus the receipt of every action just applied',
        `Pass the same stage, pull request, merge commit and tickets as the previous lifecycle call, and receipts verbatim: ${JSON.stringify(moved.receipts ?? [])}.`,
        'Publish',
      ),
      'the tracker reconciliation',
    )
    trackerConverged = reconciled.reconciliation?.converged === true
    if (!trackerConverged) log(`tracker not converged: ${reconciled.reconciliation?.detail ?? 'no reconciliation returned'}`)
  }

  // What became of the unit is recorded here, not inferred later, and each of
  // the three ends is read off a different fact: `merged` off the merge commit
  // GitHub reported, `published-awaiting-human` off the grant refusing to a
  // person, `blocked` off a merge that was permitted and did not land, or off
  // checks that never settled. The chain must never propose the unit again, nor
  // count any of these as still ready.
  journal.push({
    tickets: reconciliation.plan.integrate,
    outcome: landed ? 'merged' : decision.action.action === 'await-human' ? 'published-awaiting-human' : 'unit-blocked',
    cause: landed
      ? null
      : decision.action.action === 'merge'
        ? `the merge was permitted and did not land: ${landing?.verdict?.detail ?? 'no landing was observed'}`
        : decision.action.detail,
    integrationSha: verification.integrationSha,
    mergeCommit: landed ? landing.verdict.mergeSha : null,
    unionVerdict: decision.unionVerdict ?? 'inconclusive',
    checks: landing?.checks ?? [],
  })
  // A ticket the reconciler excluded was taken by this run all the same: it was
  // leased, a worker ran it, and its branch is still there. Journaling only
  // `integrate` dropped it back into the pool, so the chain proposed it again as
  // `nextUnit` inside the same run, and the next orchestrate tried to create a
  // worktree on a branch that already existed. It is taken, with its reason.
  for (const excluded of reconciliation.plan.excluded ?? []) {
    journal.push({
      tickets: [excluded.ticketId],
      outcome: 'unit-blocked',
      cause: `excluded at reconciliation (${excluded.reason}): ${excluded.detail}`,
      integrationSha: null,
      mergeCommit: null,
      unionVerdict: null,
      checks: [],
    })
  }
  taken += 1
  await beat('publish', reconciliation.plan.integrate.join(', '))
  required(await execute(orchestration.teardown.map((s) => s.command), 'they reclaim the worktrees; no branch is deleted', 'Reconcile'), 'reclaiming the worktrees')
  // A tracker that did not converge leaves the run in reconciliation, not in
  // "synced": the unit stays journaled and the next one is not taken.
  if (!trackerConverged) break
}

return { schemaVersion: 1, unitsTaken: taken, journal }
