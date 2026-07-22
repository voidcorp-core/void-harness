---
date: 2026-07-22
title: "stay on TypeScript 5.9 for now; defer 6 and pilot 7 later"
---

## 2026-07-22: stay on TypeScript 5.9 for now; defer 6 and pilot 7 later

The external audit (2026-07-22) noted PHILOSOPHY.md speaks of "TypeScript 6" while
the repo resolves TypeScript 5.9, and recommended moving to TS 6 now and piloting
the native TS 7 compiler.

Decision: **stay on 5.9** for this cycle. The credible alternative — jump to 6/7
now — was weighed and deferred:

- **TS 7 (the native compiler) is preview**; its full programmatic API (which
  `tsup`, `tsx`, and the vitest transform pipeline depend on) lands in 7.1. A repo
  whose build and test toolchain consume the TS API cannot adopt the native
  compiler wholesale without risking the whole pipeline.
- **TS 6** brings no forcing function for this codebase today; the strict-mode
  features we rely on are already in 5.9.

Plan: bump 5.9 → 6 when 6 is stable and the toolchain follows; treat TS 7 as a
**watch item**, piloting it only for the standalone compile step (not the API),
then migrating fully once the ecosystem is ready. PHILOSOPHY.md's "TypeScript 6"
mention is aspirational, not a current dependency — no change needed there beyond
this record.
