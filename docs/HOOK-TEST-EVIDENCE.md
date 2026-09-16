# Test evidence in pre-write hooks

## Focused tests

The hook inspects the proposed file, including unchanged comment delimiters.
Write supplies a complete replacement. Edit requires an exact old_string match;
multiple matches require replace_all. Native apply_patch supports Add File and
exact context-bearing Update File hunks. Stale or ambiguous context, moves,
unanchored insertions and unsupported inputs refuse with TEST_SYNTAX_UNVERIFIED.
Submit a supported exact edit or complete Write to resolve that refusal.
Internal symbolic paths retain the tool's original spelling for reconstruction;
physical paths own containment and evidence. Multiple sections naming the same
physical file refuse, including sections using different internal aliases.

When syntax is needed, the harness uses its own official TypeScript 6 API:
`@typescript/typescript6` 6.0.2, resolving to TypeScript 6.0.3 in the lockfile.
The API and traversal are bundled into an ordinary companion worker. The parent
verifies its size and SHA-256 identity, then starts the isolated child. The
versioned JSON protocol carries source as data and returns syntax facts.
There is no consumer package lookup, dependency installation,
network request or fallback to the project's compiler. TypeScript 7 projects and
projects without TypeScript use the same parser. Ordinary unambiguous cases
retain their inexpensive paths without starting it.

The parser supports the syntax understood by the pinned release, including TSX.
Unsupported or malformed syntax refuses rather than being silently accepted.
A broken bundled parser asks to repair the harness installation, never to
downgrade the consumer compiler. This syntax-only ownership does not change
project graph module resolution or claim native TypeScript 7 API support.

The parser traverses syntax, including template substitutions and JSX expressions.
Comments, ordinary strings and regular-expression text are not executable calls.
Skipped `xit` and `xdescribe` aliases remain blocked through parameterized calls,
tagged tables, computed member access and TypeScript expression wrappers. The
callee walk shares the existing syntax-operation budget. See the
[Jest API](https://jestjs.io/docs/api).
It does not execute the inspected source, resolve its imports, read tsconfig,
load config plugins or run tests. The parser is trusted, versioned harness code; process isolation bounds resources.
The worker bundles its compiler dependency and never imports consumer packages.
It uses public `createSourceFile` and `getSyntacticDiagnostics` APIs with a
source-only virtual compiler host; no semantic type checking is performed.

Limits: 64 KiB per proposed file, 128 patch hunks, one million context comparisons,
32 inspected test files per operation, five seconds cooperative operation budget,
128 MiB child V8 old-space limit, 64 KiB child output and 20,000 syntax nodes. The child
inherits no environment variables. Timeout uses SIGKILL; a compiler trapping
SIGTERM cannot keep the synchronous hook waiting. Errors are fixed diagnostics,
never source content or raw compiler output. Limit refusals are not verification.

This pre-write observation is not an atomic filesystem transaction. The runtime
still owns applying the edit and rejecting stale patch context. The check is not
a semantic guarantee against renamed APIs, aliases or malicious project tooling.

## Declared E2E coverage

A production file can put this exact comment on its first line:

```ts
// tdd-cover: e2e tests/e2e/invitations.spec.ts
```

The path is literal and relative to the project root; spaces inside filenames
are supported. It must identify an existing regular .test/.spec file with a
ts, tsx, js or jsx extension. Absolute paths, parent traversal, backslashes and
links outside the physical project root refuse. The target is inspected only
for existence and kind, not read or executed. Every governed production edit is
reconstructed before declaration discovery,
including edits to only part of the marker and declaration removal. Missing or
ambiguous context and files over 64 KiB refuse with TDD_DECLARATION_UNVERIFIED;
supply exact context for bounded edits. An oversized original cannot be recovered
by a smaller Edit: provide a complete replacement within 64 KiB or restructure
into supported files. Exempt paths stay exempt.

Declaration-shaped lines elsewhere require the same bounded harness parser to
identify actual comments. Template/JSX text and block-comment examples are not
declarations; actual misplaced or duplicate line comments still refuse, including
trailing comments after code. Declaration-token discovery conservatively requests
the compiler; only its actual comment ranges establish a declaration. Missing
syntax capability is TDD_DECLARATION_UNVERIFIED. A sole first-line declaration
needs no compiler. Original source remains separate from proposed declarations:
the barrel-file exemption requires both known complete original and complete
proposed source to contain only re-exports. Normalized additions never establish
this property; neither uncommenting behavior nor removing behavior bypasses the floor.

Before source reads or reconstruction, an operation admits at most 32 governed
production edits. Content-based barrel exemptions count; path-exempt files and
explicit deletions do not. A shared five-second budget is checked before and after
each reconstruction, after syntax inspection, and before returning the rule result.
Exhaustion refuses with TDD_DECLARATION_UNVERIFIED and asks to split the operation.
This is a cooperative deadline, not interruption of synchronous filesystem work;
the byte, file, hunk and comparison limits bound work between checks. The syntax
child retains its separately enforced remaining-time process limit.

Original mode headers and complete original source are separate evidence. A bounded
8 KiB header read preserves the original first-five-line TDD mode even when the
original exceeds the complete-source limit. Unreadable or nonregular originals
refuse rather than silently falling back to the configured mode. Oversized
originals cannot establish the barrel exemption from their header alone.

Focused-test operations check the same cooperative deadline before and after
reconstruction, after parsing, and before success, including marker-free files.
Budget exhaustion reports TEST_SYNTAX_UNVERIFIED with an instruction to split.

One declaration on the first line is permitted. A malformed, conflicting or
misplaced declaration refuses; it cannot silently fall back to an existing
sibling or exploratory mode. With no declaration, existing sibling and configured
mode behavior remains. A valid declaration satisfies the same structural floor
as a sibling test and reports TDD_DECLARED_TEST: the file exists, suite not executed.
The engineer still owns real coverage and the red/green test evidence.

## CI adapter

CI sends added lines for content guards, but TDD reads the complete checked-out
file after selecting governed paths, including changes that only remove lines.
Whole-file deletions remain exempt; removing a declaration from surviving code
does not skip the TDD check. A diff fragment cannot establish a current
coverage declaration. The source choice is an adapter option, never a tool-payload
override. Missing or oversized final source refuses; path exemptions are unchanged.

Syntax inspection in CI uses the same bundled parser without provisioning consumer
dependencies. Missing or invalid complete source and exhausted budgets still
refuse; parser ownership does not change the CI adapter's evidence requirements.

## CI content boundary

`enforce-ci` receives complete added artifact content, not a runtime tool payload.
Its input is capped at 8 MiB so the shipped compiler worker remains fully scanned.
Runtime hook payloads retain their independent 1 MiB cap; syntax source retains
its 64 KiB cap and the shared five-second operation deadline. Both content readers
reject invalid UTF-8 and NUL bytes. CI refuses oversized input without truncation,
and every enforcement input failure returns a nonzero exit code. No generated
artifact exemption or line splitting is used to bypass the secret scanner.

## Sources

- [Microsoft's TypeScript 7 guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0):
  tooling using the JavaScript compiler API can use the official TypeScript 6 package.
- [Official Compiler API examples](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API):
  source files, compiler hosts and syntax traversal.
- [Native API roadmap](https://github.com/microsoft/TypeScript/issues/63875):
  future native APIs do not constitute the current worker contract.
