---
date: 2026-07-09
title: "activations.jsonl is the single telemetry source; usage.log is retired (issue #70)"
---

## 2026-07-09: activations.jsonl is the single telemetry source; usage.log is retired (issue #70)

The harness had two telemetry writers: the legacy `.void/usage.log` (Skill events only, written
only when jq was present) and the rich `.void/activations.jsonl` (every tool call, with a
pure-bash fallback). `void-harness audit` and `void-graph`'s orphan note read the *poorer* file,
so a project could show skills as "never fired" that had fired plenty. The activation-meter now
writes **only** `activations.jsonl`, and both readers go through one loader
(`graph-io.loadSkillUsage`) that derives skill usage from the jsonl.

The credible alternative was to keep both writers and just have readers merge them. Rejected as
the steady state: two writers is two things that can drift (retention, semantics, the jq-present
gate), which is exactly the bug. Instead the loader merges any *pre-existing* `usage.log` as
read-only transition history (so a consumer's "stale" stats are not reset on upgrade), while new
firings only ever land in the jsonl. Once consumers have rolled a version, `usage.log` decays to
nothing on its own.

Why: one writer + one reader path means the audit and the graph can never disagree about whether a
skill fired. The format itself did not change (the jsonl schema is unchanged); only the number of
sources did, from two to one.
