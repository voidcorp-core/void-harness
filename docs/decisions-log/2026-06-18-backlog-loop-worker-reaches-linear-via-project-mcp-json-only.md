---
date: 2026-06-18
title: "backlog-loop worker reaches Linear via project .mcp.json only"
---

## 2026-06-18: backlog-loop worker reaches Linear via project .mcp.json only

Context: the loop's worker prompt (Step 1) tells each `claude -p` session to use
the Linear MCP to pick a ticket, but the generated `--settings` allowlist
(`AUTONOMOUS_SETTINGS.permissions.allow`) granted no `mcp__*` tool at all. Since
`--permission-mode acceptEdits` auto-approves only file edits and common
filesystem Bash (not MCP), every pick phase was denied unattended (headless
cannot prompt), so the loop could never select a ticket. The only Linear server
present was the developer's interactive claude.ai connector, which a headless
worker cannot authenticate against.

Decision: the worker reaches Linear exclusively through a project-level
`.mcp.json` server keyed `linear`, token-authenticated from the environment.
Three coupled changes:
- `AUTONOMOUS_SETTINGS.permissions.allow` gains exactly `mcp__linear__*` (not
  `mcp__*`): the unattended worker may call the Linear server and nothing else.
- `buildClaudeArgs` passes `--mcp-config <root>/.mcp.json --strict-mcp-config`,
  so the worker sees only the project's declared servers, never the developer's
  interactive connectors (claude.ai, Gmail, Drive, ...). This both fixes the
  observed failure (the worker fixating on the unreachable connector) and
  tightens the unattended-access boundary.
- Preflight fails loud (`hasLinearMcpServer`) when `.mcp.json` lacks a `linear`
  server, rather than spawning a worker that can never pick a ticket.

The loop is thus explicitly coupled to Linear-via-`.mcp.json`; the worker prompt
was already Linear-specific, so the coupling is named rather than hidden. `linear`
is a fixed convention (not configurable) to keep the allowlist a literal and the
surface minimal (Wing Chun economy of means).

Alternatives considered:
- Allow `mcp__*` broadly: one line, but hands an unattended worker every
  connected server (deploys, mailboxes). Rejected — violates deny-by-default.
- Configurable server name (`linearMcpServer` field): more flexible, but adds
  config surface and a derived (non-literal) allow rule for a name that has no
  reason to vary. Rejected as premature.
- Keep relying on the claude.ai connector + add an allow rule for it: the
  connector is absent in headless `claude -p`, so this cannot work regardless.
