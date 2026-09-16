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

Bundle the pinned Babel 7.29.8 parser and the hook AST traversal as a compressed, inert program in the hook
asset and load it only inside the existing bounded syntax child.

This supersedes only the project-compiler ownership and no-bundled-parser parts
of the proposed-source inspection decision. Complete-source reconstruction,
structural E2E declarations, refusals and resource limits remain unchanged.
Project graph module resolution remains owned by its separate adapter.

The generated payload comes from the locked dependency and AST traversal through
esbuild. Builds retain the upstream MIT license and verify the generated file.
Babel 7.29.8 supports the harness Node 22.12 floor; Babel 8 requires a newer Node.
Parser options and AST node shapes follow https://babeljs.io/docs/babel-parser. Its contents are
not user input. The child decodes it with an 8 MiB decompression ceiling and
builtin-only require, then gives proposed source to the existing AST analysis
as data. The parent never loads parser code. A corrupt payload refuses.

## Consequences

- TypeScript 7 and compiler-free consumers need no additional dependencies.
- Consumer compiler code cannot execute in either parent or child.
- Offline single-file installation continues to work for both runtimes.
- The distributed artifact grows by the compressed parser payload. The syntax
  vocabulary is pinned to the harness release, not the consumer compiler.
- The measured `voidharness` tarball is 1,004.2 kB. Its ceiling rises from
  930 kB to 1,025 kB, retaining about 20 kB of bounded headroom.
- Time, memory, source-size, output-size and AST-node budgets are unchanged.

## Alternatives considered

- Widen the version regex to 7: rejected because the required API is absent.
- Require a consumer compatibility package: rejected by the user; enforcement
  must own its parser instead of constraining the consumer's compiler setup.
- A separate worker file: rejected because it adds a mandatory companion to
  every installation and health path; compressed inert data keeps one asset
  without eagerly loading the parser in the parent.
- Bundle the complete TypeScript compiler: rejected after the full subprocess
  suite exceeded the unchanged one-second cap (declaration case, 1095 ms). Its
  compressed payload was 1,367,908 bytes. The dedicated AST parser payload is
  about 107 kB, with the same semantic regression corpus preserved. No deadline
  increase, retry or removed assertion makes that failed measurement green.

## Reversal cost

Medium. The generated payload and loader can be replaced behind the verdict
contract. Parser changes must pass the existing semantic and isolation suite.
