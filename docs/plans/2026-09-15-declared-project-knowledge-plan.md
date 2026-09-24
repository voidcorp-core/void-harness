---
title: Declared project knowledge and why
date: 2026-09-15
status: in-progress
spec: docs/specs/2026-08-17-project-knowledge-system.md
---

# Declared project knowledge and why

DEV-610 is executed inside the approved six-ticket programme. The coordinator
owns tracker state, fresh independent review, full verification and integration.
This worktree is commit-only. No accepted decision is edited.

## Contract and disposition

Only decision/invariant nodes and decided_by/constrained_by/verified_by relations
are added. The graph package cannot depend on the CLI parser. The preparatory
brief incorrectly named an existing validation dependency: the package has none.
The coordinator confirmed pure explicit validators following cache-codec/schema,
with the same shape, type, field, reference and resource guarantees. No dependency
or lockfile change is needed.

The coordinator approved widening ownership to model/v3/ids.ts, ids.test.ts,
schema.ts and schema.test.ts because the existing kind grammar refused the exact
relation names. Only binary relations admit these three spellings; node and
hyperedge grammars and legacy safe IDs remain unchanged. The planned footprint
is retained separately from the observed diff.

Existing legacy ADRs use date/title: preserve the CLI's legacy filename identity
and accepted status in the graph extractor, without importing that CLI module or
inferring status from prose. Modern declarations preserve ID, status and supersedes.

## Vertical slices and proofs

1. Behavioral red tests for declared provenance, implementation/test/decision links,
   isolated and superseded ADRs, duplicate IDs, missing frontmatter and references.
2. YAML boundary with strict keys, no aliases or custom resolvers, bounded iterative
   node inspection, explicit data validation, safe observed reference resolution.
3. Existing scanner admits only direct invariant YAML files, retaining all other
   hidden exclusions and descriptor/root/journal safeguards. Cached extraction
   persists declarations and bumps identity so old extraction cannot look current.
4. why validates one file before build; observes incrementally; renders declared
   evidence, incomplete/absent states, source hashes and bounded diagnostics.
5. Consumer CLI tests cover help/invalid arguments without I/O and persisted
   knowledge followed by changed/deleted source declarations. Compare all real ADRs
   to observed decision nodes and run why against this repository read-only.
6. Relevant graph accuracy, cache and filesystem suites; affected types/lint;
   generated assets through generators. All explicit checks use cockpit RUN.

## Source grounding and limits

Installed yaml version: 2.9.0. Official options and Document sources read before
new usage: https://github.com/eemeli/yaml/blob/v2.9.0/src/options.ts and
https://github.com/eemeli/yaml/blob/v2.9.0/src/doc/Document.ts. Strict/unique/string
keys, core 1.2 schema, no known extended tags/merge, no source excerpts in errors;
toJS maxAliasCount 0 after at most 64 levels and 10000 parsed nodes. Existing
1 MiB file and aggregate scan bounds stay authoritative. References are bounded
to 256 per field and resolved without filesystem reads. New graph allocations
retain envelope ceilings; aggregate diagnostics and terminal rendering are bounded
and announce truncation. No new CLI budget flag or machine-output format.

## Review and completion boundary

Seven preparatory specialists passed with no findings. Their frozen envelope
hash check and subsequent file read were separate and non-atomic, not inline;
this transport limitation remains explicit. They reviewed preparation, not code.
Root will run the fresh implementation panel and complete union verification.
The writer supplies real red/green evidence and dogfood output at that boundary.

## Observed implementation evidence

Strict red commits precede production: 11 declaration cases initially failed;
6 relation grammar cases failed; the legacy ADR case failed independently; the
aggregate diagnostic case observed 10496 messages against the 10000 ceiling; a
reserved hidden-directory name represented as a file was initially admitted.
CLI unit tests first reported missing modules/help, and the previous executable
reported `unknown command: why` in the consumer regression.

The targeted graph/model/CLI run passed 37 files and 339 tests, including the
11-case accuracy corpus, 47 builder cases, 11 filesystem cases and 2 dedicated
cache-boundary cases. After helper extraction, 34 affected tests and both consumer
CLI tests passed. Both affected packages passed typecheck. Targeted lint has no
errors (existing index-signature access suggestions remain informational).
`pnpm derive` completed; decision validation found 211 valid decisions and no
accepted-document mutation against the admitted base. `git diff --check` passed.

Real repository dogfood observed 211 ADR files and 211 decision nodes, with no
missing source, incorrect provenance or changed source bytes. The build was partial
because its ordinary scan reported oversized-file and unresolved-import issues;
there were no knowledge diagnostics. It indexed 2226 files, used a sampled peak
heap delta of 248674840 bytes and took 16301 ms for that observation. These are
observations, not throughput guarantees.

`why packages/harness-graph/src/project/build.ts` printed the new proposed decision
with declared origin, confidence 1 and its exact source hash. `why README.md`
printed `No declaration found for README.md; absence is not established.` Both
outputs led with the partial warning. Neither operation wrote knowledge.json.
Final independent review and the full integration suite remain coordinator-owned.
