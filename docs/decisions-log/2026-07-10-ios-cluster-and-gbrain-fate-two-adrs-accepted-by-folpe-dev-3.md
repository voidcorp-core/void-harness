---
date: 2026-07-10
title: "iOS cluster and gbrain fate — two ADRs, accepted by Folpe (DEV-392)"
---

## 2026-07-10: iOS cluster and gbrain fate — two ADRs, accepted by Folpe (DEV-392)

De-gstackification Vague 5 (epic DEV-383). Two gstack pieces escape the vendoring and need an explicit call
rather than a default port. Both are formal ADRs (the first in this repo's new `decisions/` directory). They
were authored **proposed** — HITL absolute, NOT auto-accepted — and are now **accepted** by Folpe's explicit
go-ahead to merge (in the ADR lifecycle, merging = accepting; status flipped to `accepted` in the same act):

- **[ADR-0001](../decisions/0001-defer-ios-cluster-port.md) — Defer porting the iOS cluster.** No current iOS
  consumer; deferral is the reversible default. Wake trigger: the first signed iOS project. Teardown coupling:
  Vague 6 must snapshot the iOS source before removing gstack, not delete it.
- **[ADR-0002](../decisions/0002-keep-gbrain-external.md) — Keep gbrain external, with an exit criterion.** Its
  cross-session context handoff is a real recurring need (served today by Claude file-memory + Linear +
  DECISIONS + ADRs); dropping it before a proven replacement would strand that need. Exit criterion: both the
  handoff AND code-search are demonstrably covered by harness primitives. Out of scope for the Vague 6 teardown.

Why ADRs and not just a DECISIONS line: both are strategic keep/drop calls with reversal triggers and a lifecycle
(they may be superseded), which is exactly what the ADR format is for — distinct from this running log. This entry
is the pointer the meta-rule requires; the ADRs are the record.
