---
schemaVersion: 1
id: "adr:2c00ff97-8fdb-4110-a839-715b0e75e37a"
createdAt: "2026-07-27T13:31:40.300Z"
title: "Route stack profiles by file-owning project"
status: accepted
deciders: ["voidcorp"]
supersedes: []
---

# Route stack profiles by file-owning project

## Context

Consumer monorepos commonly contain several stacks. A root-wide dependency union makes an Expo
package activate mobile guidance for a web change, or a database package activate migration
guidance for an unrelated CSS change. Profile selection also needs a reproducible negative result
and must not present guidance as current when the detected version is unknown or uncovered.

## Decision

Route each changed file through the longest matching workspace owner, inherit only root
technologies into that owner, and bind every applicable, not-applicable, or degraded profile
decision to the normalized project/file inputs with a SHA-256 proof.

## Consequences

Positive:

- Unrelated workspace stacks cannot contaminate a mission.
- A negative decision is inspectable and deterministic rather than an implicit omission.
- Expired, unknown-version, and out-of-range guidance requests official-source review.

Negative:

- Workspace detection supports only bounded one-level patterns and explicit paths.
- Project profile authors must declare versions, selectors, official sources, and expiry metadata.
- Moving a file between packages can deliberately change its active profile set.

## Alternatives considered

- Union every dependency in the repository. Rejected because it over-routes specialists and
  stack patterns in heterogeneous monorepos.
- Route by extension alone. Rejected because a TypeScript or CSS extension does not identify its
  framework, runtime, or data ownership.
- Let an agent infer applicability from prose. Rejected because the result is not reproducible,
  hash-bound, or safe when context is incomplete.

## Reversal cost

Medium. The YAML catalog is portable and the router is pure, but changing ownership semantics
would invalidate plan hashes and require a schema-versioned migration of stored decisions.
