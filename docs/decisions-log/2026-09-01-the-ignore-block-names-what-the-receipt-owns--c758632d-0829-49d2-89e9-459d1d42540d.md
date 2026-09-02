---
schemaVersion: 1
id: "adr:c758632d-0829-49d2-89e9-459d1d42540d"
createdAt: "2026-09-01T08:35:41.820Z"
title: "The ignore block states its patterns before the transaction and its names after"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# The ignore block states its patterns before the transaction and its names after

## Context

`init` writes a marked block into `.git/info/exclude`, and it has to be there before the file
transaction runs: an install that is interrupted, or a `git clean` on a repository mid-install,
would otherwise carry off the very files just written. That placement is deliberate and it is
right, for the patterns.

The block stopped being only patterns when the enumeration landed. No pattern can tell
`.claude/agents/doctrine-critic.md` shipped by the harness from an agent the project wrote under
that same name, so the owned agents are listed one by one, taken from what the install stages.

That made the content depend on an install that had not happened yet. A rollback then left the
repository ignoring twenty-one agent paths that are not on disk -- measured, not argued: a second
install refusing to overwrite a hand-edited owned file leaves exactly that. An agent the project
later writes under one of those names is invisible to git, silently, and the loss lands at the
first clone. It is the failure the enumeration was introduced to remove, reintroduced on the
failure path.

## Decision

The block is written twice, and each half is written when it becomes true.

Before the transaction: the patterns, which are true of any install of this harness whatever
happens next. After the commit: the names, read from the **receipt** rather than from the stage,
because the stage is what the install meant to write and the receipt is what is on disk.

The second write is silent. The `git exclude` line was already printed when the block appeared, and
a second one for the same file would read as two different rules rather than one completed.

## Consequences

Positive:

- A failed install leaves no rule naming a path it did not write, so the enumeration cannot hide an
  agent the project writes later.
- The protection that motivated the early placement is untouched: the patterns still cover
  `.void/machine/` and the generated halves before anything is staged.
- The names now come from the same artefact that proves ownership everywhere else in this codebase.
  One question, one source.

Negative:

- Two writes to the same file in one install, where there was one. Both are idempotent and the
  second is a no-op when the first already said everything.
- A window between the commit and the second write during which the freshly written agents are
  visible to git. It is microseconds inside a process that is about to finish, and the direction is
  the safe one: an agent visible by mistake is a diff someone sees, an agent hidden by mistake is
  work nobody notices leaving.

## Alternatives considered

- **Write the whole block after the transaction.** Rejected: it reopens the window the early
  placement exists to close, where an interrupted install has files on disk and nothing telling git
  to leave them alone.
- **Put the exclude file into the transaction with a rollback handler.** Rejected: `.git/info/exclude`
  is per-clone git metadata, outside the mirror the receipt publishes. Pulling it into the
  transaction would make the transaction responsible for a file no manifest describes and no other
  checkout restores, for one field's sake.
- **Drop the enumeration and go back to patterns alone.** Rejected: it restores the loss the
  enumeration closed, where the block ignored `.claude/skills/*` wholesale and left the project to
  re-include its own work by hand.

## Reversal cost

Low. One call moved past the commit and one helper. Reverting restores an install whose failure
path claims files it never wrote, so the reason would have to be better than the measurement.
