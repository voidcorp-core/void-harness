---
schemaVersion: 1
id: "adr:79090ead-07d5-4dc3-8046-4a2089b9a966"
createdAt: "2026-08-29T19:46:15.536Z"
title: "force answers a managed conflict and never seizes a co-owned file"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# force answers a managed conflict and never seizes a co-owned file

## Context

`co-owned.ts` already draws the line the install runs on. A **managed** asset is
the harness's alone: `update` recompiles it, and the transaction refuses to
overwrite one it cannot prove it wrote, because the edit belongs to somebody. A
**co-owned** file is the opposite arrangement: the harness owns exactly its
marked block and the project owns every other line, so an edit outside the block
is the file being used as intended, not damage.

`--force` exists to answer the first case, and only ever the first: a managed
asset whose bytes the receipt cannot vouch for. The error message that offers it
names the conflicting paths.

Two places read the flag without ever asking which regime the file belongs to.
`writeConfig` treated it as licence to replace `.void/config.json` outright, and
`sourceRepoVerdict` read it before `preserveDoctrine`, so it cancelled the
protection on the canonical doctrine docs.

On 2026-08-29 that cost this repo its enforcement floor. `update` refused on two
hook files and printed its own remedy; `--force` unblocked those two and, on the
way past, rewrote `paths.business` from `["apps/*/src/**", "packages/*/src/**"]`
to `"apps/*/src/**"` and reverted `CLAUDE.md` and `AGENTS.md` to an earlier
wording. Nothing went red: the config stayed valid, it just named a directory
holding no code, so `no-any`, `no-console`, the TDD ordering and the secret
checks stopped covering the whole monorepo without a word.

Reproduced on a fresh consumer fixture with no meta shape at all. A monorepo
that tuned its paths -- the normal case -- loses its floor over its entire
codebase, on a command the harness told it to run.

## Decision

`--force` lifts ownership on managed assets and never on co-owned files. Where a
co-owned file cannot be reconciled at all, `--force` may still replace it, and
the overwrite is named in the output before it happens.

Realized as two pure verdicts. `configWriteVerdict` merges into any config that
parses, whatever the flag says, and keeps `--force` for the one case where
merging is impossible: a config too broken to read. `sourceRepoVerdict` reads
`preserveDoctrine` ahead of `force`, because the two answer different people --
`preserveDoctrine` is what `update` declares about the repo it runs in, `--force`
is what an operator types about a conflict somewhere else entirely.

## Consequences

Positive:

- A project that tuned its paths keeps them, so the enforcement floor survives
  the command the harness itself suggests.
- `--force` recovers a precise meaning, and the operator can use it for the
  conflict it was printed for without wondering what else travels with it.
- The regime distinction is now load-bearing in code rather than only in prose,
  and an end-to-end test asserts it against `CO_OWNED_FILES` itself, so a future
  path that starts seizing a co-owned file fails in CI and not in a repo.

Negative:

- `--force` no longer resets a valid but unwanted config; that now takes deleting
  the file first. Accepted: a reset is rare and explicit, a silent loss is not.
- Reading the config before deciding costs one parse on a path that previously
  short-circuited. Immaterial next to an install.

## Alternatives considered

- **Keep `--force` seizing everything, but list the co-owned files first.**
  Rejected: the operator reaches the list while answering a conflict about two
  unrelated hooks, and a warning read in that frame is a warning read past. It
  also leaves the loss one hasty confirmation away, when nothing about the
  conflict ever justified touching the config.
- **Scope `--force` to the exact paths named in the conflict message** (the
  ticket's first lead). Genuinely attractive, and compatible with this decision
  rather than opposed to it: it narrows the flag *within* the managed regime.
  Rejected here as insufficient on its own -- it turns on threading conflict
  paths through the install, while the defect is answered completely by asking
  which regime a file belongs to, which the codebase already knew.
- **Give the overwrite its own second flag** (`--force --replace-config`).
  Rejected: a flag whose only job is to re-enable a loss nobody asked for is a
  worse version of deleting the file, and it grows the surface to describe.

## Reversal cost

Low. Both verdicts are pure functions with their own tests, and restoring the old
behavior is reordering two conditions. The cost of the reversal is not the code
but the loss it re-enables.
