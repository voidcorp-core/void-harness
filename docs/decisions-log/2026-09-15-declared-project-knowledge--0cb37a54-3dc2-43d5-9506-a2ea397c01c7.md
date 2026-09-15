---
schemaVersion: 1
id: "adr:0cb37a54-3dc2-43d5-9506-a2ea397c01c7"
createdAt: "2026-09-15T17:35:48.427Z"
title: "Keep declared project knowledge inside the observed graph"
status: proposed
deciders: ["Folpe"]
supersedes: []
affects: [packages/harness-graph/src/project/build.ts, packages/cli/src/commands/why.ts]
---

# Keep declared project knowledge inside the observed graph

## Context

DEV-610 requires the graph to explain declared intent without promoting inferred
facts. Existing ADRs include both the modern ID-based format and the historical
date/title format. The graph package has YAML but no schema library dependency.
The existing graph kind grammar also excludes the three requested relation names.

## Decision

Read decision and invariant declarations through the existing bounded project
filesystem and extraction cache. Validate explicit data shapes with pure bounded
validators, matching the graph package's existing boundary convention. YAML stays
in the extractor; the graph never imports the CLI decision parser. Existing legacy
ADR identity remains `legacy:<filename without .md>`, with accepted status; no status
is read from prose. Modern IDs and supersession remain declared data.

Add decision and invariant nodes and exactly decided_by, constrained_by and
verified_by binary relations. Admit these three spellings through a shared binary
relation predicate; node and hyperedge kind grammar remains unchanged. Provenance
on the new nodes and relations names the declaring source bytes with SHA-256,
origin declared and confidence 1. Paths resolve only against observed active files.
Duplicate identities and dangling references are diagnostics, never fabricated nodes.

why observes the incremental builder each time and renders bounded inert text.
It does not read knowledge.json as freshness evidence or write that artifact.
Incomplete observation and truncated reports explicitly withhold exhaustive absence
claims. Existing seven query implementations retain their semantics.

## Consequences

The same scan, descriptor and journal boundaries protect code and declarations.
Only the exact invariant directory is admitted under hidden knowledge. An extraction
version change invalidates caches created before declaration extraction. Sources,
including accepted ADRs, remain untouched. Invalid declarations retain source-level
diagnostics; finite parser, reference, graph and rendering limits prevent unbounded
expansion and name truncation where data must be omitted.

## Alternatives considered

- Import the CLI parser into graph: reverses package dependency direction.
- Add a schema dependency: unnecessary for two small shapes and outside this ticket.
- Replace underscores with hyphens in the domain: changes the approved vocabulary.
- Permit underscores globally: expands unrelated node/hyperedge kinds without use.
- Trust a persisted knowledge artifact: loses declaration freshness and diagnostics.
- Infer affected code from prose or folders: claims intent that nobody declared.

## Reversal cost

Moderate. Remove the extractors and why surface, regenerate projections, and bump
extraction identity again. Existing sources need no migration; readers that use the
three added relation kinds must be considered before removing the public vocabulary.
