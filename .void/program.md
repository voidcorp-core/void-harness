---
schemaVersion: 1
status: executing
program: autonomous-until-develop
plan: docs/plans/2026-09-22-autopilot-native-loop-plan.md
spec: docs/specs/2026-09-22-autopilot-native-loop.md
progress:
  provider: linear
  scope: voidcorp/DEV/void harness
  # Selection belongs to the curator, which reads the project and the tracker;
  # the continuous loop never reads this list. It still bounds two older
  # readers: the cluster engine's `plan` pool, and a resume that names no unit.
  # Keep it to what a person would accept being picked without being asked.
  order: [DEV-858, DEV-877, DEV-859]
  states:
    ready: [Backlog, Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done, Canceled]
humanGates: []
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
    reconcileOnly: []
  # Additions only. The floor lives in PROTECTED_PATHS_FLOOR and already covers
  # `.github/**`, the installed hooks, the loop's own sources, the refusal to
  # merge into the branch that deploys, and the scripts that judge a merge or a
  # publication; this list can widen that ground, never narrow it.
  protectedPaths: []
---

# Program: autonomous until develop

## Scope, since 24 September 2026

The programme runs the continuous delivery loop named in frontmatter. A curator
selects and ranks the work from the project and the tracker, reading Todo, then
Backlog, then Triage; it enriches a unit before declaring it ready and never
closes or deletes one. Four slots at most run at a time, one worker per unit in
its own worktree, each running the complete `void-implement` cycle. One pull
request per unit targets `develop`, auto-merge is the default there, and the
GitHub merge queue replays the checks on the combined result. An independent
reviewer's verdict, signed and verified by a required check, is what authorizes
a merge; no human reads the code for it.

The earlier scope of 16 September (DEV-844 first, then DEV-531/611/630/682/662/635)
is delivered or lapsed, and is not reopened here. The non-production merge grant
and the protection requirements are unchanged: the loop merges into `develop`
only, never into `main`, and promotion to production stays a person's.

Corrections stay in the artefact being worked on. A change contradicting an
accepted decision requires supersession, never an in-place rewrite. Completion
never selects or repoints a successor pool: the curator does, each time the
project moves.

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

When all seven scoped implementation units are verified and delivered into `develop`
under the declared `union-reviewed` merge gate, the final program change sets this
file's `status` to `completed`. Promotion to `main` is not a completion prerequisite
and remains a separate human decision. This program never repoints itself to a
different plan or progress scope.
