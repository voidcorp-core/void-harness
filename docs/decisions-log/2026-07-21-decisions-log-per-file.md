---
date: 2026-07-21
title: "docs/DECISIONS.md becomes a generated index over one-file-per-decision"
---

## 2026-07-21: docs/DECISIONS.md becomes a generated index over one-file-per-decision

Context: the shared-append tail of `docs/DECISIONS.md` was a recurring conflict in parallel
work — a batch of tickets each appending to the same file collide on the same tail, and the
`backlog-autopilot` skill only mitigated it by protocol (each worker appends its own block, the
reconciliation subagent concatenates). The skill itself named the durable fix ("a per-decision-file
layout, one file + a generated index, like ADRs") but deferred it as an interim.

Decision: split the 74 dated entries into `docs/decisions-log/<YYYY-MM-DD>-<slug>.md` (one file per
decision, each carrying `date`/`title` frontmatter + the verbatim `## DATE: title` body) and make
`docs/DECISIONS.md` a **generated index** rebuilt by `scripts/build-decisions-index.mjs`
(`pnpm decisions:build`), gated against drift by `pnpm decisions:check` in CI. A new decision is a
new file; nothing ever appends to the index, so parallel workers cannot race it. The index sorts
newest-date-first, tiebreak by filename DESC — deterministic and coordination-free (no shared
counter, unlike ADR numbers).

Rejected alternatives. (1) Literal port into `decisions/NNNN-slug.md` (the ADR dir): conflates the
harness's dated dev-log with architecture ADRs, buries the two real ADRs (0001/0002) under 74
entries, forces a global renumber, and rewrites the ~40 files (including a test and the
CLAUDE.md/AGENTS.md meta-rules) that reference `docs/DECISIONS.md` plus every by-date cross-reference.
(2) Do nothing: the concatenation protocol works, but leaves the interim standing. This option keeps
`docs/DECISIONS.md` existing as the generated index, so **all ~40 references stay valid** and by-date
cross-refs resolve unchanged — the migration is invisible to everything downstream. Round-trip
verified: splitting then regenerating preserves every decision line byte-for-byte (only intra-date
order and the added "generated" banner differ). The `adr-workflow` ADRs under `decisions/` are a
separate genre and are untouched.
