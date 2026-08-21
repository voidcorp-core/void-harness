---
schemaVersion: 1
id: "adr:071cd076-2fcc-4312-9fe0-b6a7f0a4ba33"
createdAt: "2026-08-21T10:37:34.883Z"
title: "A co-owned file carrying project edits is reported as such, not as manifest drift"
status: accepted
deciders: []
supersedes: []
---

# A co-owned file carrying project edits is reported as such, not as manifest drift

## Context

`.void/install-manifest.json` records a sha256 for every file an install writes,
so another checkout can restore the same bytes and prove it. Two ownership classes
sit in that list and had been treated alike.

A **managed** asset is the harness's alone. `update` recompiles it, and the
install transaction refuses to overwrite one edited by hand. Bytes differing from
the manifest there is exactly the drift the hash exists to catch: the working tree
claims a version it does not hold.

A **co-owned** file is the opposite arrangement. `.void/PROJECT-DOCTRINE.md` is
created once from a template, is never overwritten by a later `init`, and the
template's own first lines tell the reader the file is theirs to edit. `CLAUDE.md`,
`AGENTS.md`, `.gitignore`, `.claude/settings.json` and `.void/config.json` carry a
harness-owned block inside a document the project also writes.

Their hashes therefore stop matching the moment anyone uses them as intended. The
observed consequence: writing one project rule made `doctor` print
`x void manifest 1 file(s) differ from manifest 3.3.0` and exit non-zero, with the
remedy `npx voidharness@3.3.0 hydrate`. That remedy is misleading twice over --
nothing there needs restoring, and `hydrate` in fact re-stamps the manifest hash
over what the project wrote, after which the check goes green. So the end state was
correct and the path to it lied: a red check on normal work, pointing at a
restoration that never happened.

A red verdict nobody can extinguish is a red verdict everybody learns to skip past,
carrying the real findings down with it. This repository has already paid that
cost once, in the invocation check that reported skills it never shipped.

## Decision

Co-owned files stay in the manifest, and `verifyInstallManifest` reports a
co-owned file whose bytes differ as `coEdited` rather than `mismatched`, excluded
from `ok`. `doctor` passes and names the count; `hydrate` names the paths on its
proof line. A co-owned file that is MISSING is still drift: co-ownership licences
writing into the file, never removing it.

The list of co-owned paths moves to `packages/cli/src/lib/co-owned.ts`, a module
importing nothing, because the install composes its stage from it and the manifest
verification reads it -- opposite sides of a dependency edge that would otherwise
each keep a copy.

## Consequences

Positive:

- `doctor` exits zero after the intended use of `.void/PROJECT-DOCTRINE.md`.
- The manifest keeps recording what the install wrote for these paths, so a fresh
  checkout still restores a starting point rather than nothing.
- The verdict says something true and specific -- "N co-owned file(s) carry project
  edits" -- instead of either a silent pass or a failure.

Negative:

- The manifest no longer proves the BYTES of a co-owned file across checkouts. It
  proves the path exists and records what was last written there. Two checkouts can
  hold different `CLAUDE.md` content with the check green, which is the honest
  description of a file two parties write.
- One more concept in the ownership model. `co-owned.ts` carries it in one place,
  and the class already existed implicitly as `SHARED_FILES`.

## Alternatives considered

- **Remove co-owned files from the manifest entirely.** Simplest, and rejected:
  the manifest would lose the record of what the install originally wrote for those
  paths, so `hydrate` on a fresh clone would have no starting content for
  `.void/PROJECT-DOCTRINE.md` and no way to notice its deletion.
- **Leave the failure and let `hydrate` re-stamp.** The status quo. Rejected: it
  fails a check on normal work and names a remedy that describes something other
  than what it does.
- **Downgrade the whole manifest check to an advisory.** Rejected: real drift on a
  managed asset is a genuine failure -- an asset silently holding another version's
  bytes -- and blunting it to clear a false positive loses the finding that matters.
- **Compare only the harness's marked block in each co-owned file.** Attractive and
  rejected as unaffordable: it needs a per-file parser for six different formats
  (markdown blocks, JSON, gitignore), and a block that fails to parse would report
  drift for a reason nobody could act on.

## Reversal cost

Low. The split is one branch in `verifyInstallManifest` and two rendering sites;
removing it restores the previous behaviour, and the manifest format is unchanged.
