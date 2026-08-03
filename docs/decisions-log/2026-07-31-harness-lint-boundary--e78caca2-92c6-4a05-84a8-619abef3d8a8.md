---
schemaVersion: 1
id: "adr:e78caca2-92c6-4a05-84a8-619abef3d8a8"
createdAt: "2026-07-31T15:50:31.797Z"
title: "The harness excludes .claude from the consumer's lint"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The harness excludes .claude from the consumer's lint

## Context

The harness installs files into `.claude/` that are written in formats their own engines define. One of them is not valid in any standard parser: `skills/autopilot/workflows/autopilot.workflow.js` carries `export const meta` — which makes a parser read it as an ES module — alongside a top-level `return`, which no ES module may contain. It parses as CommonJS and fails as ESM, and ESM is what every modern linter assumes for a `.js` file.

The Workflow engine's contract comes from Claude Code, not from this repo, so the file cannot be rewritten into valid module syntax without breaking execution. Wrapping the body in a function is not available: the engine requires the top-level `return`, and `export const meta` must stay at module scope.

The consequence landed on a consumer project: `bun run lint` went red on code the project does not own, cannot fix, and did not ask for. It was resolved there by excluding `.claude/`, which means every consumer pays the same cost, one at a time, each discovering it mid-task. That is the harness charging its own defect to the people who install it.

## Decision

The harness excludes `.claude` from the consumer's linter itself — appending `!.claude` to a plain-JSON Biome config at install time — and reports the state read-only in `doctor` for installations that already exist.

## Consequences

Positive:

- The defect is paid once, here, instead of once per consumer.
- `doctor` names the condition on existing installs, so the fix reaches projects installed before this change.
- A new test pins the exact set of engine scripts that fail ESM parsing, so adding a second one is a deliberate act rather than a defect discovered downstream.

Negative:

- The harness now writes to a file it does not own. That is intrusive, and it is why the rewrite is narrow: append-only, plain JSON only, never when the file holds comments or trailing commas that a JSON round-trip would destroy.
- Projects on ESLint, oxlint, or a commented `biome.jsonc` get an instruction rather than an edit. Their lint stays red until a human acts.
- Excluding the directory wholesale also excludes any future `.claude/` file that a project *would* have wanted linted.

## Alternatives considered

- **Rewrite the script into valid ESM.** Rejected: the top-level `return` is the engine's contract, and the engine is Claude Code's, not ours. The file would parse and stop working.
- **Rename to an extension linters ignore.** Plausible, and cheaper than editing someone's config, but the Workflow tool resolves the script by path and the behaviour under a non-`.js` extension is unverified here. Rejected as an untestable change to a critical execution path; worth revisiting if the engine documents extension handling.
- **Document the exclusion and let each consumer apply it.** This is the status quo that produced the report. Rejected: it makes the harness's defect a recurring tax on its users, and it is discovered during work rather than at install.
- **Do nothing, on the grounds that the file is valid for its engine.** Rejected: validity for one engine is not validity for the toolchain of the project it is installed into, and the harness chose to put it there.

## Reversal cost

Low. The install-time edit is a single appended array entry, and removing the behaviour leaves the entry behind harmlessly. The `doctor` check is advisory and never blocks.
