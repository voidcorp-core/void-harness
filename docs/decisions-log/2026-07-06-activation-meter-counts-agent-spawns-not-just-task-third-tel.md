---
date: 2026-07-06
title: "activation-meter counts `Agent` spawns, not just `Task` (third telemetry blind spot)"
---

## 2026-07-06: activation-meter counts `Agent` spawns, not just `Task` (third telemetry blind spot)

Context: the activation-meter classified an agent spawn only when `tool_name == "Task"`,
the stock Claude Code name. This harness exposes the spawn tool as `Agent`, so every agent
launch fell through to `kind: tool, name: "Agent"` and no `kind: agent` event was ever
recorded. Consequence: every `agent:*` node was permanently `dead` in behavior/cost, not
because the agents are unused but because the meter never saw them fire (13 `Agent` tool
events sat mislabeled in one local log while all five agent nodes read dead).

Decision: accept both names (`$tool == "Task" or "Agent"`, `Task|Agent)` in the jq-less
path). No credible alternative -- this is a join-key bug of the same family as the workflow
`scriptPath` fix (2026-07-04, Decision 2), logged here only because it materially corrects an
earlier read: the consumer report's "specialized agents never spawned" signal
(code-explorer, doctrine-critic, migration-planner, silent-failure-hunter,
type-design-analyzer) was a measurement artifact, not real under-use. Do not conclude "these
agents are dead / should be trimmed" from pre-fix telemetry.
