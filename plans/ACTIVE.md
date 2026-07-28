---
status: executing
program: void-harness-v3-top-tier-engineering-team
plan: plans/2026-07-24-void-harness-v3-top-tier-engineering-team-plan.md
spec: docs/specs/2026-07-24-void-harness-v3-top-tier-engineering-team.md
tracker:
  workspace: voidcorp
  team: DEV
  project: void harness
  firstIssue: DEV-433
  lastIssue: DEV-461
humanGates:
  - DEV-433
  - DEV-457
---

# Active program: void-harness v3

This file is the stable cross-session pointer for the executing v3 program. It deliberately does
not name a current or next ticket. Linear owns progress, claims, dependencies, review state, and
the resume trail.

## Sources of truth

Read these before selecting or executing work:

1. the global plan named in frontmatter, including its architecture, checkpoints, verification
   gates, Linear execution handoff, and resume point;
2. the approved spec named in frontmatter;
3. the complete selected Linear issue, including its native relations and current state;
4. `AGENTS.md` or `CLAUDE.md` and the current repository state.

The global plan supplies program intent and sequencing. The Linear ticket is the executable unit.
Do not implement from a remembered or summarized ticket.

## Automatic session bootstrap

When the user asks to continue, start, resume, or otherwise execute the active program without
naming a ticket:

1. List issues `DEV-433` through `DEV-461` in Linear workspace `voidcorp`, team `DEV`, project
   `void harness`.
2. Fetch full details and relations for every candidate needed to decide readiness.
3. If exactly one program issue is `In Progress`, resume it.
4. If more than one is `In Progress`, do not guess ownership. Resume the issue explicitly named by
   the user; otherwise report the competing claims.
5. If none is `In Progress`, select the first ready `Backlog` or `Todo` issue in the order of the
   plan's `Linear execution handoff` table. Ready means every native `blockedBy` issue is `Done`.
6. Fetch the selected issue again with relations immediately before claiming it.
7. Move it to `In Progress`, assign it to the current maintainer, then execute it with
   `ticket-runner` (`harness:ticket-runner` on Claude Code).

Do not ask the user to restate the plan, tracker, project, ticket range, or selection rules. A
specific user request or explicit ticket always overrides automatic selection.

## Mandatory Linear lifecycle

Linear is part of execution, not an after-the-fact mirror.

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
- **Failure**: if Linear cannot be read or updated, stop. Do not claim another ticket or maintain a
  local substitute for tracker state.

Never place secrets, full prompts, full model responses, or private consumer source in Linear.

## Human gates and autonomy boundary

`DEV-433` and `DEV-457` are human gates. The agent may collect evidence and move a gate to
`In Review`, but only Folpe's explicit approval can move it to `Done`.

PR merge remains human. `backlog-autopilot` may select independent ready tickets only through its
documented attended confirmation flow. The active handoff does not create a headless backend and
does not weaken single-writer rules for lockfiles, migrations, generated assets, or shared
contracts.

## Program completion

When all scoped implementation tickets are `Done` and both human gates were explicitly approved,
the final program change sets this file's `status` to `completed`. It does not repoint itself to a
different plan or tracker scope.
