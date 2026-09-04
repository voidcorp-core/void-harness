---
schemaVersion: 1
status: executing
program: void-machine-foundation
plan: docs/plans/2026-09-04-void-machine-foundation-plan.md
spec: docs/specs/2026-09-04-void-machine-foundation.md
progress:
  provider: linear
  scope: voidcorp/DEV/void harness
  order:
    - DEV-808
    - DEV-809
    - DEV-810
    - DEV-798
    - DEV-811
    - DEV-812
    - DEV-813
    - DEV-820
    - DEV-609
    - DEV-814
    - DEV-706
    - DEV-815
    - DEV-733
    - DEV-734
    - DEV-816
    - DEV-817
    - DEV-818
    - DEV-452
    - DEV-819
    - DEV-453
  states:
    ready: [Backlog, Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done, Canceled]
humanGates: [DEV-813, DEV-818, DEV-453]
autopilot:
  schemaVersion: 1
  enabled: true
  clusterSize: 4
  chainBudget: 6h
  base: develop
  mergeGate: union-reviewed
  deployBranch: main
  verifyCommands:
    - [pnpm, verify]
  ownership:
    sequential:
      - Cargo.lock
      - pnpm-lock.yaml
      - Cargo.toml
      - rust-toolchain.toml
      - deny.toml
      - contracts/machine/**
      - .github/workflows/**
      - docs/decisions-log/**
      - packages/cli/package.json
      - package.json
      - .void/program.md
    reconcileOnly:
      - docs/CHEATSHEET.md
      - docs/SKILL-REFERENCES.md
      - packages/core/data/catalog.v3.json
      - packages/core/graph/void-graph.mjs
      - packages/harness-graph/model.json
      - packages/cli/core-assets/**
---

# Program: Void Machine foundation

This descriptor routes the approved foundation programme. It is durable global context, not a
cursor: Linear owns status, claims, blocker relations, comments and review evidence. This file
never names a current or next unit.

## Reconciliation with the previous programme

The previous `autonomous-until-develop` order contained DEV-677, DEV-673, DEV-665 and DEV-664;
all four are Done. Its remaining design loops were not falsely declared completed: DEV-706,
DEV-733 and DEV-734 were read in full, reconciled into the approved Void Machine plan and now
appear explicitly in this programme. The pointer changed only after Folpe approved the spec,
plan and complete provider-native pool.

## Sources of truth

Before selecting or executing work, read in order:

1. the plan and approved spec named in frontmatter;
2. the complete selected Linear issue, including current relations and comments;
3. the accepted ADRs linked by the plan;
4. `AGENTS.md`, `CLAUDE.md`, project doctrine and the current Git state.

The plan supplies global intent and sequencing. The provider-native issue is the executable unit.
If any summary conflicts with the issue or repository, stop and reconcile the authoritative
record rather than filling the gap from memory.

## Automatic selection and lifecycle

On an unscoped continue/start/resume request, query the declared Linear scope. Resume exactly one
started ordered unit; surface competing started claims; otherwise select the first ready ordered
unit whose native blockers are done. Fetch it again immediately before claiming, assign it and
move it to In Progress, then run `void-implement`.

Keep progress remote and current. A material blocker or scope correction receives a bounded
Linear comment. Verified work moves to In Review with branch, commits, tests, review and exact-SHA
evidence. An issue reaches Done only after its pull request is merged into `develop` and the merged
state is freshly verified. Provider failure stops the action; no local substitute is invented.

## Autonomy and human gates

The autopilot block is explicit consent for bounded in-session execution and for a clean,
freshly union-reviewed integration pull request to merge to `develop`. It grants nothing beyond
that branch. `main` is the deploying branch and remains human-only; tags, releases, production
environments, secrets, irreversible changes and spend outside declared policy are never implied
by this programme.

DEV-813 stops the programme until the same read-only skill is proven through real Codex and Claude
Code subscriptions. DEV-818 stops consumer migration until a real unattended cluster is inspected.
DEV-453 is the publication gate. Automated checks cannot mark any of these gates Done or infer
Folpe's decision.

Parallel execution is allowed only for disjoint declared footprints. Native blocker relations
sequence semantic dependencies; `ownership.sequential` serializes shared authority; only the
reconciler may rebuild `ownership.reconcileOnly`. A missing footprint, unread union review,
inconclusive proof or stale SHA refuses integration.

## Programme completion

Set `status: completed` only after DEV-453 has passed from released artifacts, all ordered units
are Done from evidence on `develop`, the migration bridge and rollback window are documented, and
Folpe explicitly approved publication. Promotion from `develop` to `main` remains a separate human
act after programme completion.
