---
schemaVersion: 1
id: "adr:612dcb9b-5bcb-4cd2-9e2d-972b9e4b5a6d"
createdAt: "2026-07-27T15:04:22.084Z"
title: "Use bounded native extraction and trusted-port ProjectGraph caching"
status: accepted
deciders: ["voidcorp"]
supersedes: []
---

# Use bounded native extraction and trusted-port ProjectGraph caching

## Context

Autonomous context selection needs imports, symbols, tests, workspaces, and ownership without making
Graphify, an account, or a background service mandatory. The extraction boundary reads hostile local
paths and mutable Git state, while repeated builds must stay fast enough for an interactive loop.
Path-derived identities also make renames ambiguous unless an authoritative source proves continuity.

## Decision

Build ProjectGraph through replaceable extraction and I/O ports, use the TypeScript Compiler API for
TS/JS syntax and module resolution, and cache per-file extraction by SHA-256. The default Node cache
adapter neither reads nor writes repository cache bytes: a repository author can reseal a self-hash,
and portable Node cannot provide descriptor-relative creation and rename without a parent-swap race.
Use a bounded process-scoped LRU memory cache as the builder default, and report a complete build as
degraded when its selected cache port cannot publish. Let callers that own a safe durable storage
boundary provide a prepare/commit/finalize port keyed by immutable canonical path/device/inode
identity. Commit registers an invisible pending candidate. Finalize invokes one
canonical root-identity and change-journal validation and, when both still match, immediately
publishes with compare-and-swap and no intervening await; abort only releases unpublished state. It
does not re-read or re-hash the tree after the build's verification pass. Treat the portable Node
`fs.watch` journal as advisory because event absence, completeness, and rename pairs are not portable
proofs. Advisory or unavailable journals force a bounded source verification and cannot authorize
unchanged or delta reuse. Reserve zero-traversal reuse for caller-injected journals that explicitly
declare an authoritative, loss-detecting contract; Node rejects that declaration unless the caller
also injects the watch port. Bind the content-addressed `observed-content-v1` token to the
canonical root key and root/parent device/inode, root-entry journal generation, the observed source
membership and every path/device/inode/size/mtime/ctime/content-hash tuple, Git evidence, and extractor
version. The ordinary file-change generation gates cache acceptance and publication without becoming
part of the content token. Expose the token in the build result and graph root. It describes observed
content, not exact-current-at-return; mutation after observation belongs to the next observation and
cannot authorize reuse without a compatible accepted journal generation. Never trust a cached token as
freshness evidence, and keep replaceable filesystem ports partial unless they provide the required
inspection and generation-validation capabilities.
Measure the incremental performance contract with an injected deterministic journal port that emits
the exact changed paths after each controlled fixture mutation. Keep this performance gate separate
from a real native-watcher capability track. The native track always remains advisory, never publishes
fast-path latency, and records advisory, unavailable, or mixed behavior. Unavailable or mixed samples
must prove their explicit degraded/partial fallback without being combined with deterministic
measurements or failing CI solely for capability.
Include a bounded in-memory implementation for session-local reuse. Bind cache reuse to the
producer version and a canonical payload hash. Persist tombstones, proven lineage, and the compared Git
HEAD plus each rename proof HEAD/ref, composing lineage through at most 64 acyclic hops. Treat Git
rename evidence as the sole authority for `previous-id`; otherwise model a deletion and
a new identity. Resolve Git from trusted absolute locations with a minimal environment, block protocols,
and neutralize hooks plus repository-local clean/process filters. Treat any
degraded Git capability, path-identity check, or mismatch between the validated `HEAD` reads bracketing
collection as partial evidence that cannot replace the last green cache. Pin every commit-dependent
command to the initial object ID so a `HEAD` ABA cannot combine evidence from different commits.

## Consequences

Positive:

- The default graph stays local, cross-platform, account-free, and free of native dependencies.
- An unchanged accepted authoritative journal generation reuses bounded extraction records with zero
  traversal, extraction reads, hashing, or AST traversal.
- Workspace package manifests resolve ordinary package imports without requiring path aliases.
- Root workspace include/exclude patterns decide which child manifests may enter topology.
- Compiler-owned config parsing preserves `baseUrl` and `paths` resolution origins across string and
  ordered-array extends.
- ESM and bounded JavaScript CommonJS export surfaces are represented explicitly.
- Provenance and the Graph v3 rootHash make stale or tampered topology detectable.
- Exact bounded descriptor reads, root/canonical-parent generation, content observation, payload-hash, and independent
  Git-availability checks fail closed.
- The default adapter cannot mutate repository storage through a path-swap race; cache persistence is
  an explicit trust-boundary decision.
- Repository-controlled cache bytes cannot inject topology or authorize skipped source reads.
- The default advisory watcher and an unavailable watcher force complete bounded verification;
  capability lost after extraction begins prevents publication and leaves partial or degraded evidence
  according to the last validated phase.
- Partial scans retain the last green cache and force an honest source fallback.
- Reproducible cold, incremental, and memory budgets are gated without calling a controlled journal
  native; the real watcher remains independently observable on every CI platform.
- Parser and infrastructure adapters can be replaced without changing the ProjectGraph domain contract.

Negative:

- The runtime package now carries TypeScript as a JavaScript dependency.
- Cold, uncertain, advisory, and unavailable generations perform bounded directory traversal and
  content hashing; only authoritative changed generations inspect and hash their bounded coalesced
  paths. Every build performs bounded Git inspection.
- The default memory adapter does not persist across processes, so durable reuse requires a trusted
  caller-owned port.
- Native fast-path proof remains environment-dependent; unavailable or mixed watcher capability has no
  native latency baseline even when the deterministic performance gate passes.
- Path-based IDs require tombstones plus an explicit relation to describe proven renames.

## Alternatives considered

- Require Graphify or another graph service. Rejected because the base install must remain local,
  free, and account-free; optional import and comparative benchmarks remain later work.
- Parse TS/JS with regular expressions. Rejected because syntax recovery, exports, dynamic imports,
  aliases, and extension substitution require the language grammar and standard module resolver.
- Key identity from content hash alone. Rejected because identical generated or copied files would
  collapse, while ordinary edits would incorrectly create new logical identities.
- Rewrite cache files in place. Rejected because a crash or concurrent mutation could publish a
  truncated cache and turn incomplete topology into a false green.
- Publish with a path-based temporary file and same-directory rename. Rejected because Node lacks
  portable descriptor-relative file creation and rename; revalidation cannot eliminate the final
  parent-swap window.
- Trust a repository cache after validating its self-hash. Rejected because an attacker who controls
  the payload can recompute the hash and inject extraction records.

## Reversal cost

Medium. The ports isolate replacement of TypeScript, Git, filesystem, or cache adapters. Removing
ProjectGraph itself requires callers to retain source fallback and discard the versioned local cache;
no consumer source or remote data migration is involved.
