---
date: 2026-07-10
title: "code-review enumeration → native /code-review; second opinion → standalone codex CLI (DEV-399)"
---

## 2026-07-10: code-review enumeration → native /code-review; second opinion → standalone codex CLI (DEV-399)

The gstack-teardown inventory (DEV-395) found the `code-review` skill still composing gstack `/code-review`
(enumeration) and gstack `/codex review` (second opinion) as live dependencies — the skill framework was
native, but its tools were gstack's. First of three unblocking tickets (DEV-399/400/401) before the teardown.

Decision:
- **Enumeration → Claude Code's native `/code-review`** (low/medium/high/max/ultra, `--comment`/`--fix`). A 1:1
  replacement that post-dates the skill's authoring; no capability lost, one fewer external dependency.
- **Second opinion → the standalone `codex` CLI** (`~/.local/bin/codex`), kept for its cross-model value.
  Rejected: dropping it (loses the different-model-family coverage that is its entire point) and substituting
  native `/code-review ultra` (still Claude family, not cross-model). The CLI is installed independently of
  gstack and survives the teardown, so the capability is preserved gstack-free.

Scoped tight: `/benchmark` (perf dimension) and `/ship` (downstream) stay gstack-composed here, owned by
DEV-401 and DEV-400 respectively — ticket-boundary discipline, not an oversight.

Why: the review framework never needed gstack; only its enumeration tool did, and Claude Code now ships a
native equivalent. Repointing removes a teardown blocker while keeping the cross-model second opinion that
makes the review "two thirds" rather than one model's blind spots.
