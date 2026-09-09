---
schemaVersion: 1
id: "adr:90348aec-c881-481f-b8cf-bc8a947ed052"
createdAt: "2026-09-07T15:15:10.568Z"
title: "Bounded subprocess concurrency by proof tier"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Bounded subprocess concurrency by proof tier

## Context

The subprocess cohort contains 74 files and 956 tests. Running every subprocess
project with one worker makes the complete local suite take about 78 seconds,
while the harness still needs serial execution for consumer and system tests
that exercise packed artifacts and critical journeys. The approved proof
architecture requires explicit worker budgets and forbids trading away those
proofs for speed.

## Decision

Contract subprocess tests run with two bounded workers; consumer and system
subprocess tests remain sequential in separate Vitest sequence groups.

## Consequences

Positive:

- The large contract lane gets bounded parallelism without overlapping the
  higher-risk artifact and system lanes.
- The test catalogue remains the single source of worker and ordering policy.

Negative:

- The machine still pays the full sequential cost for consumer and system
  subprocess proof, and the two-worker budget must be stress-tested before any
  further increase.

## Alternatives considered

- Keep every subprocess project at one worker. Rejected because it preserves
  an unnecessary bottleneck in contract tests that use run-owned fixtures.
- Run all subprocess projects with two or more workers. Rejected because it
  risks concurrent writes and shared runtime state in consumer and system
  journeys.
- Remove subprocess tests from the required gate. Rejected because process
  boundaries, rollback and packed-runtime behavior are part of the product's
  safety contract.

## Reversal cost

Low. The catalogue changes only worker counts and Vitest sequence groups; test
files and proof ownership remain unchanged, so reverting the scheduling
function restores the previous policy.
