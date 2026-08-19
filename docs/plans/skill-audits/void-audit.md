# Skill audit — `void-audit`

Converted from the slash command `packages/core/commands/void-audit.md` on 2026-08-19. Original to
void-harness: it wraps this repository's own CLI, so there was never an upstream skill to distil.

## Why it was a command, and why it is not any more

It shipped as a command on 2026-06-04, under a decision that reads plainly today: "the plugin
wired only PreToolUse hooks and shipped zero slash commands, leaving the rest of the lifecycle
(and in-session ergonomics) unused". At that point a skill was not invocable from the keyboard,
so a command was the only way to give a human a gesture to type.

Two things changed. Claude Code merged the formats — a file at `commands/<name>.md` and a skill
at `skills/<name>/SKILL.md` both create `/<name>` and work the same way — and the skill
frontmatter grew everything the command had plus `paths`, `model` and
`disable-model-invocation`. Meanwhile the harness became multi-runtime, and neither Codex nor
Kimi has the command concept at all: `commands/` is staged to `.claude/commands/` and nowhere
else, so every gesture living there was Claude-only by construction.

## What the conversion preserved

The name, so nothing a human types changes. The `allowed-tools` grant. The instruction to
report rather than to act, which is the load-bearing rule for all three.

## What it gained

`disable-model-invocation: true`. These are gestures a human types; a health check or an audit
that fires because a description matched arrives unrequested and unread. The skill format is the
first one that can say so declaratively.

Codex and Kimi receive it, for the first time, through `.agents/skills/`.

## What was rejected

Keeping a thin command that delegates to the skill. That is exactly the wrapper removed from
`checkpoint` and `autopilot` the same day: two surfaces for one gesture, each with its own
description, drifting apart the moment one is edited.

## Boundary with its neighbours

`void-doctor` asks whether the harness is wired. `void-audit` asks whether its parts still
earn their place. `void-graph` shows the shape they sit in. `verify` is unrelated: it proves
one unit of work, not the harness that guards it.
