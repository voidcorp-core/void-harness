---
schemaVersion: 1
status: executing
program: merge-grant-and-install-safety
plan: docs/plans/2026-08-30-shipped-guards-plan.md
spec: docs/specs/2026-08-30-shipped-guards-that-are-open.md
progress:
  provider: linear
  scope: voidcorp/DEV/void harness
  order: [DEV-677, DEV-673, DEV-665, DEV-664]
  states:
    ready: [Backlog, Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done, Canceled]
humanGates:
  - DEV-677
  - DEV-673
autopilot:
  schemaVersion: 1
  clusterSize: 4
  base: develop
  mergeGate: union-reviewed
  deployBranch: main
  verifyCommands:
    - [pnpm, build]
    - [pnpm, test]
  ownership:
    sequential:
      - pnpm-lock.yaml
      - packages/cli/core-assets/**
      - packages/harness-graph/model.json
      - packages/harness-graph/catalog.v3.json
      # DEV-677 and DEV-673 both rewrite the merge grant, so the router must
      # sequence them rather than fan them out. Declared here rather than left to
      # footprint inference, because a semantic conflict in the guard that
      # authorizes a merge is the one no tooling resolves after the fact.
      - packages/cli/src/lib/autopilot/union-review.ts
    reconcileOnly: []
---

# Program: close the guards that are shipped and open

This file is the stable global context for the executing program. It deliberately names neither a
current nor a next work unit. The provider declared under `progress` owns claims, dependencies,
review state and the remote resume trail; this file only locates that state.

The pointer moved on 2026-08-30, after the expert-team spine shipped in #298 and #299 and its
Checkpoint A was read. The programme is now the pool of **delivered defects** the day surfaced:
guards that are live and open. Each was kept rather than dropped by the admission rule precisely
because it is shipped, and a shipped defect does not compare against the work in progress.

`DEV-677` and `DEV-673` both rewrite `judgeMergeGrant`. They are declared sequential under
`autopilot.ownership` rather than left to footprint inference: two agents rewriting the guard that
authorizes a merge produce a semantic conflict, and no tooling resolves one after the fact.

This is also the first attended dogfood of `autopilot` against a real pool. What it reveals about
the drainer counts as much as what it fixes.

## Sources of truth

Read these before selecting or executing work:

1. the global plan named in frontmatter, including its architecture, checkpoints, verification
   gates, execution handoff, and resume point;
2. the approved spec named in frontmatter;
3. the complete selected work unit from the declared progress provider, including native
   relations and current state;
4. `AGENTS.md` or `CLAUDE.md` and the current repository state.

The global plan supplies intent and sequencing. The provider-native record is the executable unit.
Do not implement from a remembered or summarized record.

## Automatic session bootstrap

When the user asks to continue, start, resume, or otherwise execute the program without naming a
work unit:

1. Resolve the adapter named by `progress.provider` and query the opaque `progress.scope`.
2. Fetch full details and relations for every candidate needed to decide readiness.
3. If exactly one unit is in a `progress.states.started` state, resume it.
4. If several units are started, report the competing claims instead of guessing ownership.
5. Otherwise select the first ready unit from `progress.order` whose native blockers are done.
6. Fetch the selected unit and relations again immediately before claiming it.
7. Claim it through the provider adapter, then execute it with `void-implement`.

If the provider cannot be resolved, stop only the action that needs it; the program and local
checkpoint remain readable. A specific user request or explicit work unit always overrides
automatic selection.

## Progress lifecycle

The declared provider is part of execution, not an after-the-fact mirror.

- **Claim**: set the issue to `In Progress` and assign it before the first implementation edit.
- **Progress**: keep native `blockedBy` relations accurate. Add a concise comment when a material
  blocker, scope decision, or external dependency changes the execution contract.
- **Session handoff**: if work remains when a session ends, keep the issue `In Progress` and add one
  bounded resume comment containing branch/worktree, last verified result, remaining work, blocker,
  and the exact next action.
- **Review**: after all ticket gates pass, attach the PR and evidence, summarize verification in a
  comment, and move the issue to `In Review`.
- **Completion**: move the issue to `Done` only after the PR is merged and final verification
  confirms the merged state.
- **Failure**: if the provider cannot be read or updated, stop. Do not claim another unit or
  maintain a local substitute for progress state.

Never place secrets, full prompts, full model responses, or private consumer source in the
provider.

## Human gates and autonomy boundary

Checkpoint A was read on 2026-08-30 and is closed: the panel convened before the writing, refuted
a stale ticket premise from four independent lenses, and the run closed six production merge
grants. What it also revealed -- a context pack that was empty at the stage where the panel
convenes first -- was fixed inside the same unit.

The gate now is the merge of the integration PR into `develop`, and promotion to `main` stays
human as always. Findings are arbitrated inside the cycle by the forced comparison against the
unit in progress, so no queue accumulates and no human is a bottleneck on them.

Promotion to `main` remains human, and what a person judges there is the feature. The integration
PR into `develop` merges itself only once an adversarial reading of the whole integrated diff came
back clean; unread, inconclusive or stale all refuse. `autopilot` may select independent ready units
only through its documented attended confirmation flow. The program descriptor does not create a headless backend and
does not weaken single-writer rules for lockfiles, migrations, generated assets, or shared
contracts.

## Program completion

When all scoped implementation units are done and both human gates were explicitly approved, the
final program change sets this file's `status` to `completed`. It does not repoint itself to a
different plan or progress scope.
