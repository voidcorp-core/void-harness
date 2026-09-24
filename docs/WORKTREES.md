# Worktrees

The universal invariant lives in [PHILOSOPHY.md](PHILOSOPHY.md#git-worktree-placement-and-lifetime):
where a working worktree lives, when it is reused, and that it belongs to the ticket, not to the
run. This document describes how the autopilot loop applies it. No terminal, editor or
presentation adapter chooses a worktree location or authorizes removal.

## One worktree per ticket

When `autopilot next` answers `assign`, the orchestrator creates the ticket's worktree at the
durable location the invariant names, or reuses the one `git worktree list` already shows for
that branch, before the worker starts. The worker never chooses its location. A worker relaunched
on the same ticket gets the same worktree; when the worktree is gone, it is recreated from the
branch, because the branch and its commits are the record.

A worktree isolates the working tree, the index and `HEAD`, and nothing else. What the repository
shares across its worktrees (the config and its includes, `refs/stash`, tags, notes, remotes, the
local base and deploy branches, hooks) is what a unit must not touch, and
`autopilot fingerprint --before` and `--after` around each unit prove it did not.

## Removal after an observed merge

A worktree is removed only once its pull request is observed merged on GitHub: a pull request
armed, queued or gone from a list is not a merge. Removal is an unforced `git worktree remove`,
so Git itself refuses a tree that became dirty. A worktree with useful ignored evidence keeps that
evidence first, even when Git reports it clean. An interrupted run leaves its worktrees in place;
unmerged work is never removed with them, and branches are never deleted by the loop.

## Verification and storage

Real Git tests create only synthetic, uniquely owned fixtures under durable user
data storage, record HEAD/index/staged/unstaged/untracked-byte proof, then remove
those fixtures after saving evidence. This explicit test teardown does not authorize
cleanup of development worktrees, useful local evidence or shared caches. Session
and display resource closure never triggers Git removal or global pruning; see
[NATIVE-SUPERVISION.md](NATIVE-SUPERVISION.md).

Sources: [Git worktree](https://git-scm.com/docs/git-worktree),
[Git reference validation](https://git-scm.com/docs/git-check-ref-format), and
[XDG base directories](https://specifications.freedesktop.org/basedir/latest/).

### Preserving project doctrine across installation

Init, re-init and update preserve customized PROJECT-DOCTRINE bytes, including
line endings. Install manifests keep observed file hashes separate from the optional
`projectDoctrineTemplateSha256`, which comes from the delivered package template.
Refreshing an existing doctrine requires both equality with that template digest
and unchanged observed bytes. Legacy manifests without template provenance preserve
the existing file conservatively; an observed hash alone cannot establish that the
harness authored user content. A proven untouched seeded template can still refresh.
