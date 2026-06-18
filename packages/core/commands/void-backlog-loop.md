---
description: Launch the void-harness autonomous backlog loop (one fresh session per Linear ticket, live flux, subscription-billed). Opt-in, never a default.
argument-hint: "[--max N] [--target State] [--scope ...] [--auto-merge] [--dry-run]"
allowed-tools: Bash(void-harness:*), Bash(npx:*)
---

Run `void-harness backlog-loop $ARGUMENTS` in the project root (fall back to
`npx @voidcorp/harness backlog-loop $ARGUMENTS` only if the `void-harness` CLI is
not on PATH).

This drains a curated Linear backlog one ticket at a time, each in a fresh
`claude -p` session (true context reset), with a live append-only flux and a
dense final summary. Token usage is billed to the user's Claude subscription
(API credentials are stripped from the worker env unless `--allow-api`).

It is long-running and opt-in. Before launching, remind the user this only runs
on purpose and that they own the PR merge afterwards. If they passed no
arguments and want to see what would happen first, suggest `--dry-run` (or a
small `--max`). On a first run with no `.void/autonomous.json`, the CLI opens a
short setup wizard.

When it finishes, relay the final summary: tickets completed, decisions/ADRs,
PRs to merge, and any blocked tickets. Do not merge anything yourself — that is
the human's gate.
