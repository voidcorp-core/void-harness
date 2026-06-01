---
date: 2026-06-01
source: solaar (doctor on 7-pack install)
kind: friction
severity: minor
status: shipped (0.3.1)
---

# `doctor` "remote versions" line overflows when many plugins drift

## What I saw

```
✓  remote versions   update available: void 0.1.0 → 0.3.0, void-monorepo 0.1.0 → 0.3.0, void-react 0.1.0 → 0.3.0, void-nextjs 0.1.0 → 0.3.0, void-server 0.1.0 → 0.3.0, void-pwa 0.1.0 → 0.3.0, void-mobile 0.1.0 → 0.3.0
```

One CheckResult.message stuffs all drifted plugins into a single line. Wraps awkwardly at 200+ chars on narrow terminals.

## What would unblock me

When more than 2 plugins drift, summarize:

```
✓  remote versions   7 plugins behind (lockstep) → run `void-harness check` for details
    → fix: /plugin marketplace update (inside Claude Code)
```

The detailed enumeration belongs in `check`, not `doctor`. Doctor's job is "yes/no, anything failing".

## Severity

Minor. Cosmetic. But the asymmetric-banner refactor was specifically about scanning at a glance — a wrapped 200-char line breaks that promise.
