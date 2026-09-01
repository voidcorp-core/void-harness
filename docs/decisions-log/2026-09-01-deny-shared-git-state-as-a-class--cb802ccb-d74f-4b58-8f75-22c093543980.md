---
schemaVersion: 1
id: "adr:cb802ccb-d74f-4b58-8f75-22c093543980"
createdAt: "2026-09-01T15:16:16.413Z"
title: "the worker is denied a class of shared git state, not a command"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# the worker is denied a class of shared git state, not a command

## Context

Two workers, two worktrees, the same `refs/stash`. Each pushed a stash to split a commit and the
second `pop` took the first one's entry. The mechanism is not an accident of those two tickets: it
is what `git worktree` is, and the run was built on an assumption that its isolation was total.

The installed documentation says otherwise, and was read rather than remembered.
`git-worktree(1)`, section REFS: "all pseudo refs are per-worktree and all refs starting with
`refs/` are shared [...] refs inside `refs/bisect`, `refs/worktree` and `refs/rewritten` are not
shared." Section CONFIGURATION FILE: "the repository config file is shared across all worktrees"
unless `extensions.worktreeConfig` is enabled. Each entry was confirmed with `git rev-parse
--git-path` on git 2.50.1: a shared one resolves under the common directory, a per-worktree one
under `worktrees/<id>/`.

That reading corrects the ticket's own guess. An in-progress `rebase`, `merge` or `bisect` is
per-worktree (`rebase-merge`, `MERGE_HEAD`, `BISECT_LOG` all resolve under `worktrees/<id>/`), so
it stays out of the prohibition; adding it out of caution would forbid a worker an ordinary local
operation. What is genuinely shared is `refs/stash`, `refs/tags/*`, `refs/notes/*`,
`refs/remotes/*`, `refs/heads/*`, and the repository config.

`refs/heads/*` is the reason the prohibition cannot simply be "no shared ref". A worker exists to
commit on the branch its assignment names, and that branch is a shared ref like any other.

## Decision

The orchestration plan carries `workerMayWriteSharedGitState: false` plus a `sharedGitState`
record -- the shared namespaces, the one exception (the branch the worker's own assignment names),
the commands that break it, the replacement gesture, and the documentation the list came from --
and the worker brief renders that record instead of restating it in prose.

The rule names the class. `git stash` is what bit, but `git tag`, `git notes`, a repository-scoped
`git config` and `git update-ref` land in the same shared space, and a worker refused one command
reaches for its neighbour. The replacement gesture ships with the prohibition, because a worker
denied a gesture and given nothing reinvents the problem: `git diff > a file inside the worktree`,
or a temporary commit on its own branch, amended afterwards.

## Consequences

Positive:

- The prohibition lives in the artefact the adapter reads, next to `workerMayPush`, so an adapter
  that honours the plan cannot grant what the plan denies.
- Rendering the brief from the plan makes the existing `workerMayPush` fields load-bearing rather
  than decorative: until now the prompt said the same thing whatever those fields held.
- The list is derivable. A reader who doubts an entry has the section name and the command that
  reproduces it.

Negative:

- A worker that ignores its brief is not stopped. This is a declaration, not an enforcement hook,
  and the run has no sandbox that intercepts `git stash` -- the footprint audit at reconciliation
  is what catches the consequence.
- The list is pinned to what git 2.50.1 documents. A future git that moves a namespace between the
  common directory and the worktree makes it stale, and nothing detects that automatically.

## Alternatives considered

- **Forbid `git stash` and nothing else.** The literal reading of the incident, and the reason it
  is rejected is that the incident is a property of shared refs, not of one command. A worker told
  only "no stash" satisfies the letter with `git tag wip-DEV-1` and reproduces the failure under a
  different name.
- **Leave the prohibition in the prompt prose.** Cheapest, and it is what already existed for
  push, pull requests and tracker writes. A prompt is rewritten, truncated and re-templated; the
  skill already claimed those refusals live "in the plan itself, not only in the prompt", and this
  makes the claim true rather than aspirational.
- **Enable `extensions.worktreeConfig` and give each worktree its own config.** Solves exactly one
  entry of the list, does nothing for `refs/stash`, and writes a repository-wide setting from
  inside a run -- itself a write to shared state.
- **Isolate each worker in its own clone.** Removes the shared namespace entirely. Out of scope by
  the ticket's own decision: a full checkout and install per ticket costs more than the
  prohibition, which is free.

## Reversal cost

Low. The record is one frozen constant on the plan and one renderer in the workflow script.
Changing an entry, adding a namespace, or dropping the prohibition is a local edit with tests
attached, and nothing persists a plan between runs.
