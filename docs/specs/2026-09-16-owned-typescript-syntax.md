---
title: Harness-owned TypeScript syntax inspection
date: 2026-09-16
status: in-design
author: folpe + Codex
ticket: ""
related:
  - docs/HOOK-TEST-EVIDENCE.md
  - docs/ARCHITECTURE.md
---

# Harness-owned TypeScript syntax inspection

## Problem and outcome

Void Cortex uses TypeScript 7.0.2. Harness 3.8.0 resolves its compiler and
expects the legacy TypeScript parsing API, blocking a valid PostgreSQL test
edit with TEST_SYNTAX_UNVERIFIED. PR #386 substitutes Babel. The user rejects
that substitution and requests the official TypeScript parser with explicit
layer boundaries. This proposal replaces that implementation before release.

The harness must inspect complete proposed source without depending on any
consumer compiler, installing consumer dependencies, or executing source.
Focused-test and TDD declaration rules must preserve their existing behavior.
The same sources must yield the same evidence across consumer TS versions.

## Official API choice

Use the official TypeScript 6 Compiler API, owned and exactly pinned by the
harness. Microsoft's supported transition package is @typescript/typescript6;
its current published wrapper is 6.0.2. Pin the resolved implementation in the
package-manager lockfile as well. The dependency belongs to the harness build
and is bundled into the distributed worker, never required from a consumer.

TypeScript 7.0 does not ship a programmatic API. Its future API is different;
the current roadmap still describes isolated createSourceFile as work to do.
Do not claim native TS7 API integration or universal future syntax support.
Supported syntax follows the pinned official parser. Unknown/malformed syntax
refuses. A future official adapter migration requires the same contract tests.

Sources read on 2026-09-16:
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://www.npmjs.com/package/%40typescript/typescript6
- https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- https://github.com/microsoft/TypeScript/issues/63875

## Layers and dependency direction

These are small modules inside the existing hook-runner, not new services,
packages, a plugin platform, an AST abstraction or a dependency container.

1. Enforcement policy owns its input/output contracts and pure rules. It
   interprets syntax facts to allow/refuse and formats existing verdict codes.
   It imports neither TypeScript, child_process nor installation internals.
2. Inspection orchestration reconstructs and bounds complete proposed source,
   preserves inexpensive unambiguous paths, tracks the shared operation budget,
   and requests inspection through a function parameter. It never trusts a
   partial patch as complete source or resets the deadline per file.
3. The Node execution adapter launches the fixed shipped worker, supplies
   source as data, validates the bounded protocol, enforces deadlines and maps
   execution/protocol failures into typed unavailable results. It does not
   interpret the AST or decide whether a declaration is correctly placed.
4. The TypeScript adapter runs only in that child. It uses official public
   APIs to parse and extract the few syntax facts the policy needs: prohibited
   test constructs and actual declaration comments with source locations.
   No TypeScript Node, Program or SyntaxKind crosses the boundary. The adapter
   extracts evidence; it does not authorize the edit.
5. Build/install/doctor own artifact generation, delivery, compatibility and
   health. They do not implement syntax rules or select a consumer compiler.

The TypeScript adapter depends on the policy-owned fact contract. The
composition entrypoint wires the execution adapter into the orchestration.
Facts remain specific to these checks; do not normalize the entire AST.

## Worker and distribution

Ship a separate ordinary Node worker file alongside the lightweight hook.
Bundle the official TypeScript implementation into that worker at build time.
The parent never imports it. Resolve its fixed location from the installed
harness asset, never from cwd, a proposed path, or a tool payload.

Remove Babel, its traversal, the gzip/base64 generated program and dynamic
Function/eval loader. No runtime downloads, extraction cache, persistent
daemon, compiler fallback or compiler-selection configuration.

Treat the hook and worker as one installation unit. Extend the existing
transaction/rollback machinery, asset inventories and health checks rather
than inventing another installer. Cover npm, Codex, Claude/plugin delivery,
update, repair and isolated source self-host compilation. Record expected
worker identity with the hook so missing or incompatible pairs refuse even
during an interrupted update. Hashes detect install drift; they are not a
security boundary against someone who can rewrite the entire installation.

## Parsing and refusals

Create the SourceFile from the supplied text with explicit language kind.
Use a virtual, source-only CompilerHost for public syntactic diagnostics where
needed; no default libraries, import resolution, tsconfig, plugins, semantic
type checking or emission. Reuse the parsed SourceFile for diagnostics and
traversal. Do not reach into undocumented parseDiagnostics or private modules
merely to reduce latency; do not fork or hand-trim Microsoft's parser.

The bounded protocol distinguishes inspected facts, invalid source, exhausted
limits and unavailable worker/protocol. Both ends validate input/output.
The parent alone maps those results to existing TEST_SYNTAX_UNVERIFIED and
TDD declaration refusal contracts. Errors must not include source or secrets.

Retain the one-second shared operation budget, 64 KiB per source, 20,000
syntax operations, 64 KiB child output limit, empty environment and forced
termination. Retain the 128 MiB V8 old-space setting; it is not an OS-level
total-process memory guarantee. Process isolation bounds execution and crash
impact; it is not by itself a filesystem/network sandbox. The inspected
source never executes and no consumer package is loaded.

## Performance decision gate

The previous compressed full-TypeScript implementation reached 1,095 ms in
one full-suite declaration test against the unchanged 1,000 ms deadline.
That measures that implementation, not the feasibility of TypeScript.

Before completing installer integration, measure the ordinary worker on the
real Cortex file, JS/TS/JSX/TSX cases and bounded large inputs. Separate process
startup, official module loading, diagnostics, traversal and IPC costs. Report
cold p50/p95/p99, failures and peak memory across supported CI operating systems
and the minimum supported Node version. Run under representative suite load.
Keep all failed samples; rerunning unchanged code until green is not evidence.

Acceptance requires existing timeout/memory/output tests, full suite and hook
benchmark budgets to pass without increasing them. Distribution size must be
measured from the actual packed artifact, including both files and licenses.
Do not reuse the Babel tarball measurement or its ceiling as TypeScript proof.
If the ordinary worker cannot meet the constraints, present the measured
bottleneck and a revised design before adopting a daemon or changing budgets.

## Alternatives

- Recommended: disposable worker with bundled official TypeScript. Explicit
  ownership and isolation, no cross-request state; requires complete delivery
  integration and evidence that cold startup fits existing limits.
- Ambitious: persistent TypeScript analysis service shared across requests.
  Amortizes startup but adds lifecycle, concurrency, invalidation, version skew
  and recovery. Not justified by one slow sample; excluded from this fix.
- Lateral: move verification entirely into CI using the project's compiler.
  Removes hook parsing cost but loses the pre-edit enforcement contract and
  compiler independence. Rejected for this requirement.

## Verification and rollout

TDD strict for adapter, protocol, policy extraction and installation changes.
Reuse the real TypeScript semantic corpus, including JSX prose, wrappers,
parameterized tests, malformed sources and declaration positions. Preserve the
TS7-only, no-compiler and hostile-consumer fixtures added in PR #386.

Add layer-specific tests: policy on facts; official adapter on real source;
real child timeout/crash/corrupt protocol; no source or consumer-tool execution;
missing worker, wrong version, interrupted update and rollback; packed offline
installation for both runtimes and source self-host. Verify dependency direction
and that the parent bundle contains no TypeScript implementation.

Execution order: prove worker feasibility; extract and test boundaries; deliver
the paired artifacts through existing installers; run full regression,
distribution and independent review; replace the Babel PR contents. Publication
and consumer update are later explicit steps. Never wire source self-host output
over the repository's published enforcement floor as a test shortcut.

Project graph analysis remains a separate concern: it requires project module
resolution and may require semantic information. This syntax port does not
claim to make knowledge/why compatible with TypeScript 7.

## Self-review

Scope is syntax enforcement and its complete delivery chain. The API choice,
fact boundary, failure semantics and unchanged budgets are explicit. Worker
latency and tarball size remain measured acceptance gates, not assumed claims.
No implementation or approved status is implied by this in-design document.
