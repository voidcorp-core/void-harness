---
schemaVersion: 1
id: "adr:cce2c021-ac58-437b-b35f-d2c4fba5890d"
createdAt: "2026-09-15T13:55:21.788Z"
title: "Separate Git topology evidence from discovery deadline enforcement"
status: proposed
deciders: ["Folpe"]
supersedes: []
---

# Separate Git topology evidence from discovery deadline enforcement

## Context

The exceptional-layout test required successful Git discovery within the real
100 ms advisory budget. The accepted telemetry identity decision allows refusal
when this budget cannot establish identity. A full verification run returned
unavailable for a submodule worker; its exact original cause was not recorded.
A controlled expired clock reproduces the mismatch between the topology proof
and the permitted deadline refusal.

## Decision

Inject the Git observation function at the telemetry resolver boundary so the
layout test can read real Git topology independently of discovery timing.
Production keeps the default executor and its shared 100 ms deadline unchanged.
The existing deadline test separately proves refusal with that default executor.

## Consequences

Positive:

- Exact assertions still prove submodule and separate-directory semantics.
- A clock advancing past the budget detects any missed query injection.
- No installed source bundle replaces the published safety floor.

Negative:

- The fixture executor duplicates a small bounded subprocess adapter.
- Layout evidence does not certify availability under scheduler contention.

## Alternatives considered

- Increase the production budget or retry the suite: rejected because a passing
  run would hide the coupling and change or evade the accepted latency policy.
- Mock Git responses: rejected because those responses are the topology evidence.
- Accept resolved or unavailable in the layout assertion: rejected because it
  would no longer prove where successful discovery must point.

## Reversal cost

Low. Remove one optional function parameter and the fixture executor if a future
proof can retain real Git topology without a shared-clock assumption.

## References

- [Telemetry identity policy](2026-09-12-telemetry-git-identity-files--902c3293-14ba-494d-9945-1f26c718caf0.md).
