---
schemaVersion: 1
id: "adr:65527cfd-3e48-4ee8-9fbd-4c750cb6d5bc"
createdAt: "2026-08-30T06:05:36.825Z"
title: "Merge blocks name what a machine must not merge unread, and are not sequential ownership"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Merge blocks name what a machine must not merge unread, and are not sequential ownership

## Context

The merge grant refuses a cluster whose integrated diff touches a path a machine
must not take unread. The tempting source for that list already exists:
`ownership.sequential`, which the programme declares so two workers never write
the same file at once.

The two lists look alike and answer different questions.
`ownership.sequential` answers *which paths cannot be written concurrently*, and
in this repository it names regenerated mirrors -- `packages/cli/core-assets/**`
and the catalogs derived beside them. Their contents are proved by
`derive:check`; nothing about merging them is risky. Reusing that list as the
merge guard would have refused the very cluster this mechanism integrated on
2026-08-30: five tickets, eight files under that mirror, every one of them a
generated copy of a file already in the diff.

The opposite error is just as available. A guard that fires on ordinary work is
one people route around, and a guard that misses the paths where being wrong is
expensive is not a guard at all. The first version of the list made both
mistakes at once: it blocked `docs/migrations/guide.md`, which is prose, and
walked past `apps/web/pnpm-lock.yaml`, `bun.lock`, `.github/actions/**` and
`CODEOWNERS`.

## Decision

The merge guard reads its own list, `mergeBlocks`, defaulting to the paths where
being wrong is expensive AND invisible in a diff: what runs inside a migrations
directory, both halves of `.github/` that execute during a publish, every
lockfile at any depth, and `CODEOWNERS`. It is deliberately not
`ownership.sequential`, and the code, the shipped skill, and a test that compares
the two all say so.

## Consequences

Positive:

- A cluster of ordinary work merges. The guard fires on the classes where a
  machine has no way to judge the blast radius from the diff it is reading.
- The two questions stay separable. A project can order more paths sequentially
  without silently narrowing what its machine may merge, and can widen its merge
  guard without serialising its workers.

Negative:

- Two lists to maintain instead of one, and they will drift. The mitigation is
  that they drift toward different purposes rather than toward each other: the
  scheduler reads one, the merge grant the other, and neither reads both.
- The default list is a judgement about danger, and judgements about danger age.
  A new class of executable path -- a deploy manifest, an infrastructure
  descriptor -- will pass unblocked until someone adds it.

## Alternatives considered

- **Reuse `ownership.sequential` as the merge guard.** Rejected on measurement:
  it refuses clusters that are safe by construction. Eight generated files under
  a declared-sequential mirror would have blocked an integration whose contents a
  check already proved, which is how a guard stops protecting and starts
  obstructing.

- **Block nothing, and let the union reading carry it.** Rejected: the reading
  judges the bytes of a diff, and what makes a migration or a lockfile dangerous
  is not in the bytes. A reader cannot see that a column drop locks a table in
  production, or that a resolved version pulls a different transitive tree onto
  every consumer.

- **Block the whole of any `migrations` directory.** Rejected as the version that
  shipped and was wrong in the cheap direction: it refuses a merge for a markdown
  guide. The list names what executes -- `.sql`, `.ts`, `.js`, and the journal
  that decides which of them are considered applied.

- **Let each project declare its guard from scratch, with no default.** Rejected:
  a guard nobody configured is a guard nobody has, and the projects most likely
  to skip the configuration are the ones with the least reason to trust their own
  merges.

## Reversal cost

Low. `mergeBlocks` is one input to a pure function; changing the default list, or
pointing it back at `ownership.sequential`, is an edit with no state to unwind
and no migration. What would not be free is the drift the two lists accumulate in
the meantime, which a reversal inherits rather than removes.
