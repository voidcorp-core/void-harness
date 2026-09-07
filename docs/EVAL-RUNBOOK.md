# Evaluation runner runbook

Status: approved implementation reference, 2026-09-07.

This document is the durable operating model for the autonomous-value
evaluation path. It exists to keep the implementation reproducible, bounded and
fast after a context clear. It is not a second test runner and it does not
authorize paid model calls.

## Reference implementations

The design follows the load-bearing patterns in these public codebases:

- [Inspect AI task execution](https://inspect.aisi.org.uk/tasks.html) models an
  evaluation as dataset, solver and scorer, with explicit sample, token, turn,
  time, working-time, cost and concurrency limits. Its
  [control channel](https://inspect.aisi.org.uk/control-channel.html) makes
  progress, stalls, errors and cancellation observable while a run is alive.
- [OpenAI Evals](https://github.com/openai/evals/blob/main/docs/build-eval.md)
  stores one input per JSONL row, keeps evaluation logic separate from scoring,
  and versions data so a result can be reproduced.
- [SWE-bench evaluation](https://github.com/swe-bench/SWE-bench/blob/main/docs/guides/evaluation.md)
  evaluates a patch from an exact repository state inside an isolated
  environment, runs held-out tests, records per-instance results and exposes
  bounded worker and cache controls.
- [GitHub Actions matrices](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
  make parallelism, fail-fast behaviour and per-cell continuation explicit.
- [Vitest parallel and sequential projects](https://vitest.dev/guide/recipes/parallel-sequential)
  keeps ordinary tests parallel while isolating tests that share a scarce
  resource.

The adaptation here is deliberately smaller: one deterministic TypeScript
control plane, one runtime adapter per model, and no retry-based recovery.

## Context policy for long-running agents

The context itself is a finite runtime resource. The official guidance from
OpenAI and Anthropic converges on the same operational rule: do not keep feeding
the model the entire history. Keep a small high-signal state, retrieve details
just in time, and compact before the context limit becomes an emergency.

- OpenAI describes context-window management as part of the agent loop: when a
  threshold is reached, replace the old input with a compact representation that
  preserves the useful state. Configuration changes are appended as new state,
  rather than silently rewriting earlier history. See
  [Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
  and [Responses API context compaction](https://openai.com/index/equip-responses-api-computer-environment/).
- Anthropic recommends minimal high-signal context, just-in-time retrieval,
  compaction, structured note-taking and clear artifacts between sessions. Its
  long-running harness uses an initializer followed by incremental coding
  sessions; compaction alone is not considered sufficient. See
  [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  and [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

For this repository that becomes five explicit context layers:

1. Stable doctrine: `AGENTS.md`, `CLAUDE.md` and the installed philosophy.
2. Programme slice: `.void/program.md`, the linked spec and the linked plan,
   only when selecting or executing programme work.
3. Current task: the exact ticket, relevant files and the smallest necessary
   reference material.
4. Runtime state: bounded tool output, test failures and durable artifacts,
   referenced by path and commit rather than pasted in full.
5. Handoff state: `.void/machine/checkpoint.md`, containing only dead ends,
   assumptions, freshness and one exact next action.

The transcript is not a durable state store. Do not paste old campaign logs,
full prompts or repeated test output into a new context. Store a redacted
artifact, record its commit and digest, and retrieve only the lines needed for
the next decision. When the context approaches its measured budget, compact at
the next safe boundary: after a cell, after a test lane or before a new
implementation slice. Never compact in the middle of an unrecorded mutation.

## Clear and resume protocol

Use this protocol whenever the context is long, continuity is degraded, or a
session changes direction:

1. Stop admitting new paid or external work.
2. Commit or explicitly explain every working-tree change.
3. Run the relevant local lanes and record the exact commit they tested.
4. Write the checkpoint, preserving the mechanical continuity block and keeping
   one exact next action.
5. Clear the conversation.
6. Resume by reading the doctrine, programme descriptor, runbook and checkpoint;
   do not reconstruct the history from the transcript.
7. Execute only the checkpoint's next action until fresh evidence changes it.

A clear is therefore a controlled handoff, not a loss of work. It reduces the
amount of context while preserving the decisions, evidence freshness and one
safe continuation point.

## Invariants

These are release-blocking properties, not suggestions.

1. A manifest is immutable for a run. It identifies the campaign, source commit,
   fixture digest, runtime, model, model version, effort, resource profile and
   order seed.
2. The schedule is deterministic. The pilot is exactly nine cells times three
   repetitions: 27 execution identities, each with a stable sequence.
3. A cell starts from the manifest source. The workspace factory must expose its
   actual base commit, and the runner refuses to execute when it differs from
   `startCommit`.
4. Fixtures are validated before execution. A digest mismatch is
   `unproducible`, never a scored failure.
5. The agent process is bounded by timeout, output, event, fixture and workspace
   limits. Stderr is diagnostic-only and must not consume the bounded evidence
   output budget.
6. Evidence is written by the executor. Worker claims, logs and prose are not
   proof. Missing, contradictory, thrown or contaminated evidence becomes
   `unknown`.
7. There are no retries in a quality gate. A retry changes a deterministic proof
   into a probabilistic one. Recovery is an explicit new run after the cause is
   fixed.
8. Admission is bounded. The scheduler uses bounded concurrency, preserves
   schedule order in the report, persists progress after each observation, and
   stops admitting new work after an infrastructure `unknown` when configured
   fail-closed.
9. Unknown is not zero. An absent result, unknown metric, failed cleanup or
   unavailable reviewer remains visible and makes the report inadmissible.
10. Scoring is downstream from execution. The runner produces observations; the
    pure scorer validates identity and computes aggregates only from admissible
    observations.
11. Release verification is separate from cell verification. A cell runs only
    targeted checks. The full release suite runs once on the final integrated
    tree.
12. A report is bound to the exact source, fixture, artifact and configuration
    identities it describes. A stale result is rejected, not relabelled.

## Execution topology

```text
immutable manifest
        |
        v
deterministic schedule (27 identities)
        |
        v
bounded admission (<= 3 campaign cells; <= 4 adapter workers)
        |
        +--> exact workspace -> fixture check -> base SHA check
        |                         |
        |                         v
        |                   bounded runtime
        |                         |
        |                         v
        |                   sealed evidence
        |
        +--> persist observation after every cell
                                      |
                                      v
                         pure report and admissibility gate
                                      |
                                      v
                         one full release gate after integration
```

The current versioned composition is
`runAutonomousValuePilot()` in
`apps/eval-harness/src/autonomous-value/campaign.ts`. It connects schedule,
adapter, observation stream and report. `runAutonomousValueCell()` in
`runner.ts` owns workspace identity, bounded execution and evidence sealing.
The `onObservation` callback is the persistence seam; a production launcher must
write one durable, redacted record per callback before admitting more work.

## Test lanes

The default feedback loop is intentionally layered:

| Lane | Command | Allowed dependencies | Gate |
| --- | --- | --- | --- |
| Fast | `pnpm test:fast` | pure CPU and contracts | every edit |
| Filesystem | `pnpm test:filesystem` | temp dirs, git, local fixtures | runner/workspace changes |
| Subprocess | `pnpm test:subprocess` | child processes, bounded I/O | process/adapter changes |
| Network/browser | explicit integration command | real network or browser service | release/integration only |
| Release | `pnpm verify` on the final tree | all required gates | before promotion |

The network/browser lane must have one top-level timeout, an explicit service
health check, and an observable `unknown` outcome when the service is absent. It
must not hold the fast lane hostage. A test that spends its whole timeout
without accepting a connection is an environment failure to diagnose, not a
reason to add retries or increase every timeout.

## Failure and recovery policy

- `unproducible`: the cell could not produce trustworthy evidence (wrong base,
  fixture mismatch, process failure, cleanup failure or contradictory proof).
- `unknown`: the result exists in the schedule but cannot be scored. It is
  always rendered in the report with its redacted reason.
- `blocked`: an explicit policy or authorization prevented execution. It is not
  converted into success.
- `completed`: only after evidence, identity, cleanup and metrics pass their
  validators.

On the first infrastructure unknown, stop admitting new cells for a fail-closed
campaign, materialize the remaining schedule entries as unknown, persist the
partial report, and fix the cause in a new code change. Do not rerun the same
campaign archive and do not infer a score from partial data.

## Operating procedure

1. Change code with a failing contract test first.
2. Run the fast lane, then the lane matching the changed boundary.
3. Run one local fake end-to-end campaign and inspect its report for all 27
   identities, ordering, persistence callbacks and explicit unknowns.
4. For a real canary, verify the manifest and approval digest, use a fresh run
   identifier, cap concurrency at three, stop on infrastructure unknown and
   persist per-cell results before continuing.
5. If the canary is not fully reproducible, stop. Do not spend the remaining
   budget.
6. Only after all observations are sealed, score and review the report.
7. Run the full release gate once on the integrated tree. Promotion remains a
   human decision.

## Current implementation status

Implemented and locally proven on 2026-09-07:

- deterministic 27-entry schedule and explicit unknown materialization;
- bounded scheduler with ordered observations, progress callbacks and
  fail-closed admission;
- stderr separation, bounded process output and targeted-check prompt guard;
- exact fixture and workspace-base identity enforcement;
- versioned end-to-end campaign composition;
- eval-harness: 163 tests passed; fast: 2,242 passed; filesystem: 1,544
  passed; subprocess: 955 passed and 2 skipped.

Still required before calling the real campaign or public release reliable:

- make the durable launcher use `runAutonomousValuePilot()` directly and write
  atomic per-cell records with resume/deduplication;
- repair or explicitly isolate the network/browser integration lane: the
  2026-09-07 full verify hit ten 10-second server-test timeouts after the
  `tsx` IPC health check failed with `EPERM`;
- run a fresh canary only after the corrected lane is green and a new approval is
  obtained;
- run a fresh full verification on the final commit and obtain the human
  promotion decision.

No historical `rerun-*` archive is admissible evidence, and no paid campaign is
authorized by this document.
