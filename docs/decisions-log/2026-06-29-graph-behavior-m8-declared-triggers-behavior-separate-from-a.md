---
date: 2026-06-29
title: "graph behavior (M8) -- declared triggers, behavior separate from analyze, advisory only"
---

## 2026-06-29: graph behavior (M8) -- declared triggers, behavior separate from analyze, advisory only

Context: M8 turns the accumulated activation log (M6) into "which components never
fire" (dead-node) and "which skills should have fired but did not"
(should-have-fired). Spec: `docs/specs/2026-06-29-graph-behavior-m8.md`.

Decision 1 -- skills declare machine-readable `triggers` (`globs` / `extensions` /
`tools`) in their SKILL.md frontmatter; matching is mechanical and deterministic.
Alternatives rejected: lexical keyword heuristic over the NL `description` (noisy,
non-deterministic relevance) and an LLM/embeddings judge (cost, non-determinism,
off-CI). Declared triggers are opt-in and incremental -- a skill without triggers is
simply excluded from should-have-fired (zero false positives), and the NL-matching
problem becomes a mechanical one.

Decision 2 -- `analyzeBehavior` is a separate pure module (`behavior/`), not another
`analyze` detector. The behavioral data is temporal (per session), unlike the static
model `analyze` consumes. Keeping it separate avoids threading session state through
the static detectors and keeps `graph check`'s CI gate purely structural.

Decision 3 -- advisory only (`severity: info`, never joins `blockingFindings`), with a
volume guard (~3 sessions / ~20 events) so a sparse log does not read as "everything
is dead". dead-hook (wiring vs situations from plugin.json matchers) and semantic
matching are deferred. Matches the spec's "analysis is a signal (HITL); only
broken-route blocks CI".
