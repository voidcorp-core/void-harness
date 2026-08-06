---
schemaVersion: 1
id: "adr:eb74b522-4442-409f-a5dd-9d18201c08e3"
createdAt: "2026-08-06T08:59:00.638Z"
title: "A build is partial only when its completeness is in doubt, not when one edge is unknowable"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# A build is partial only when its completeness is in doubt, not when one edge is unknowable

## Context

`ProjectGraphBuildState` had one word, `partial`, for three unrelated situations: a file the
extractor could not read, an import whose specifier is not a string literal, and an observation that
was genuinely truncated by a limit. Downstream, `partial` means "do not trust this graph, read the
source" — the fallback the DEV-439 query surface prints.

Measured on this repository on 2026-08-06, that collapsing had three consequences.

A non-literal dynamic import — ordinary lazy loading — was reported as `invalid-source`, the same
code as a file that does not parse, and marked the whole build partial. Two such imports exist here;
one is enough. Any TypeScript project that lazy-loads anything is therefore permanently partial, so
the fallback fires on every query of every project, and a warning that is always on is not a warning.

An advisory build observes the tree twice, and both observations report the same skipped file. The
issue list carried each one twice, which is how "2 oversized files" was published as "4" in the
DEV-439 benchmark README.

Worst, `verifyIndexedProjectFiles` abandoned before comparing anything when the verification scan
produced any issue at all. One oversized generated artifact — this repository has two — switched off
the check that exists to catch a tree mutated during evidence collection, in the default advisory
mode, on every project that has one.

## Decision

Build state is decided only by issues that put the graph's completeness in doubt: an edge that static
analysis cannot determine is reported on the file that holds it, under its own `unresolved-import`
code, and does not degrade the state. A stable per-path exclusion — oversized, binary, symlink,
permission — never abandons verification nor counts as a path-set change, and identical issues are
reported once.

## Consequences

Positive:

- `partial` becomes informative again: it now means the graph may be missing something, which is when
  a caller should act on it.
- The verification that detects a mutated tree actually runs on real repositories.
- The uncertainty a dynamic import creates is not lost. The query surface reports it against the
  files in the answer, so it fires when it bears on the question and stays quiet otherwise — the
  original intent, at a granularity that can be acted on.
- Issue counts can be reasoned about, because a fact observed twice is reported once.

Negative:

- `ProjectFileExtraction` gains a field (`unresolved`), so its shape and every fixture change.
- A caller reading only `state` no longer learns that some edge was unfollowable; it must read the
  issues, or use a surface that does. That is the deliberate trade: the state was carrying a signal
  too coarse to use.
- The stable/unstable split of issue codes is a judgement that must be maintained as codes are added.
  A new code defaults to unstable, which is the safe direction.

## Alternatives considered

- **Leave `partial` as it was.** Rejected on evidence: it made the fallback unconditional on real
  projects, which trains a reader to ignore it, and it left the verification disabled on any
  repository with a large generated artifact.
- **Drop the dynamic-import signal entirely.** Simplest, and wrong: the graph really does not know
  that edge, and a caller reasoning about impact deserves to know. Removing a warning is not the same
  as making it precise.
- **Keep the state coarse and let consumers filter the issues themselves.** Rejected: every consumer
  would reimplement the same classification, and the first one to forget it would silently trust a
  truncated observation.
- **Give an unfollowable edge its own build state between fresh and partial.** Rejected as a third
  word for a reader who already struggles with two; the information belongs on the file, not on the
  build.

## Reversal cost

Low to medium. The classification lives in two named sets (`NON_DEGRADING_ISSUE_CODES`,
`STABLE_SCAN_ISSUE_CODES`) and one extraction field. Reverting means emptying the sets and folding
`unresolved` back into `diagnostics`, which restores the old behaviour exactly — with the old defects.
The cache schema is unaffected, so no stored state has to be migrated either way.
