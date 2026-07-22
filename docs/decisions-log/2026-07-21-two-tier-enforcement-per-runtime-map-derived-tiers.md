---
date: 2026-07-21
title: "enforcement is a two-tier, per-runtime capability attribute with derived inline tiers"
---

## 2026-07-21: enforcement is a two-tier, per-runtime capability attribute with derived inline tiers

Phase A step A2 (spec `docs/specs/2026-07-21-void-harness-public-multiruntime-os.md`, Fork 1) makes
**enforcement** a structured, per-runtime field of the capability contract rather than a single global
flag. Each capability declares:

```yaml
enforcement:
  floor: ci            # runtime-agnostic CI floor (the void-enforce Action) — every runtime inherits it
  inline:              # deep in-session enforcement, per runtime
    claude: pretooluse # blocking PreToolUse hook where the runtime supports it
    codex: pretooluse
    hermes: ci-only    # structural limit, declared not hidden
```

The credible alternative was a single boolean/enum "is this skill enforced?". Rejected: it cannot
express that the *same* capability enforces deeply in-session on Claude/Codex but only at the CI floor
on a runtime (Hermes) that has no PreToolUse equivalent. Collapsing that to one value would either
overstate Hermes' guarantees or understate Claude's. The two-tier split (floor everywhere + inline
per runtime) is the honest shape, and it lets the score reward a runtime on its own ceiling — Hermes'
`ci-only` is not a failure, so it never caps the global score (spec Fork 6).

The `inline.{claude,codex}` tier is **derived, not hand-classified**: the A2 backfill reads the
existing `enforces` edges in `model.json` (hook → skill) and assigns `pretooluse` to the 16 skills
that are the target of one, `active` to the rest. Deriving from the real hook wiring means the tier
map cannot silently drift from what the hooks actually do — the same source of truth the graph
already trusts.

Why: the promise of a portable harness is only credible if enforcement is expressed per runtime and
never masked. A capability that claims uniform enforcement across runtimes that cannot deliver it is
exactly the dishonesty the five-state model exists to prevent. Encoding enforcement as a derived,
per-runtime contract keeps the portability and enforcement score dimensions from lying about each
other (they were otherwise mutually capping — see the spec's Fork 1/Fork 6 resolution).
