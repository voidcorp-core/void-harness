# @voidcorp/harness-graph

The semantic graph kernel for void-harness. CatalogGraph, MissionGraph,
EvidenceGraph, and ProjectGraph share a strict node-link envelope at
`schemaVersion: 3`. The source catalog still produces `model.json` as a read-only
v1 projection so existing analyzers and Graph Studio migrate without a flag day.

## Graph v3 envelope

Every snapshot declares `graphId`, `graphType`, source kind/version/root hash,
and bounded node, edge, and hyperedge collections. Entities have namespaced
stable IDs, origin, confidence, and provenance. Timestamps are allowed only for
observed relations. Invalid hashes, duplicate IDs, dangling relations, unsafe
provenance paths, oversized inputs, and invalid deltas fail before projection.

`catalog.v3.json` is the canonical catalog snapshot. `model.json` is generated
from it through `projectCatalogV3ToV1`; the adapter validates first and never
mutates either input. The reverse `adaptCatalogV1` path preserves every v1 node,
edge, and legacy metadata. Rollback is therefore to keep `model.json`, restore
direct v1 reads, and remove `catalog.v3.json`; schema v3 data remains readable by
the versioned package API.

## Native ProjectGraph

`buildProjectGraph({ root })` from the dedicated
`@voidcorp/harness-graph/project` export creates a local `graphType: "project"` snapshot
without an account, service, or native dependency. It indexes root-confined
regular files, package workspaces, Git ownership and working-tree changes, and
TypeScript/JavaScript imports, exports, symbols, dynamic imports, and tests.
TypeScript syntax and module resolution use the official Compiler API behind
the exported `ProjectExtractor` port, so a future parser can replace that
adapter without changing the builder contract. Named export clauses, re-exports, namespace and
wildcard exports, and named or anonymous defaults become explicit export-surface symbols; CommonJS
assignment exports are recognized only for supported JavaScript inputs, never inferred from
TypeScript globals. A bounded workspace package
table indexes package names and resolves bare and subpath imports from conditional
manifest export maps, then source/main fallbacks when no map exists, even when a
project does not define TypeScript path aliases. A root `pnpm-workspace.yaml` is authoritative when
present; package `workspaces` is the fallback. Positive and `!` exclusion patterns apply before child
manifests enter topology. Picomatch's POSIX mode handles globstars, braces, nested packages, and
directory-root
exclusions such as `!dir/**` and `!**/test/**` with one candidate-marker rule for every pattern.
Bounded, root-confined `tsconfig` inheritance accepts the TypeScript 5.9 string and ordered-array
forms and is parsed as a complete graph by the
official Compiler API so `baseUrl`, `paths`, and their declaring config origins retain compiler
semantics; cyclic, missing, escaping, or over-deep config chains make the snapshot partial.
Vitest test discovery recognizes only the bounded `it`/`test`, `only`, `skip`, `todo`, `concurrent`,
`sequential`, `fails`, `skipIf`, `runIf`, and `each` call grammar. `extend`, arbitrary members, and
non-literal dynamic imports are excluded or diagnosed rather than silently inventing topology.

File nodes keep path-derived stable IDs. A Git-proven rename adds a
`previous-id` relation from the old tombstone to the new file; bounded multi-hop
renames compose to the current identity while retaining every Git HEAD/ref proof. An unproved move
is deliberately represented as one deletion and one new identity. Tombstones
and proven lineage stay in the cache so repeated unchanged builds cannot erase
history. Every node
and relation carries source provenance, and the sealed v3 snapshot carries the
content-derived `rootHash`. Build results also expose a `snapshot.id` embedded in the root node.
This SHA-256 token has explicit `observed-content-v1` semantics: it commits to the canonical root key,
root and canonical-parent device/inode identity, root-entry journal generation, the observed
path/device/inode/size/mtime/ctime/content-hash manifest, Git evidence, and extractor version. The
ordinary file-change generation gates acceptance and publication but is not part of the content token.
The token identifies observed content, not an impossible claim that the mutable tree is still current
when the promise returns. A mutation after that observation is new evidence and cannot authorize reuse
without a compatible accepted journal generation.

The reserved cache location is `.void/cache/project-graph-v1.json`, which is gitignored. It is a
logical cache key for the builder's bounded, process-scoped LRU memory cache. The explicit Node
repository-cache adapter never reads or writes repository bytes: a repository author can recompute
the payload's self-hash, so those bytes cannot authorize skipped source reads. Portable Node also
cannot perform descriptor-relative creation and rename without retaining a parent-swap race. A build
whose selected cache cannot publish returns `state: degraded` with `cache-unavailable` while
preserving the complete graph. Consumers that own a safe durable boundary can inject another port.
Publication uses prepare, an invisible pending commit, then finalize. Finalize validates the same
journal generation, performs a synchronous generation compare-and-swap, and immediately publishes
with no event-loop gap; abort only releases the unpublished candidate, so the last green value never
needs rollback. `createMemoryProjectCachePort()` provides the same bounded isolation for tests,
benchmarks, and caller-owned session workflows. Entries contain
SHA-256 content hashes and reusable extraction records bound to the producing
extractor and pipeline versions. A canonical payload hash rejects schema-valid
cache mutation; a loaded cache's snapshot token is never trusted as freshness evidence, and the cached
Git HEAD permits bounded committed-rename comparison.
During a cold build the builder inventories and hashes while the session-scoped
`ProjectChangeJournal` records changes through bounded, unreferenced Node `fs.watch` handles for the
project tree plus its parent. The parent callback
accepts only the exact root basename, so sibling activity cannot alter the snapshot or root hash. A
compatible authoritative `unchanged` generation reuses the trusted cache with zero traversal, zero
file reads, zero hashing, and zero AST passes. An authoritative `changed(paths)` generation inspects
only the coalesced delta: one changed file with the same proven identity means one inspect, one read,
and one hash. Adds, deletes, renames, directory events, and identity changes force a bounded full scan
because portable watcher events need not report both sides. A missing filename, event overflow,
root-entry event, or
other uncertain observation forces an explicit full rebuild. A watcher unavailable before extraction
returns a complete `degraded` full rebuild; capability lost during a build returns `partial` or
`degraded` according to the last safe observation. Both paths close the root's handles, disable reuse
and publication, and never return a false `fresh` result. Journals expose `dispose(root)` and `close()`,
use an LRU root budget, and unref every handle.

Source files are opened without following the leaf, read through bounded descriptors, and checked
again by device/inode plus canonical parent identity before their data is accepted. The root guard
binds canonical root and parent device/inode; parent timestamps are deliberately excluded so sibling
writes do not invalidate the root. Git validates root identity and the journal generation before and
after every command. Two validated `HEAD` reads also bracket the complete Git evidence collection;
commit-dependent commands use the initial object ID, not the mutable `HEAD` name. A changed or
unreadable final `HEAD` degrades the whole Git snapshot. Final cache publication validates and
compare-and-swaps that same generation atomically. A filesystem port without exact-path inspection
remains correct by rebuilding changed generations rather than applying a delta.
Corrupt, incompatible, or cross-root caches are reported and rebuilt explicitly;
an unsafe cache boundary stays partial without publication. A partial scan, concurrent file mutation,
unsafe symlink, degraded Git capability, parse error, or memory-ceiling breach
returns `state: partial`,
does not replace the last green cache, and requires callers to fall back to source reads. A cache
publication failure alone is `degraded`, not `partial`, because it does not invalidate the graph
already extracted from source.

The portable Node journal is advisory because `fs.watch` cannot prove the absence or completeness of
events. Default builds therefore verify the bounded source set before reuse. A caller-owned,
loss-detecting journal may declare itself authoritative and unlock the unchanged/delta fast paths.

The Node root guard, session journal/watch adapter, filesystem, Git, cache, clock, memory meter, and
syntax extractor are injectable ports. Pure extractors do not perform I/O; the default adapters are
the only imperative shell. Directory entries stream without whole-directory allocation. Files,
entries, directories, depth, aggregate bytes, sampled peak heap delta, cache bytes, Git output,
and process duration all have finite hard ceilings. Git resolves to a trusted absolute executable,
receives a minimal environment, blocks protocols, neutralizes repository-local clean/process filters,
and disables hooks, external diff, and textconv execution. HEAD, changes, and ownership degrade
independently but any missing evidence prevents a fresh cache publication. The
Compiler API implementation follows the
[official TypeScript Compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API),
including AST traversal and standard `resolveModuleName` behavior.

TypeScript is a production dependency because the compiler is the parser and resolver. On 2026-07-28,
the checked-in lock resolved `5.9.3` with Apache-2.0 license, repository metadata pointing to
`microsoft/TypeScript`, no runtime dependencies, no native module, and no install lifecycle script,
and npm
integrity
`sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==`.
This records package metadata and lock integrity, not an npm provenance attestation.
`pnpm audit --prod` exited successfully on that date. The cross-platform CI lane runs ProjectGraph tests and
typecheck on Ubuntu, macOS, and Windows, then installs the packed artifact with lifecycle scripts
disabled and imports `@voidcorp/harness-graph/project` from a disposable consumer.

Picomatch `4.0.5` is the pnpm-workspace glob engine. The 2026-07-28 metadata and lock audit found an
MIT, pure-JavaScript, side-effect-free package with no runtime dependencies, no native module, and no
install lifecycle script; it supports braces and globstars and publishes a dedicated POSIX implementation.
The lock records npm integrity
`sha512-RvwwcruNjI1ncT5xRakeyS9Lf8lcItv34KD+aif+VH9kduAyfYBipGh12274xtenIPZ119/R9BdTBa8gAwSh0A==`;
the repository is
[micromatch/picomatch](https://github.com/micromatch/picomatch). The development-only
`@types/picomatch` `4.0.3` package is MIT and dependency-free, with lock integrity
`sha512-iG0T6+nYJ9FAPmx9SsUlnwcq1ZVRuCXcVEvWnntoPlrOpwtSTKNDC9uVAxTsC3PUvJ+99n4RpAcNgBbHX3JSnQ==`.
Adding the direct dependency also deduplicates existing compatible workspace consumers onto 4.0.5;
the audit covered that lock diff. Manifest ranges remain semver ranges, so a future lock update must be
reviewed as new supply-chain evidence. Native glob dependencies and the former Node `path.matchesGlob`
special cases were rejected.

Run the bounded cold/incremental/memory measurement with:

```bash
pnpm benchmark:project
```

The benchmark has two explicitly separate tracks. `deterministicJournalPort` injects a controlled
journal, emits exact project-path or sibling events after fixture mutations, and gates cold,
unchanged, sibling, one-file, nine-file, and isolated process-memory measurements. It proves unchanged
and sibling activity perform zero traversal/read/hash while retaining the snapshot id and root hash.
The real `nativeNodeJournal` track independently classifies the native watcher as advisory,
unavailable, or mixed and proves full verification or the corresponding closed behavior. It never
publishes a native fast-path latency because `fs.watch` is not authoritative. An unavailable or mixed
watcher is a supported degraded capability, not a failed deterministic performance gate. The gate requires
every incremental p95 below 500 ms and isolated peak RSS below 256 MiB on the checked-in fixture;
these are engineering budgets, not cross-machine claims. The measured baseline and native observation
live in `benchmarks/project-graph/README.md`.

## Node types

| Type           | Source                                    | Example id                          |
|----------------|-------------------------------------------|-------------------------------------|
| `skill`        | `packages/core/skills/*/SKILL.md`         | `skill:brainstorming`               |
| `skill` (pack) | `packages/packs/*/skills/*/SKILL.md`      | `skill:pack-server/server-action`   |
| `hook`         | `packages/core/hooks/*/`                  | `hook:no-any-grep`                  |
| `agent`        | `packages/core/agents/*/`                 | `agent:doctrine-critic`             |
| `pack`         | `packages/packs/*/`                       | `pack:pack-nextjs`                  |
| `command`      | `packages/core/commands/*/`               | `command:void-audit`                |
| `profile`      | `packages/core/profiles/*.yaml`            | `profile:typescript`                |
| `workflow-def` | `packages/core/workflows/*/`              | `workflow-def:backlog-autopilot`    |

## Edge kinds

| Kind        | Meaning                                           |
|-------------|---------------------------------------------------|
| `routes-to` | Sequential handoff required by the skill prose    |
| `composes`  | A uses B as a building block (explicit in prose)  |
| `conflicts` | Two skills give contradictory guidance             |
| `overlaps`  | Significant responsibility overlap (>30%)         |

Edges marked `derived` in `model.json` are inferred from file co-location and
naming conventions. Edges marked `declared` come from `relations.graph.yaml`.

## Curated declared edges

`relations.graph.yaml` is the source of truth for semantic edges that cannot
be derived mechanically. Rules:

- Every edge MUST carry `evidence`: the verbatim phrase from the skill prose
  that justifies the edge. No evidence = no edge.
- Node `id` values MUST match real ids in `model.json` (core: `skill:<name>`;
  pack: `skill:<pack>/<name>`). A broken id produces a `broken-route` finding
  that blocks CI.
- Quantity is not the goal. A dozen well-evidenced edges outperforms a hundred
  invented ones.

## Catalog artifacts

Generated file. Do not edit by hand.

Regenerate after any harness change:

```
void-harness graph build
```

Then commit `catalog.v3.json` and its generated `model.json` compatibility
projection. The CI drift gate (`void-harness graph check`) fails if either
artifact diverges from a fresh validated build.

## Audit

```
void-harness graph audit
```

`broken-route` findings block CI. `orphan` and `overlap` findings are advisory
(HITL -- a human decides whether to wire, fuse, or leave them alone).

## Live (P2)

```
void-harness graph live [--port 4317] [--log <legacy-or-canonical.jsonl>] [--history-max 5000]
```

Serves `/catalog.v3.json`, the `/model.json` v1 projection, and a reconnectable SSE projection of canonical mission events
from `.void/runs/*/events.jsonl`. The printed one-shot URL exchanges its token
for a local HttpOnly cookie; model, history, studio data and SSE are protected.
Legacy activation logs remain readable through `--log`. The Studio can also
connect through `VITE_LIVE_URL` after the local auth exchange.

## Behavior (M8)

```
void-harness graph behavior [--since <days>] [--log <path>]
```

Reads the accumulated activation log and reports, advisory (HITL, never blocks):

- **dead-node** — a firing-capable node (skill / agent / command / workflow-def)
  whose bare name never appears in the window. pack/hook excluded (not firing-capable).
- **should-have-fired** — a skill whose declared frontmatter `triggers`
  (`globs` / `extensions` / `tools`) matched a tool-use situation in a session where
  the skill did not fire, counted per session.

A volume guard prints "insufficient data" below ~3 sessions / ~20 events so a sparse
log does not read as "everything is dead". Skills opt in by declaring `triggers` in
their SKILL.md frontmatter. See `docs/specs/2026-06-29-graph-behavior-m8.md`.
