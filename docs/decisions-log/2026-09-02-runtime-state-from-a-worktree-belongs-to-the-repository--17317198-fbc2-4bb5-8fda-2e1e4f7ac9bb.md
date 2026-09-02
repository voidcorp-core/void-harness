---
schemaVersion: 1
id: "adr:17317198-fbc2-4bb5-8fda-2e1e4f7ac9bb"
createdAt: "2026-09-02T16:25:17.884Z"
title: "Runtime state from a worktree belongs to the repository"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Runtime state from a worktree belongs to the repository

## Context

Measured on 2026-09-02, run `run-2026-09-02-chain-b`. The DEV-704 worker, in its linked worktree
under `.void/autopilot/<run>/worktrees/`, ran `mission start --mode team` then `mission dispatch`
and was answered `phase: blocked / action: stop`: "no native specialists are installed in this
worktree". Twenty-one agents were installed, in the main checkout, and `git worktree add` had
carried none of them: `void-harness init` writes `.claude/*` into `.git/info/exclude` on purpose,
so that no checkout can delete the install, and a worktree restores tracked files only.

The CLI had one root, the directory it ran in, and looked for two different things there: the code
a command reads and writes, and the installation. Git keeps the two apart. `git rev-parse
--show-toplevel` names the working tree at hand; `git worktree list --porcelain` names every
working tree of the repository, the main one first (git-worktree(1), git 2.50). The main working
tree is where the harness is installed, because `init` runs nowhere else in a repository.

DEV-732 introduced `resolveProjectRoots`, computed once per command: `workRoot`, the directory the
command ran in, and `installRoot`, the main checkout from a linked worktree and `workRoot`
everywhere else. Reading the installed panel through `installRoot` closes the measured defect. One
question remained open in the ticket and had to be decided rather than assumed: where the
**runtime writes** go from a worktree, the mission journal, controller plan and evidence under
`.void/machine/runs/<mission-id>/`.

Two facts weigh on it. The hook runner already writes its telemetry to `VOID_PROJECT_ROOT`, else
`CLAUDE_PROJECT_DIR`, else the discovered root; under a worktree subagent `CLAUDE_PROJECT_DIR` is
the session's project, which is the main checkout. And the reconciler removes the worktree at the
end of the run, so anything written only there is gone before a person reads the pull request.

## Decision

`.void/machine/` is per-repository state, and from a linked worktree it is written and read in
`installRoot`. The mission store follows this now: `mission start`, `dispatch`, `specialist-event`,
`writer-event`, `close`, `verify`, `inspect`, `archive`, `prune` and `resume` address the journal
in `installRoot`, while the ticket, the diff, the context pack and the verified command keep
running in `workRoot`. A mission id is `mis_<uuid>`, so parallel workers of one cluster share the
directory without colliding.

The session checkpoint (`.void/machine/checkpoint.md`) is not moved. It is the residue of a
session in the tree that session sat in, written by the `void-checkpoint` skill relative to the
current directory and read back by `resume` from the same tree; a worker is commit-only and never
checkpoints. `status`, `graph` and `audit` still read telemetry from the directory they run in;
they follow this rule when they are next touched, and until then a worktree shows them an empty
history rather than a wrong one.

Readers of the installation itself, the panel, agents, skills, installed doctrine, hook bundle and
manifest, go through `installRoot`. `doctor` judges that root and names both when they differ.
The self-host doctor keeps judging the tree at hand, since what it compares is the current
sources with what they last compiled into. Writers of the installation (`init`, `add`, `remove`,
`update`, `hydrate`) are unchanged: `init` already refuses a worktree of the source repository, and
the exclude block is resolved through git rather than a path built by hand.

## Consequences

Positive:

- A worker's mission journal and evidence survive the teardown of its worktree, next to the hook
  telemetry of the same run, so the account the programme owes is in one place.
- `mission dispatch` from a worktree answers with envelopes instead of `blocked`, which is the
  precondition for the panel to be convened at all under autopilot.
- Nothing changes outside git or in the main checkout: `installRoot` is `workRoot` there, proven
  by test, including from a subdirectory.

Negative:

- Two roots are threaded through `dispatchMissionSpecialists`, `inspectCurrentMission` and
  `verifyMissionCommand`, and every caller must say which one it means. Accepted: a single root
  is exactly what produced the defect, and the type makes the choice visible at each call.
- A repository created with `--separate-git-dir` or a bare repository gets one root, the tree at
  hand, because the worktree listing then carries no main working tree to install into. That is
  the previous behaviour, not a regression.
- A git too old for `worktree list --porcelain` degrades the same way, silently. Git 2.7 (2016)
  is the floor; a `doctor` line for older versions was not added, because nothing below it runs
  linked worktrees either. `-z` was left out on purpose: it arrived in 2.36, and a repository
  path carrying a newline is not a case worth raising the floor for.

## Alternatives considered

- **Write runtime state in the worktree.** Simplest, and what happened before this record. Rejected
  because the reconciler removes the worktree, so the evidence a mission sealed disappears before
  anyone reads it, while the hooks' half of the same run sits in the main checkout: one run, two
  halves, one deleted.
- **Copy or link `.claude/` into each worktree.** Rejected in the ticket itself: a patch at the
  wrong level. It would also make the install per tree, and `update` would have to find every copy.
- **Derive the main checkout from `--git-common-dir`.** Its parent is the main working tree only
  under the default layout; `--separate-git-dir` breaks the assumption silently. The worktree
  listing is what git documents for "where is the main working tree", so it is the call made.
- **Make `workRoot` the toplevel of the current tree rather than the directory the command ran
  in.** Would change what every command means from a subdirectory of the main checkout, which the
  ticket required to stay as it is. Deferred, and unrelated to the defect.

## Reversal cost

Low. One module, `packages/cli/src/lib/project-roots.ts`, and the call sites that pass
`installRoot` instead of the working directory. Reverting restores a worker that cannot find its
panel, so the reason would have to be a better home for the install than the main checkout, not
the absence of one.
