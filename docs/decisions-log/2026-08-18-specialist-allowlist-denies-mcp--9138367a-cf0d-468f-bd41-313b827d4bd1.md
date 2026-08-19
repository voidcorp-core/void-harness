---
schemaVersion: 1
id: "adr:9138367a-cf0d-468f-bd41-313b827d4bd1"
createdAt: "2026-08-18T17:02:33.000Z"
title: "The tools allowlist already denies MCP: there was no degradation"
status: accepted
deciders: ["folpe"]
supersedes: ["adr:5e488cf1-e5f2-42f3-8827-4cc138c0c075"]
---

# The tools allowlist already denies MCP: there was no degradation

## Context

The record this supersedes concluded that Claude agent frontmatter "cannot deny
unknown inherited MCP tools", accepted a permanent degraded state for the
specialist team, and had `doctor` print that on every run. The belief was
reasonable: a read-only critic must not reach a tracker or any other connected
server, and a list of allowed tools does not obviously say anything about tools
nobody enumerated.

It is not what the runtime does. The official subagent documentation describes
this exact shape:

> This example uses `tools` to allow only Read, Grep, Glob, and Bash. The
> subagent can't edit files, write files, or use any MCP tools.

An explicit `tools` line is an allowlist, and an allowlist excludes what it does
not name, MCP servers included, discovered or not. Every compiled specialist has
carried `tools: Read, Grep, Glob` plus a `disallowedTools` line since it was
first generated. The isolation the record wanted was in place before the record
was written.

What the advisory produced instead was a month of a message nobody could act on,
and then a mechanism built to silence it: a `PreToolUse` hook injected into every
specialist's frontmatter, spawning a process per tool call, with `doctor` newly
requiring a marker string in a file. That work was written, reviewed, and
discarded on reading the documentation. It is the cost of an unverified premise,
and it is the reason this record quotes its source instead of asserting.

## Decision

Claude specialists are `available`, not degraded, and declare no limitation about
inherited MCP tools. The advisory is removed at its source rather than silenced,
and nothing is injected into a shipped asset.

## Consequences

Positive:

- `doctor` stops printing a limitation that does not exist. An advisory nobody
  can act on is printed until it stops being read, and it invites exactly the
  kind of mechanism it invited here.
- The isolation stays declarative: it is a property of the agent definition, not
  a script that runs, can fail, or costs a process per tool call. That also
  survives being run as an agent-team teammate, which honours `tools` and `model`
  and drops other frontmatter.

Negative:

- The guarantee now rests on every specialist actually declaring `tools`. All
  twenty-one do today, and nothing yet fails when one does not. That check is
  worth having and is not in this change.
- Five hand-authored agents list `Bash`, so they are MCP-isolated but not
  capability-isolated, and the enforcement floor blocks no network access. Saying
  "read-only" of those five is looser than it sounds, and it is a larger opening
  than the one this record closes. It is filed separately rather than settled
  here, because it is a design question about what a critic needs, not a
  correction of fact.

## Alternatives considered

- **Keep the advisory and ship the deny hook.** Rejected on the documentation:
  it protects against nothing, costs a process spawn per tool call, injects an
  inline `node -e` into a file people read as configuration, and makes `doctor`
  assert a marker string rather than a behaviour.
- **Add `disallowedTools: mcp__*` as belt and braces.** Rejected for now: the
  documented `disallowedTools` examples name concrete tools, pattern support is
  not established, and a line that may silently match nothing is worse than no
  line because it reads as a guarantee. Worth revisiting if the syntax is
  documented.
- **Edit the superseded record.** Rejected: it was written in good faith and is
  the only account of why the degraded state was once believed correct. The error
  is part of the history worth keeping, and superseding keeps both halves.

## Reversal cost

Low. The safety contract is one frozen object and the advisory is one branch; a
future runtime change that genuinely removes the allowlist guarantee would be
recorded the same way, with its source quoted.
