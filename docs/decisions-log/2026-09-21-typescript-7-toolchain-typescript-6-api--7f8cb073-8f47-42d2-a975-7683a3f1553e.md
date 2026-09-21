---
schemaVersion: 1
id: "adr:7f8cb073-8f47-42d2-a975-7683a3f1553e"
createdAt: "2026-09-21T12:58:08.702Z"
title: "Build with TypeScript 7 and analyse projects through the TypeScript 6 API"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Build with TypeScript 7 and analyse projects through the TypeScript 6 API

## Context

The monorepo type-checked with TypeScript 5.9 while Void Machine already used 7.0.2.
[TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
ships without a JavaScript API; 7.1 is expected to bring a different one. For
tools that import `typescript`, Microsoft's migration aliases `typescript` to
`@typescript/typescript6` (the 6.0 API) and `@typescript/native` to TypeScript 7.
[TypeScript 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
removes or deprecates `baseUrl`, `moduleResolution` `node10` and `classic`,
`target` `es5`, `outFile` and `false` for `esModuleInterop`,
`allowSyntheticDefaultImports` and `alwaysStrict`; it changes the defaults of
`types` to `[]`, `rootDir` to the config directory and `strict` to `true`.
TypeScript 7 turns those deprecations into errors.

Three places need the API rather than a compiler binary:

- `@voidcorp/harness-graph` analyses a project with that project's own
  `typescript`, resolved from its root, and refused every major but 5. After the
  upgrade, this repository itself resolved a compiler the graph refused.
- tsup, unmaintained and pointing to tsdown, builds declarations through the API
  and hard-codes `baseUrl: "."`, which the 6.0 API rejects (TS5101).
- The hook-runner's tests model a consumer with a usable compiler API.

The pack-monorepo `tsconfig.strict.json` is copied into consumer configurations,
which may run any TypeScript from 5.0 onwards.

## Decision

`tsc` is TypeScript 7 in every package. The root and harness-graph, whose tests
resolve a consumer's `typescript`, follow Microsoft's migration: `typescript` is
`npm:@typescript/typescript6@^6.0.2` and `@typescript/native` is
`npm:typescript@^7.0.2`, the ranges of the announcement. hook-runner bundles the
6.x API into its delivered worker under its own name, `@typescript/typescript6`,
and its tests link that package as the consumer compiler, so it declares no
`typescript` alias. The others depend on `typescript@^7.0.2` directly.

harness-graph accepts the 6.x API next to 5.x (adapter `typescript-6`, same
extractors) and widens its optional peer to `>=5.0.0 <7.0.0`. A TypeScript 7
project is analysed through the 6.x API it installs under `typescript`; without
it the snapshot stays partial and names what it lost, as before.

Declarations of harness-graph and the packs are emitted by `tsc`, not by tsup's
dts build; the CLI emits none, as nothing reads them. tsup keeps only JavaScript
bundling.

The shipped `tsconfig.strict.json` is unchanged: it uses no removed option, and
a library and a Node consumer extending it compile and emit with TypeScript
5.0.4, 5.9.3, 6.0.3 and 7.0.2, with the strict options enforced by all four.

## Consequences

Positive:

- One compiler version for type checking, the same as Void Machine.
- TypeScript 6 projects, and TypeScript 7 projects that follow Microsoft's
  migration, get a complete project graph instead of a partial one.
- Declarations come from the compiler of record instead of a plugin that
  cannot run on current TypeScript.

Negative:

- Two TypeScript packages in the lockfile until an official 7.x API exists.
- The 6.x adapter shares the 5.x extractors. It rests on the extractor,
  resolver, tsconfig and graph-content suites replayed against the 5.9 API
  (dev alias `typescript5`) and the 6.0 API, not on a separate audit of every
  resolution change in 6.0. Where the two APIs differ, as their defaults do
  without a tsconfig (`node10` against `bundler`), the graph follows the
  project's compiler and the suite pins both readings.
- harness-graph and pack declarations are one file per module instead of one
  bundle; neither package is published to npm.
- tsup stays in the build. Its replacement is a separate change to the published
  CLI bundle.

## Alternatives considered

- Keep `typescript` 5.9 in the API-consuming packages: no consumer change, but
  TypeScript 6 projects stay unsupported and the repository keeps three compilers.
- `ignoreDeprecations: "6.0"` in tsup's dts options: silences an option tsup
  forces, and has no path to TypeScript 7.
- Migrate tsup to tsdown now: changes the published CLI bundle inside a toolchain
  bump; it deserves its own verification.
- Accept 7.x in harness-graph: its `typescript` package has no API to call.

## Reversal cost

Low: restore `typescript@^5.6.0`, re-enable tsup's dts build and remove the 6.x
adapter entry. TypeScript 6 projects would then be analysed partially again.
