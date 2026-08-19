---
schemaVersion: 1
id: "adr:5992e7d8-9e81-483e-91e2-55ba2fc3a242"
createdAt: "2026-08-19T14:50:50.668Z"
title: "update preserves the source repo doctrine instead of refusing"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# update preserves the source repo doctrine instead of refusing

## Context

`update` calls `init` to recompile the assets it owns. `init` refuses to run on the void-harness
source repo, because there the doctrine documents are the original rather than a copy of it: the
packaged block is necessarily behind the source that produced it. The refusal was implemented as
`process.exit(2)`, which killed the whole `update` **after** it had already migrated the layout
and rewritten the managed ignore block.

Measured on 2026-08-19: `update --dry-run` exits 0, `update` exits 2, and the error names `init`,
a command the operator never typed, without saying what was actually done. Someone reading it
concludes that updating is broken, and stops updating.

Three facts bound the problem. The doctrine write is block-delimited and idempotent: a forced
`init` on a consumer project with hand-written rules leaves `CLAUDE.md` byte-identical, verified.
Consumer projects never see the refusal at all: `update` there exits 0 and preserves
`PROJECT-DOCTRINE.md`, verified on a fresh install. And the one genuine risk in the source repo is
narrow: the packaged block differs from the canonical one by a single line today, the very
namespace fix that a recent change removed.

## Decision

`update` recompiles everything it owns on the source repo and preserves only the canonical
doctrine documents, reporting `preserved` for each, and exits 0.

## Consequences

Positive:

- A routine command finishes its job and reports it honestly, on every project including this one.
- The bundled hook, the runtime wiring and the layout migration reach the source repo, which
  previously required doing it by hand.
- The failure code returns to meaning failure.

Negative:

- One more internal flag on the `init` surface, `--preserve-doctrine`, which no user types.
- The source repo's doctrine now drifts from the packaged block until the next publication. That
  drift is visible by design rather than resolved by overwriting the newer file with the older.

## Alternatives considered

- **Keep refusing, improve the message.** Rejected: the message was only the symptom. The command
  would still end in error after doing half the work, and the operator would still finish the job
  by hand.
- **Let `init` overwrite the doctrine on the source repo.** Rejected: today it would reinstate a
  namespaced skill reference that was deliberately removed. Overwriting a newer canonical file
  with an older packaged copy is a regression whatever the mechanism.
- **Detect drift and prompt.** Rejected: an interactive question in a command that runs in CI and
  in scripts trades one dead end for another.

## Reversal cost

Low. The behaviour is one pure function, `sourceRepoVerdict`, plus a flag that `update` sets from
`isHarnessSourceRepo`. Removing it restores the previous refusal in a single commit.
