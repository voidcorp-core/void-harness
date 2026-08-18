---
schemaVersion: 1
id: "adr:1345e4a3-7d28-467b-b9be-61d06678336e"
createdAt: "2026-08-18T10:49:55.329Z"
title: "The catalogue lives with the assets it describes, not with the graph"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The catalogue lives with the assets it describes, not with the graph

## Context

The catalogue is the harness's inventory of itself: 139 nodes covering skills,
agents, hooks, commands, packs and profiles, each with its description, source
path, size and enforcement configuration. It is generated, never authored, and
it is read by `status`, `doctor`, the cheat sheet renderer, the graph studio and
the graph's own scoring.

It has been living in `packages/harness-graph/`, and three facts say that is the
wrong address.

The graph does not produce it. `packages/cli/src/commands/graph.ts` builds it and
writes it into another package's directory, so a package owns a file it does not
generate. The graph barely reads it either: its single mention in
`state/score.ts` is a comment about what to do when the file is absent.

The mirror script has to know. `packages/cli/scripts/copy-core-assets.mjs`
copies `packages/core/` recursively, then reaches sideways into
`packages/harness-graph/` for three named files. A script that must name another
package to assemble its own assets is describing a misplacement, not a
requirement.

And the naming misleads. A file called the graph's model reads as an artefact of
the graph, which is why it was easy to assume the graph was its owner and hard to
see that half the harness depends on it.

## Decision

The catalogue lives in `packages/core/data/`, alongside the assets it describes.

## Consequences

Positive:

- The special case disappears. `core/data/` is copied by the same recursive copy
  as every other core directory, so the mirror script stops reaching into a
  package it has no business reading.
- Ownership matches production. The catalogue describes core's assets and the
  packs', and it now sits with them, next to `core/graph/void-graph.mjs`, which
  is already a generated artefact hosted in core.
- The graph becomes one consumer among several rather than the apparent owner,
  which is what it always was in fact.

Negative:

- Roughly twenty-seven references outside tests move, plus tests, the CI gates,
  the pre-commit regeneration list and the architecture document. None of it is
  subtle, but it is a wide diff for a change that alters no behaviour.
- Immutable decision records and historical plans keep citing the previous path.
  They are history and read as written, so the repository will hold two addresses
  for one file, with only the live surfaces pointing at the real one.

## Alternatives considered

- **A dedicated `packages/catalog/`.** Rejected: the doctrine forbids
  micro-packages, and a package whose entire content is three generated JSON
  files buys nothing a directory does not. It would add a manifest, a build
  target and a dependency edge to move bytes that no code compiles.
- **Leave it and re-export from a neutral module.** Rejected: an indirection that
  hides a misplacement costs a reader one more hop and leaves the mirror script's
  sideways reach exactly where it is. The problem is the address, and an alias is
  not a move.
- **Move it into the CLI, which builds it.** Rejected: the CLI is the writer, not
  the subject. Putting the inventory of core's assets inside the tool that reads
  them would make `packages/core` unable to describe itself, and the consumer
  tarball already ships the data as core assets.

## Reversal cost

Low. The move is a rename plus path updates, with no schema, no format and no
behaviour change; git carries the history across, and the gates that already
refuse a stale catalogue would equally refuse a half-moved one.
