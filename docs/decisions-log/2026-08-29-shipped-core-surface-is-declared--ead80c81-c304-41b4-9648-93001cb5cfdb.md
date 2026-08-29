---
schemaVersion: 1
id: "adr:ead80c81-c304-41b4-9648-93001cb5cfdb"
createdAt: "2026-08-29T12:22:48.590Z"
title: "What ships in the tarball is declared, and an undeclared directory fails the build"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# What ships in the tarball is declared, and an undeclared directory fails the build

## Context

`copy-core-assets.mjs` copies `packages/core/` into the published package with a
blind recursive copy and two exclusions: `.test.ts` files, and the graph
directory. Nothing else is declared, so anything anyone puts under
`packages/core/` rides the npm tarball from that moment on, read or not, and
nothing ever asks whether it should.

That is how `packages/core/workflows/` survived. Two YAML descriptors, dead for
long enough that the only reference to the first is a test asserting the
`void-implement` skill must NOT route through it, and the only reference to the
second is a dated plan describing when it was written. No code globs that
directory; the `workflows/` lookups that do exist all read inside a skill, where
the live `autopilot.workflow.js` sits.

A full sweep of `packages/core/` found exactly those two. Every other top-level
directory has a reader: `adapters`, `templates`, `policies` and `codex` are named
by code, and `modules` is empty but copied by `install`. So the accumulation is
slow, which is precisely why nobody catches it by looking.

The cost is not theoretical. The published package sits at 819 kB against an
850 kB ceiling, and dead weight there is paid by every consumer on every install.

## Decision

The set of `packages/core/` entries that ship is declared in the copier, and an
entry that is present but undeclared fails the build. Adding something to the
published surface becomes a deliberate act, and `packages/core/workflows/` is
deleted.

## Consequences

Positive:

- Dead weight cannot accumulate silently any more. The failure arrives at the
  moment someone adds a directory, when the reason is still known, instead of
  years later when only an archaeologist can tell whether it matters.
- The published surface becomes readable. The declaration is the answer to "what
  does a consumer actually receive", which previously required reading a copy
  filter and inferring the rest.
- It matches how this repository already keeps other sets honest: `derive`
  regenerates and asserts the tree is unchanged, and skill references are proven
  to resolve. Declaring the set and failing on drift is the same shape.

Negative:

- One more list to update when the surface legitimately grows. Accepted: that is
  the entire point, and the failure message says what to do.
- The check knows what ships, not what is read. A declared directory that
  everybody forgot still ships. This narrows the class rather than closing it,
  and pretending otherwise would be worse than saying so.

## Alternatives considered

- **Delete the two files and move on.** Rejected: it fixes the instance and
  leaves the mechanism that produced it, so the next dormant directory arrives
  the same way and is found the same way, by accident.

- **Detect unreachable assets automatically**, by tracing references from code,
  tests and docs. Rejected: reachability heuristics are wrong in both directions
  here. Templates, `.source` files and doctrine are legitimately never imported,
  and a string built at runtime is invisible to a grep. A gate that cries wolf is
  a gate people learn to bypass.

- **Ship only what the install manifest stages.** Rejected: it would be a real
  invariant, and it is not true today. Doctrine and profiles are read from the
  package without being staged into a project, so this would delete working
  behaviour to satisfy a rule.

## Reversal cost

Low. The declaration lives in one script; removing the assertion restores the
previous blind copy with no migration. Restoring the deleted descriptors is a
`git revert`, and nothing referenced them.
