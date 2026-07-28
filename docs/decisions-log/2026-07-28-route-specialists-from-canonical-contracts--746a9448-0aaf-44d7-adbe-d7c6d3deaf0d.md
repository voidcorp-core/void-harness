---
schemaVersion: 1
id: "adr:746a9448-0aaf-44d7-adbe-d7c6d3deaf0d"
createdAt: "2026-07-28T10:01:49.923Z"
title: "Route specialists from canonical contracts"
status: accepted
deciders: ["voidcorp"]
supersedes: []
---

# Route specialists from canonical contracts

## Context

The native specialist contract catalog is extensible, but mission planning and review orchestration were limited to three hard-coded role ids. Adding the remaining v3 specialists through another registry would create split-brain routing, inconsistent direct and orchestrated behavior, and false-green completion when context or runtime evidence is unavailable.

## Decision

Load the canonical specialist YAML catalog into mission planning, evaluate every contract with deterministic ticket, diff, stack, policy, and profile evidence, and drive orchestration from applicable decisions, declared invocation stages, and exact contract versions. Baseline QA and Security policies select their accountable specialists. The controller requires an effective runtime-capability result rather than trusting a runtime name, and direct plus orchestrated invocation share one strict completion parser.

## Consequences

Positive:

- One catalog governs Claude and Codex compilation, direct invocation, applicability proof, orchestration, health checks, and behavioral routing evaluation.
- Every `not-applicable` and `degraded` decision is replayable through predicate id, inputs, reason, input hash, and classifier version.
- Pre-implementation approvals cannot be reused as post-implementation reviews, stage-specific hashes keep their snapshots distinct, and no lead-writer implementation starts before applicable upstream roles pass.
- Runtime attribution and event sequence boundaries prevent writer-authored or pre-implementation evidence from impersonating downstream review.
- Missing context, current-input hashes, contract versions, or required tooling fails closed instead of producing completion.

Negative:

- Mission plans move to schema version 2, grow by one bounded decision per specialist, and callers must provide per-stage input hashes plus the capability emitted by runtime inspection for every applicable role.
- Adding a specialist requires a contract, sources, audit, generated native assets, and routing evaluation.

## Alternatives considered

- Keep the three-role switch and add more branches: rejected because every new role would require synchronized code edits across planning, orchestration, health, and eval paths.
- Add a second orchestration-only role registry: rejected because direct/native invocation and mission routing could diverge.
- Invoke every role on every mission: rejected for cost, latency, responsibility overlap, and irrelevant-tool pressure such as PDF engines on non-PDF work.

## Reversal cost

Medium. The plan field and routing reducer are additive, but persisted plan consumers and orchestration callers would need a compatibility migration to return to fixed role switches.
