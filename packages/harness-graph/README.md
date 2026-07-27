# @voidcorp/harness-graph

The semantic graph kernel for void-harness. CatalogGraph, MissionGraph,
EvidenceGraph, and the future ProjectGraph share a strict node-link envelope at
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
