---
schemaVersion: 1
id: "adr:01f1124b-0981-4dba-be79-31fa7c276a2d"
createdAt: "2026-09-12T14:55:33.253Z"
title: "Keep diagnostic counts outside project graph identity"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Keep diagnostic counts outside project graph identity

## Context

A local watcher can become unavailable without a source edit. ProjectGraph put
its total diagnostic count in root data, so an extra journal-unavailable report
changed the sealed graph hash. On an already partial project, neither content nor
observation state changed, yet the durable knowledge freshness check failed.

## Decision

Keep diagnostic counts in build reports, outside semantic graph identity, while
retaining observation state in both the graph and durable knowledge envelope.

The knowledge checker reports an observation-state difference before comparing
content. It still refuses that difference, including fresh to degraded. Build
issues, cache publication guards and query completeness rules are unchanged.

## Consequences

Positive:

- Equal content and equal trust state have equal identity despite diagnostic noise.
- Watcher failure stays visible and cannot authorize cache publication.

Negative:

- Existing knowledge artifacts require one regeneration to remove the old field.
- Fresh/degraded transitions still refuse freshness verification; this decision
  does not certify unavailable observation capabilities or redesign state semantics.

## Alternatives considered

- Ignore all state and diagnostics during comparison: rejected because it could
  accept a graph whose observation guarantees deteriorated.
- Filter journal-unavailable from the count: rejected because other operational
  diagnostics would retain the same accidental coupling to content identity.
- Regenerate on every mismatch: rejected because it records fluctuating runtime
  conditions instead of repairing their inappropriate role in identity.

## Reversal cost

Low: restore root metadata and regenerate knowledge artifacts. No source graph
entity, relationship, cache permission or execution authorization is removed.
