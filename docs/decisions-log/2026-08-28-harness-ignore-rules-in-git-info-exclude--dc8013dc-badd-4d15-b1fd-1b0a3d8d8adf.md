---
schemaVersion: 1
id: "adr:dc8013dc-badd-4d15-b1fd-1b0a3d8d8adf"
createdAt: "2026-08-28T17:26:41.123Z"
title: "Harness ignore rules live in .git/info/exclude, not the project .gitignore"
status: proposed
deciders: []
supersedes: []
---

# Harness ignore rules live in .git/info/exclude, not the project .gitignore

## Context

The harness installs assets git does not track: skills, agents and the hook
bundle under `.claude/`, `.agents/`, `.codex/` and `.void/`. It keeps them out of
the project's history by writing a marked block into the project's `.gitignore`.

The block itself is fine. It was collapsed to directory patterns
(`.claude/*`, `!.claude/skills/`, `.claude/skills/*`) rather than an enumeration
of owned paths, so a renamed asset is covered the day it is renamed.

The problem is the file it lives in. **`.gitignore` is tracked, so the protection
is branch-dependent, while the assets it protects are not.** Check out any branch
whose `.gitignore` does not carry the block -- a branch cut before the harness was
installed, a long-lived feature branch, a bisect -- and every installed asset
becomes an ordinary untracked file. The `git clean -fd` that habitually follows
then deletes it.

Reproduced on a plain consumer project with a current, fully consistent 3.4.1
install:

    git checkout -b legacy <pre-install commit>
    git clean -fd

    .claude/         gone entirely
    .agents/         gone entirely
    .void/hooks/     gone -- the enforcement floor .claude/settings.json names
    .void/machine/   gone -- including the install receipt

The whole harness is removed, silently, by two commands nobody would think twice
about. And the receipt-versus-disk check that now ships cannot report it: the
receipt lives under `.void/machine/`, which the same `clean` deletes, so the last
witness goes with the evidence.

A second, smaller cost comes from the same choice. `init` and `update` rewrite
everything between the markers, so a project that shortened or adapted the block
has its edit reverted on the next update, with no way to declare a local policy.

## Decision

The harness writes its ignore rules to `.git/info/exclude`, resolved through
`git rev-parse --git-path info/exclude`, and stops writing a managed block into
the project's `.gitignore`.

## Consequences

Positive:

- The protection stops depending on which branch is checked out.
  `.git/info/exclude` is per-clone and untracked, so `checkout`, `reset`, branch
  switches and bisects leave it alone. The failure above cannot occur.
- `.gitignore` becomes the project's file again. The harness no longer competes
  with it, which retires the overwrite complaint outright instead of arbitrating
  it with a new configuration switch.
- Ownership becomes coherent: locally installed assets are local state, and the
  rules that hide them are local state too, with the same lifetime.
- Uninstalling gets simpler. Removing the harness stops meaning "edit a tracked
  file the project also edits, and trust that the markers still delimit exactly
  what we wrote"; the rules live in a file only the harness ever writes.

Negative:

- The rules are no longer visible to the team in a shared file. Accepted: what
  they hide is not shared either. A fresh clone has neither the assets nor the
  rules, and runs `init`, which writes both.
- One path resolution to get right. In a git worktree `.git` is a file, not a
  directory, so the location must come from `git rev-parse --git-path` and never
  from joining `.git/info/exclude` onto the project root. Autopilot workers run
  in worktrees, so that is the common case here, not the exotic one.
- Existing installs carry the block in `.gitignore`. `update` has to remove it,
  and removing it edits a tracked file, which is a diff the project did not ask
  for in that run.
- A project that shares a clone across several checkouts of the same repository
  through `git worktree` gets one exclude file for all of them, since worktrees
  share the common git directory. That matches the harness, which installs once
  per clone, but it is worth stating rather than discovering.

## Alternatives considered

- **Keep the block in `.gitignore` and harden its contents.** Rejected, because
  the contents are already correct. No wording of a rule inside a tracked file
  survives a checkout to a branch that does not contain that file's current
  version, which is the whole failure.

- **Keep the block and add a project policy switch** (`gitignore.style:
  enumerated | directories` in `.void/config.json`), as the source issue
  proposed. Rejected: it settles the overwrite argument and does nothing about
  the branch dependence, which is the one that destroys the install. It also adds
  a configuration surface to arbitrate a conflict that disappears once the
  harness stops writing that file at all.

- **Detect and repair instead of preventing** (the receipt-versus-disk check that
  now ships). Kept, but it cannot be the answer here: the reproduction deletes
  the receipt along with everything else, so the detection has nothing to read.
  It stays valuable for every other way an asset goes missing.

- **Track the assets instead of ignoring them.** Rejected: it puts 137
  regenerated files into every consumer's history and every consumer's diffs, and
  makes `update` a source of merge conflicts in projects that never edited them.

## Reversal cost

Low. The rules are regenerated from the owned-path list on every `init` and
`update`, so reverting means writing them to the other file on the next run. No
data is migrated, nothing is destroyed, and a project that reverts gets a correct
block back the first time it updates.
