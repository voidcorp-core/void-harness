# Test evidence in pre-write hooks

## Focused tests

The hook inspects the proposed file, including unchanged comment delimiters.
Write supplies a complete replacement. Edit requires an exact old_string match;
multiple matches require replace_all. Native apply_patch supports Add File and
exact context-bearing Update File hunks. Stale or ambiguous context, moves,
unanchored insertions and unsupported inputs refuse with TEST_SYNTAX_UNVERIFIED.
Submit a supported exact edit or complete Write to resolve that refusal.

When syntax is needed, the compiler resolves from the project's package context,
following its package manager's installed dependency graph. It never falls back
to a compiler bundled with the harness. Supported API: TypeScript 5, checked
against 5.9.3. An absent, broken or incompatible compiler is named as unavailable;
restore the project's supported compiler to enable this capability. A plain test
with no suspicious tokens and a prohibited call at the start of the complete
file do not need a compiler. This preserves the inexpensive common paths.

The parser traverses syntax, including template substitutions and JSX expressions.
Comments, ordinary strings and regular-expression text are not executable calls.
It does not execute the inspected source, resolve its imports, read tsconfig,
load config plugins or run tests. The compiler package itself is trusted executable
project tooling, like the compiler used by the project graph; process isolation
here bounds resources, not that package's filesystem or network authority.

Limits: 64 KiB per proposed file, 128 patch hunks, one million context comparisons,
32 inspected test files per operation, one second aggregate parsing budget,
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
for existence and kind, not read or executed. A declaration is checked against
the proposed source for Write, Edit and supported patches, including removal.

One declaration on the first line is permitted. A malformed, conflicting or
misplaced declaration refuses; it cannot silently fall back to an existing
sibling or exploratory mode. With no declaration, existing sibling and configured
mode behavior remains. A valid declaration satisfies the same structural floor
as a sibling test and reports TDD_DECLARED_TEST: the file exists, suite not executed.
The engineer still owns real coverage and the red/green test evidence.

## Sources

- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API),
  plus the installed 5.9.3 declaration file for createSourceFile, createProgram
  and getSyntacticDiagnostics.
- [Node 22 builtin module access](https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid),
  available since 22.3 and within the package's Node 22.12 minimum.
