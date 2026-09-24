---
schemaVersion: 1
id: "adr:9a46bc91-9636-440b-bf00-7fb918ace537"
createdAt: "2026-09-15T14:19:00.991Z"
title: "Separate syntax semantics from bounded compiler execution proofs"
status: proposed
deciders: ["Folpe"]
supersedes: []
---

# Separate syntax semantics from bounded compiler execution proofs

## Context

Semantic hook tests required a specific AST verdict from a compiler process
bounded to one second. Two cases instead returned unavailable during full local
verification. That is the intended refusal when bounded inspection cannot finish,
but it does not answer whether the AST classification itself is correct.

## Decision

Use one pure AST analysis function both in semantic tests with the trusted test
compiler and, serialized, inside the existing isolated production child.
The runner accepts an optional inspector from trusted TypeScript callers only;
CLI arguments and hook payloads never supply it. Semantic and child-protocol
results share the same validated conversion to a rule verdict.

## Consequences

- All existing semantic cases remain tested, including reconstructed Edit/patch
  source and the aggregate deadline refusal.
- Real process tests retain nearest-compiler resolution, failure, confidentiality,
  termination and two exact verdicts through the bundled serialized program.
- Production still loads the project compiler only in the child, with an empty
  environment, 128 MiB memory, SIGKILL, bounded output and the same one-second cap.
- The pure analysis must stay self-contained so serialization cannot lose a
  dependency; bundled integration tests enforce that constraint.

## Alternatives considered

- Extend the parsing deadline or retry failed assertions: rejected because this
  changes or evades the resource policy instead of proving the syntax contract.
- Fabricate parser verdicts in semantic tests: rejected because the AST behavior
  is precisely what those tests must establish.
- Load the project's compiler in the parent: rejected because it crosses the
  existing trust and process-isolation boundary.

## Reversal cost

Low. Remove the optional trusted dependency and inline the analysis if another
proof can keep semantic correctness independent of process availability. No
consumer configuration or data migration is introduced.
