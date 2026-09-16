---
schemaVersion: 1
id: "adr:d5909805-86f2-4fb5-bbe2-25f5a89ba146"
createdAt: "2026-09-16T10:25:57.669Z"
title: "Own the isolated syntax parser in the harness"
status: proposed
deciders: ["folpe"]
supersedes: ["adr:5b7dcf1d-d974-4f21-b814-d68d2e28f944"]
---

# Own the isolated syntax parser in the harness

## Context

The 3.8.0 hook blocked a TypeScript 7.0.2 consumer because its root export no
longer contains the legacy parsing API. The user requires a harness-owned parser,
without a consumer compatibility package or a compiler downgrade.
Microsoft documents the API boundary and its TypeScript 6 package here:
https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/

## Decision

Bundle the official `@typescript/typescript6` API and AST traversal into a
separate ordinary worker owned and delivered by the harness. The pinned wrapper
is 6.0.2; the package-manager lock resolves its official compiler to 6.0.3.
The consumer keeps its own compiler, including native TypeScript 7.

This supersedes only the project-compiler ownership and no-bundled-parser parts
of the proposed-source inspection decision. Complete-source reconstruction,
structural E2E declarations and fail-closed refusals remain unchanged.
Project graph module resolution remains owned by its separate adapter.

Separate reconstruction and policy from the TypeScript adapter and process
boundary. The adapter uses public source-file, virtual-host and syntactic
diagnostic APIs. Its input is proposed source; its output is syntax facts, not
authorization. The parent validates the versioned protocol and decides verdicts.

One shared esbuild builder creates the parent and worker for published and
source-self-host artifacts. Preserve upstream license notices. The parent
checks the worker's size and SHA-256 identity before execution; health checks
also refuse a missing or incompatible companion. No decompression, evaluation,
extraction cache or persistent worker is needed.

## Consequences

- TypeScript 7 and compiler-free consumers need no additional dependencies.
- Consumer compiler code cannot execute in either parent or child.
- Offline installation delivers the paired assets for both runtimes.
- The distributed artifact grows by the bundled official compiler. The syntax
  vocabulary is pinned to the harness release, not the consumer compiler.
- Final packed size and its justified ceiling remain a release verification gate.
- Memory, source-size, output-size and AST-node budgets are unchanged.
- CI content transport has its own 8 MiB bound to scan complete added artifacts,
  including the compiler bundle. Runtime tool payloads stay at 1 MiB. Both
  reject invalid text and overflow; scanning never truncates or exempts the worker.
- A one-second benchmark failed 3 of 180 cold inspections. An uncensored
  diagnostic run completed 180 inspections with a maximum of 3,732 ms. A fixed
  five-second shared operation budget was explicitly approved by the user.
  Stop the child and refuse at exhaustion, without retry. This does not erase
  the failed measurements or establish a five-second performance target.

## Alternatives considered

- Widen the version regex to 7: rejected because the required API is absent.
- Require a consumer compatibility package: rejected by the user; enforcement
  must own its parser instead of constraining the consumer's compiler setup.
- Babel: rejected by the user. Official TypeScript syntax and its supported
  compatibility API own this boundary.
- Future native parsing API: not the current stable contract. Revisit when
  Microsoft publishes a supported programmatic API with the required behavior.
- A compressed embedded compiler: unnecessary loader complexity. A companion
  worker makes the process and distribution boundaries explicit and verifiable.
- Splitting minified CI input to satisfy the runtime payload limit: rejected
  because line-level secret matching must retain whole-line semantics. A distinct
  bounded CI adapter preserves the existing scanner and runtime limits.
- Node compile cache: a disposable experiment timed out in 23 of 31 runs on
  this machine. It is not part of the implementation.

## Reversal cost

Medium. A future supported compiler API can replace the TypeScript adapter
behind the syntax-facts contract. Parser changes must pass the semantic,
isolation, delivery and measured performance gates.
