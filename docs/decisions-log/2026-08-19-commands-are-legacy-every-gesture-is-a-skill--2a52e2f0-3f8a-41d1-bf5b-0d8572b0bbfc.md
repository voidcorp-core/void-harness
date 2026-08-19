---
schemaVersion: 1
id: "adr:2a52e2f0-3f8a-41d1-bf5b-0d8572b0bbfc"
createdAt: "2026-08-19T10:42:00.000Z"
title: "Commands are a legacy format; every gesture is a skill"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Commands are a legacy format; every gesture is a skill

## Context

The harness shipped six slash commands under `packages/core/commands/`. Two of them,
`checkpoint` and `autopilot`, also existed as skills, and the palette offered each name twice
with two descriptions that had already drifted apart. That was the visible symptom.

The cause is that two formats answer the same invocation. Claude Code's own documentation states
they were merged: a file at `commands/<name>.md` and a skill at `skills/<name>/SKILL.md` both
create `/<name>` and work the same way. The skill frontmatter carries everything the command had
— `argument-hint`, `allowed-tools`, `model` — plus `paths`, `disable-model-invocation` and a
directory for supporting files.

Two facts decided it. First, `runtime-assets.ts` staged `commands/` to `.claude/commands/` and
nowhere else, so every gesture living there was Claude-only by construction, while the harness
targets Claude, Codex and Kimi, all three of which read the Agent Skills format. Second, the
format was already failing in the field: `.claude/commands/void-graph.md` shipped an
unsubstituted plugin-root variable, which a runtime expands for plugin assets only, so on a local
install it stayed literal and pointed at nothing.

The commands existed for a reason that had expired. The 2026-06-04 record says it plainly: "the
plugin wired only PreToolUse hooks and shipped zero slash commands, leaving in-session ergonomics
unused". At that point a skill was not invocable from the keyboard.

`void-feedback` was a separate defect wearing a different name: a copy of `learn` branch B, same
agnostic and harness-worthy bar, same `gh issue create --repo voidcorp-core/void-harness`, same
HITL. A name-collision rule cannot see that one, because the names differ.

## Decision

`commands/` is removed from every shipped surface and from the installer. `void-doctor`,
`void-audit` and `void-graph` become skills carrying `disable-model-invocation: true`, and
`void-feedback` is folded into `learn`, which already owned the flow.

## Consequences

Positive:

- Codex and Kimi receive the four gestures for the first time, through `.agents/skills/`.
- `disable-model-invocation: true` states declaratively what the command format could only
  imply: these are typed by a human, never guessed from a description match.
- One format means one place to look, and one description per gesture.
- The plugin-root variable disappears from doctrine: the three CLI gestures go through
  `void-harness <sub>`, which resolves on every channel.

Negative:

- `/void-feedback` disappears as a name. It is the only surface removed by this decision; the
  flow survives whole in `learn`, whose `when_to_use` now carries the feedback trigger phrases.
- A consumer who wrote their own `.claude/commands/` keeps it: the removal covers harness-owned
  assets only, which is what the install receipt already scopes.

## Alternatives considered

- **Keep the commands for their `allowed-tools`.** Rejected on the facts: skill frontmatter
  carries `allowed-tools` too, and the field was the only capability anyone could name.
- **Keep `void-feedback` as a thin skill delegating to `learn`.** Rejected because it recreates,
  under a new format, exactly the wrapper removed from `checkpoint` and `autopilot` the same day:
  two surfaces for one gesture, drifting the moment one is edited.
- **Rename the commands to avoid the collision** (`run-checkpoint` and such). Rejected: it
  violates the naming rule, which says a skill is named by what someone would type looking for
  it, and it leaves two answers to one question.

## Reversal cost

Low. Restoring a command is one markdown file and one staging call. What would be expensive is
the state this leaves behind if reversed carelessly: two formats and two descriptions per
gesture, which is what produced the four `/checkpoint` entries in the first place.
