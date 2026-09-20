---
title: Seven explicitly requested tickets, audit optimization first
date: 2026-09-16
status: approved
ticket: DEV-844
spec: docs/specs/2026-09-16-test-cost-optimization.md
---

# Coordinated seven-ticket delivery

Folpe explicitly requested DEV-844 first, plus DEV-531, DEV-611, DEV-630, DEV-682,
DEV-662 and DEV-635, one implementing agent per ticket returning to the coordinator.
This expands the earlier bounded six-ticket programme; DEV-610 and DEV-645 are already
Done and are not reopened. Complete provider-native tickets remain authoritative.
This plan records boundaries and ordering, never mutable progress.

## Execution contract

Every worker runs void-implement in its own branch/worktree, with one lead writer
retained for corrections. At most two writers plus one fresh reviewer run concurrently
under this session's four-agent capacity. The audit worker starts first. Other workers
may analyze disjoint tickets while it measures; no concurrent heavy test/build campaign.
All checks run serially through cockpit RUN and are attributed to a worktree and SHA.
The coordinator owns the queue, tracker, integration, published PR and final verification.
Workers never push, merge, alter tracker progress or touch shared Git refs/config/stash.

## Ownership and sequencing

| Ticket | Owned source boundary | Delivery constraint |
| --- | --- | --- |
| DEV-844 | audited test files, fixture helpers, classification, measurement report | First; owns CLI test optimization before DEV-662 |
| DEV-531 | interface-motion skill, frontend-motion guidance, tests, decisions and audit | Resume preserved work; actual canonical visual applicability proof remains required |
| DEV-611 | knowledge-hook CLI/adapter, project-knowledge, bounded graph performance work only when justified | Resume preserved dirty work; keep real failure measurements and performance gates |
| DEV-630 | freshness notice and its tests, session guidance | Existing option 1 approved; real-session evidence required |
| DEV-682 | void-learn section routing, doctrine format, contract tests and superseding decision | Existing explicit semantic routing approved; never edit accepted ADR in place |
| DEV-662 | hook runner loading/dispatch and exact shipped benchmark | After DEV-844 on overlapping CLI/tests; profiling precedes minimal implementation |
| DEV-635 | five manually authored agent contracts, precise tool capabilities, tests and decision | Establish actual Bash needs; no unsupported read-only promise or broken review capability |

Each worker declares exact paths and any widening before edits. Generated mirrors,
catalogues, bundles and reference registers are regenerated from integrated sources
by the coordinator, never resolved by choosing a side. If a worker needs generated
assets for a proof, its isolated copies are evidence only until integration regenerates.

## Recovery and gates

Reuse DEV-531 and DEV-611 worktrees and commits from the previous run. Preserve DEV-611's
uncommitted files byte-for-byte before updating its base. Old mission histories and
failed measurements are immutable evidence; never rewrite them into successful runs.
DEV-843 is merged but its remaining real DEV-531 certification obligation must be
resolved before claiming DEV-531 unblocked. A source-only reviewer is not an installed
canonical specialist. Surface actual runtime limitations rather than forging completions.

Review each unit through void-implement, integrate sequentially, regenerate shared
artifacts once per composed revision, run the full required suite and read the whole
integrated diff in a fresh context. Publish review evidence and any unresolved limits.
No automatic production promotion, npm release or consumer installation is authorized.
Linear receives operational summaries and links; detailed evidence stays in the repo.
