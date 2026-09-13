---
schemaVersion: 1
id: "adr:5b7dcf1d-d974-4f21-b814-d68d2e28f944"
createdAt: "2026-09-13T09:11:35.809Z"
title: "Inspect complete proposed sources with the project compiler"
status: accepted
deciders: ["codex"]
supersedes: []
---

# Inspect complete proposed sources with the project compiler

## Context

DEV-520 demonstrated two false positives: comment prose was treated as a disabled
test and an E2E-covered component was required to invent a sibling test. Normalized
additions omit surrounding comment delimiters, so they cannot prove which syntax
the proposed file contains. The distribution must stay small and offline.

## Decision

Inspect complete, exactly reconstructed proposed sources using a bounded process
and the project's compiler when syntax is required; allow an explicit physically
contained E2E test reference to satisfy the structural test-file floor.

Filesystem access, process execution and compiler loading stay in enforcement
adapters. Pure rules receive observed evidence. No dependency from hook-runner to
harness-graph is added: its async module-resolution API owns graph semantics,
whereas this synchronous pre-write adapter owns bounded syntax inspection. The
compiler ownership principle is shared, not an import across the package boundary.

## Consequences

Positive:

- Comments, templates and JSX are interpreted by the language compiler, not a
  second handwritten lexer. Unsupported evidence is an explicit refusal.
- The E2E marker means a real test file exists, never that tests ran.

Negative:

- Context-sensitive inspection requires a supported project TypeScript compiler.
  Loading it is slower than a string match, so common certain cases remain cheap.
- Ambiguous patches and exceeded resource limits need a smaller or exact edit.
- The project compiler is executable trusted tooling, not a hostile-code sandbox.

## Alternatives considered

- Strip comments from added lines: rejected because discarded context makes two
  different proposed files indistinguishable at that boundary.
- Bundle a parser/compiler: rejected because it duplicates the project's tooling
  and increases the distributed artifact. No lockfile or dependency change is needed.
- Infer E2E coverage from route names or use exploratory mode: rejected because
  neither is an honest declaration of structural test evidence.

## Reversal cost

Medium. The internal parser adapter can be replaced while retaining its refusal
contract. Removing the E2E marker would require a documented migration for consumers.
