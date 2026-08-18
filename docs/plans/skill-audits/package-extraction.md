---
skill: package-extraction
pack: harness-monorepo
status: shipped
strategy: native
target_loc: 200
audit_date: 2026-06-01
---

# Audit: harness-monorepo:package-extraction

**Need.** "Extract into a package" is the most common premature optimization in monorepos. Without a gate, devs extract speculatively → boundary thrashing, wrong abstraction, hairball deps. The 3-question gate forces honesty before the boundary cost is paid.

**Wins.** Explicit "NOT to extract" examples (single-app helpers, type-only sharing) catch 80% of the bad-faith extraction cases. Reverse-extract section legitimizes undoing a wrong call.

**Loses to.** Already-extracted code (use `harness-monorepo:service-package` to create properly; this skill is the decision gate, not the implementation).

**Composes with.** `harness-monorepo:service-package` (the implementation once decision is YES). `harness-monorepo:adr-workflow` (extractions are ADR-worthy). `harness-monorepo:dependency-direction` (extracted packages must respect direction).

**Why not in core.** The 3-question gate is monorepo-specific. Single-app code reorganization doesn't have the same trade-off.
