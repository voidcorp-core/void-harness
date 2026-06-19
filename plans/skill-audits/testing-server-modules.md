---
skill: testing-server-modules
pack: harness-server
status: shipped
strategy: native
target_loc: 90
audit_date: 2026-06-19
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `harness-server:testing-server-modules`

## Need

Issue #17 cluster B / B3. A consumer project's Vitest run crashed on import of any module whose chain reached `server-only` — the package throws at import time outside an RSC graph, which is exactly when a unit test runs. The harness had no guidance for this extremely common Next.js/RSC testing gotcha, so each consumer rediscovered it the hard way (and some worked around it by not testing server modules at all).

## Wins

- Names the real cause (an import-time tripwire, not a normal dependency) so the fix (an empty stub, not a mock) is obvious.
- One shared `vitest.base` alias, not per-file — composes with the monorepo's shared config story.
- The load-bearing distinction: the alias is **test-only**; it must NOT become a way to import server code from client code. The skill refuses to let a test convenience erode the build-time boundary — that framing is the voidcorp-authored value, not in the upstream docs.

## Loses to / out of scope

- Integration/e2e runners that execute in the real runtime — explicitly excluded (the tripwire is meaningful there).
- It does not teach how to architect server/client splits (that is `hexagonal-architecture` / `harness-server:server-action`); it only unblocks testing the modules that already exist.

## Boundaries (no >30% overlap)

- `harness:testing` — how to write a good test (behavior, factories, pristine output). This skill is purely the `server-only` import gotcha + the alias config. No overlap with test *quality*.
- `harness-server:env-validation` — server/edge import-chain discipline for env vars. Adjacent (both about server import chains) but distinct subject (env schema vs test config). Cross-referenced, not duplicated.

## Verification

- [x] SKILL.md ≤ 400 LOC, description ≤ 200 chars, name == folder.
- [x] `.source` present (Next.js + Vitest docs + the consumer-project friction).
- [x] Anti-rules + final rule present.
- [ ] Decision-matrix row added if/when the matrix tracks pack-server testing skills.
