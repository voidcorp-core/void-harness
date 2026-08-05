---
schemaVersion: 1
id: "adr:3a207cdb-2435-4e11-9ae7-34d160f394fd"
createdAt: "2026-08-05T15:25:20.686Z"
title: "ProjectGraph queries answer for the current identity, and answer on a partial graph while saying so"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# ProjectGraph queries answer for the current identity, and answer on a partial graph while saying so

## Context

The seven ProjectGraph queries (DEV-439) are asked by agents mid-task, from paths that arrive out of
a diff, a stack trace, or a note written before the last refactor. Two of those situations produce an
answer that is technically defensible and practically dangerous.

The first is a rename. The extractor records Git-proven lineage as a `previous-id` edge from the
retired path to its successor. A query seeded on the retired path finds a node with no dependents, so
the literal answer is an empty impact — which a caller reads as "nothing depends on this, it is safe
to change". It is never true of a file that merely moved.

The second is an incomplete build. Extraction reports `partial` or `degraded` when it skipped
anything at all: on this repository, 4 oversized files and 3 unparseable sources out of 3,268
scanned. The cache is only published on a `fresh` build, so a project with a single generated
artifact over the byte budget is permanently partial. Any answer computed there is a lower bound.

## Decision

A query answers for the identity a path currently has — lineage is followed forward from a retired
path in `impact`, `ownersOf`, and `testsFor` — and a query over a non-fresh graph returns the answer
it does have, together with an explicit source fallback naming the count, codes, and paths that
extraction left out.

## Consequences

Positive:

- The failure mode that silently under-reports (renamed path reads as unused) is closed, and the
  successor is named so the caller learns the file moved.
- A caller can size the gap: "7 paths not extracted (4 oversized-file, 3 invalid-source)" is
  judgeable, where "partial" alone forces a choice between distrusting a good graph and trusting an
  empty one.
- The bounded answer stays useful in the common case where the gap is unrelated to the question.

Negative:

- `impact` on a retired path includes the successor, which is the same file rather than a dependent.
  Reporting it is deliberate — it is how the caller learns the rename — but it makes `impacted` not
  purely "other nodes affected".
- Lineage is traversed inside `ownersOf`/`testsFor`, which cost an extra bounded walk per call.
- A caller who ignores the fallback line acts on a lower bound believing it complete. The surface
  makes that visible; it cannot make it impossible.

## Alternatives considered

- **Answer `unknown` for a retired path.** Honest and cheap, and it was the behavior before this
  decision. Rejected because the caller then has to discover the rename by hand exactly when it is
  least able to: the useful answer exists in the graph and withholding it buys nothing.
- **Follow lineage in `impact` only.** Rejected as an inconsistency with no defensible boundary:
  `testsFor` on a renamed path returning `unknown` while `impact` answers means the same identity
  question gets two different theories of what the path means.
- **Refuse to answer on a partial graph.** Rejected because it is not safer. It converts a labelled
  lower bound into no information, on projects that are permanently partial for reasons unrelated to
  the question asked, and it would push callers to bypass the surface entirely.
- **Report `partial` without naming the gap.** Rejected: unusable. Seven skipped files and a build
  that saw nothing render identically, so the caller either distrusts a good graph or trusts an
  empty one.

## Reversal cost

Low. Lineage traversal is one function (`lineageOf` in `query.ts`) consumed by three call sites, and
the fallback is one string computed in `project-graph-store.ts`. Removing either narrows what the
answers cover without changing their shape, and the corpus tests state the expected behavior
explicitly enough that a reversal is a deliberate edit rather than a silent drift.
