---
title: Consumer versions must not inherit the harness toolchain ceiling
date: 2026-09-10
status: approved
author: folpe + Codex
related: [DEV-743]
---

# Consumer version compatibility

## Problem and evidence

DEV-743 uses TypeScript 7.0.2. The core TypeScript profile declares versions
below 7, so `assessProfileFreshness` reports `version-uncovered`. Profile routing
makes the profile degraded and `missionContext` makes the entire mission
context degraded. This refuses dispatch even when no compiler API is required.
The meta-repository's development dependencies are not a consumer contract.

A separate real limitation exists: graph extraction uses the classic compiler
API and currently supports TypeScript 5. Microsoft states that TypeScript 7.0
ships without that API. Making the mission profile applicable must not certify
that graph extraction works.

## Outcome

A consumer version unknown to the harness does not by itself prohibit unrelated
work. Required evidence remains required. An absent or incompatible capability
blocks the operation requiring it and its dependants, with a concrete reason.
No universal claim that arbitrary future tools or stacks are supported is made.

## Chosen approach

Separate three responsibilities:

1. General engineering invariants apply independently of package versions.
   Strict typing, input validation and dependency review are examples. A profile
   may explicitly declare this scope only when every recommendation it carries
   is independent of a version-specific API or option.
2. Version-dependent guidance carries a reviewed range. Outside that range,
   the guidance is unavailable pending source review; it must not be presented
   as current. A general invariant is never silently promoted into specific
   configuration advice. Expired reviews and incomplete detection remain visible.
3. Technical capabilities have explicit prerequisites and evidence. Use the
   consumer's configured tools, not a compiler bundled by the meta-project.
   A required check that is absent, fails, times out or cannot be interpreted
   blocks verification. Optional analysis may report unavailable, identifying
   exactly which result it cannot supply.

A passing version probe or presence of API members alone cannot prove semantic
compatibility. Existing adapter limits remain until behavioral conformance
against the consumer tool demonstrates their contract.

## Bounded first implementation

- Introduce an explicit distinction between version-independent profile guidance
  and guidance restricted to reviewed versions. Preserve existing restricted
  profiles' behavior by default and reject contradictory declarations.
- Audit the nine shipped profiles; classify only advice justified by its actual
  contents. Split version-specific advice from general invariants where needed.
  Do not remove all upper version bounds indiscriminately.
- Make mission routing depend on applicable, trustworthy guidance and the proof
  required by the task. An optional unavailable recommendation must not poison
  the entire mission. A required unavailable proof must still block.
- Identify guidance awaiting source review in the plan and specialist context.
  Proceed without that advice only when the task does not depend on it. A task
  changing version-specific configuration or using an unsupported API must
  obtain reviewed evidence through an existing proof path, or remain blocked;
  prose stating compatibility is not a substitute.
- Preserve the graph extractor's independent compiler/API guard. Document that
  TypeScript 7 mission support does not mean classic compiler API support.
- Preserve existing frozen mission hashes and freshness checks. Existing missions
  are restarted after a profile update; no in-place alteration of their proof.
- Document the consumer update/restart path. Merge to develop is not publication
  or installation in a consumer; no consumer configuration is changed here.

## Security and reliability

No automatic package install, downgrade, dependency rewrite or lockfile edit.
No generic execution of commands suggested by package metadata or external text.
No weakening of secret protections, required tests, isolation or merge gates.
No fallback to the meta-project's compiler. No successful certification based on
an unknown, skipped or failed mandatory check. Evidence must name the actual
consumer tool/version and be fresh for the reviewed inputs.

## Alternatives considered

- Extend TypeScript's range to below 8: fixes today's profile rejection but
  recreates it at the next major and conflates advice with adapter support.
- Ignore all version bounds and degraded states: simpler but unsafe; stale advice
  and missing technical evidence could be certified as valid.
- Build a universal dynamic adapter/probe framework now: larger than the incident,
  and a shallow probe cannot prove arbitrary compiler semantics. Reuse existing
  capability and proof boundaries; add adapters only for a demonstrated need.

## Acceptance and tests

Strict test-first development for routing and validation changes.

- A consumer with TypeScript 7.0.2 can dispatch a mission requiring only general
  TypeScript guidance. A future/unknown version exercises the same distinction.
- A version-specific recommendation outside its range is named as unavailable,
  never silently used; work depending on it cannot be verified without evidence.
- A required failed typecheck still blocks, even with an applicable profile.
- Missing classic compiler API keeps graph analysis explicitly unavailable.
- Mixed workspaces preserve each detected version and do not hide an unsupported
  required capability behind another workspace's supported version.
- Expired guidance, malformed profiles, incomplete detection, stale mission
  hashes and unsupported required capabilities retain explicit failure behavior.
- Bundled/installed profiles and the real mission dispatch path are exercised,
  not only synthetic profile values. Existing version-range tests stay meaningful.
- Repository tests, generated assets, independent review and current green CI
  precede merge. Integration with develop includes PR #344, already merged.

## Sources and boundaries

- `packages/core/profiles/typescript.yaml`
- `packages/mission-engine/src/profile/freshness.ts`
- `packages/mission-engine/src/profile/routing.ts`
- `packages/mission-engine/src/mission/plan.ts`
- `packages/harness-graph/src/project/extractors/compiler-host.ts`
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/

The implementation plan must identify the existing proof owner for each affected
required recommendation before editing its gate. An absent owner is a concrete
implementation blocker to resolve, not permission to turn a failure into a warning.
