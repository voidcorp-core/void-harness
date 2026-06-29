# @voidcorp/harness-graph

The semantic graph kernel for the void-harness. Parses the installed harness
(skills, hooks, agents, packs, commands) and produces `model.json` -- a
snapshot of every node and every edge, both derived and declared.

## Node types

| Type           | Source                                    | Example id                          |
|----------------|-------------------------------------------|-------------------------------------|
| `skill`        | `packages/core/skills/*/SKILL.md`         | `skill:brainstorming`               |
| `skill` (pack) | `packages/packs/*/skills/*/SKILL.md`      | `skill:pack-server/server-action`   |
| `hook`         | `packages/core/hooks/*/`                  | `hook:no-any-grep`                  |
| `agent`        | `packages/core/agents/*/`                 | `agent:doctrine-critic`             |
| `pack`         | `packages/packs/*/`                       | `pack:pack-nextjs`                  |
| `command`      | `packages/core/commands/*/`               | `command:void-audit`                |
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

## model.json

Generated file. Do not edit by hand.

Regenerate after any harness change:

```
void-harness graph build
```

Then commit the updated `model.json`. The CI drift gate (`void-harness graph check`)
fails if the committed model diverges from a fresh build.

## Audit

```
void-harness graph audit
```

`broken-route` findings block CI. `orphan` and `overlap` findings are advisory
(HITL -- a human decides whether to wire, fuse, or leave them alone).

## Live (P2)

```
void-harness graph live [--port 4317] [--log .void/activations.jsonl] [--history-max 5000]
```

Serves the model + a Server-Sent Events stream of activations (written by the
`activation-meter` hook) for the graph-studio live layer. Data-only: routes are
`GET /model.json`, `GET /history` (bounded), `GET /events` (SSE). The studio is a
separate app that connects via `VITE_LIVE_URL`. See
`docs/specs/2026-06-29-graph-live-p2.md`.

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
