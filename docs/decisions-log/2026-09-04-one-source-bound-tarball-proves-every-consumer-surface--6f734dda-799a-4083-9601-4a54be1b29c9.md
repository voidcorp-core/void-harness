---
schemaVersion: 1
id: "adr:6f734dda-799a-4083-9601-4a54be1b29c9"
createdAt: "2026-09-04T19:20:39.752Z"
title: "One source-bound tarball proves every consumer surface"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# One source-bound tarball proves every consumer surface

## Context

Install, hook and Autopilot conformance each packed the CLI independently. Each script inherited a
different portion of the developer environment, captured child output differently and cleaned up
differently. A green matrix therefore did not prove that every operating system exercised the same
bytes, and a local credential or cache could make a reproduction richer than CI.

The consumer proof authorizes autonomous work. It must identify the reviewed checkout and the
actual package bytes without turning elapsed time on a shared runner into a correctness assertion.
The separately published `@voidcorp/harness-graph` package has its own consumer contract and must
not be hidden inside the CLI artifact boundary.

## Decision

One Linux producer packs `voidharness` once from an exact clean checkout, writes a canonical
manifest binding package name, version, source SHA and tarball SHA-256, and uploads both files as
one immutable workflow artifact. Linux, macOS and Windows download and verify that pair before a
single orchestrator runs install, hook and Autopilot suites against the same tarball.

Every conformance child receives a minimal allowlisted environment and fixture-local home, temp,
cache and Void roots through one process supervisor. The supervisor bounds output and liveness,
terminates process trees and reports an explicit outcome. Performance is observed, never asserted
on these shared hosts. ProjectGraph keeps a separate path-filtered matrix because it publishes a
different package and owns a distinct portability contract.

## Consequences

Positive:

- A green matrix identifies one source commit and one exact package digest.
- Local state, credentials and caches cannot silently enrich the proof.
- Three duplicate process runners and three independent pack operations collapse into one path.
- Every suite failure remains visible because the orchestrator aggregates without retrying.

Negative:

- Consumer jobs depend on the producer artifact and cannot start until packing finishes.
- The repository owns a small manifest verifier and cross-platform process supervisor.

## Alternatives considered

- **Pack independently on every operating system.** Rejected because a matrix would prove three
  possibly different artifacts and repeat the most expensive setup on every runner.
- **Reuse the release artifact workflow.** Rejected because pull-request conformance has no release
  tag and must prove an unversioned branch checkout without weakening the stricter publication
  contract.
- **Run every package conformance in the same artifact job.** Rejected because ProjectGraph is a
  separately published package with platform-sensitive path behavior; combining it would make the
  CLI manifest claim ownership of bytes it does not contain.

## Reversal cost

Low. The suites remain executable Node scripts and the artifact is an ordinary npm tarball plus
JSON. Reverting to per-job packing removes the producer and passes a locally built tarball to each
suite; no consumer or persistent-data migration is involved.
