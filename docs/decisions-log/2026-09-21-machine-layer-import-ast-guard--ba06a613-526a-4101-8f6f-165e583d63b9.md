---
schemaVersion: 1
id: "adr:ba06a613-526a-4101-8f6f-165e583d63b9"
createdAt: "2026-09-21T11:42:21.194Z"
title: "Guard Machine layer imports with the TypeScript AST"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Guard Machine layer imports with the TypeScript AST

## Context

The [foundation plan, section 5.4](../plans/2026-09-20-void-machine-typescript-foundation-plan.md)
requires one compact architectural test over static imports, type imports,
reexports and transitive local dependencies. TypeScript 7 is the package compiler,
but [its release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
state that it has no programmatic API yet. A text regex can miss syntax and
comment/string distinctions. The package already uses TypeScript syntax and the
repository uses TypeScript tooling.

## Decision

Use the official `@typescript/typescript6` compiler API as a test-only AST parser
alongside the TypeScript 7 compiler. Parse every source module in the bounded
package tree, including import declarations, export declarations, import-equals,
import types and dynamic imports. Report the importer and specifier for forbidden
edges. Test the AST instrument itself on type-only and reexport syntax.

The ownership rules follow the
[TypeScript layer ADR](./2026-09-19-void-machine-typescript-layer-ownership--e492e50e-86b0-4427-9fdf-2435750ce60d.md)
and plan section 5.2: core imports core; runtime imports core/runtime;
verticals import core/verticals; adapters may implement ports owned by core,
runtime or verticals but cannot import application; application composes. Each layer lists
the external packages it may import (today `zod`, plus `smol-toml` for adapters);
any other package, harness packages included, is refused. Core, runtime and
verticals import no Node built-in, detected with `isBuiltin` from `node:module`
whatever the prefix. A dynamic import with a non-literal specifier is refused in
every layer, and dynamic imports in the kernel are refused. A fixed table of
synthetic refused sources proves that the detector still reports each case.

The existing doctor adapters importing `verticals/development/doctor.ts` are
conformant: they implement or render doctor-owned ports and schemas. Moving those
types into the core would make a development diagnostic generic by accident.

## Consequences

Positive:

- The test catches type-only paths, including `type T = import('...').T`, and
  names the violating edge. One package test keeps the guard out of consumer runs.
- The parser is the official TypeScript AST, whose use beside TypeScript 7 is
  explicitly documented by the TypeScript team.
- The refused-source table fails the test if the detector stops reporting.

Negative:

- A test-only TypeScript 6 installation coexists with the TypeScript 7 compiler.
- This guard proves declared module edges, not runtime confinement of an adapter,
  and does not see Node globals such as `process` or `fetch`. A second, separate proof
  covers them for the pure layers: `tsconfig.pure.json` type-checks core, runtime and
  verticals without Node or DOM types, with an explicit allowlist of three WHATWG
  primitives, and a negative fixture must fail to compile there. Neither proof is a
  run-time sandbox.

## Alternatives considered

- `es-module-lexer` 3: small and detects static type imports/reexports, but its
  [TypeScript notes](https://github.com/guybedford/es-module-lexer#typescript)
  describe heuristic handling for some `import()` types, leaving a graph blind spot.
- Regex over source text: rejected because comments, strings and TypeScript import
  forms make it an unreliable module parser.
- Oxc parser: a capable AST parser, but adds a separate native parser dependency
  when the official TypeScript 6 parser is available as a test-only companion.
- Keep TypeScript 5 from the repository root: resolution would depend on the
  monorepo layout rather than on the package's declared test dependencies.

## Exit condition

Remove `@typescript/typescript6` from `packages/void-machine` as soon as a released
TypeScript 7.x ships a documented programmatic parser API. The removal moves the
layer test to that API in one change, keeps the refused-source table unchanged, and
must observe the table RED against a detector that reports nothing before going
GREEN. Until then the pinned 6.x version is raised only for a security fix.

## Reversal cost

Low: replace the single test parser after TypeScript 7 exposes a stable AST API
and prove the same fixture edges and RED case. No production or journal format
uses this dependency.
