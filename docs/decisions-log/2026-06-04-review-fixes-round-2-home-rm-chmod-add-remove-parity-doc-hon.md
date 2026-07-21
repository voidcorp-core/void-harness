---
date: 2026-06-04
title: "review fixes round 2 — $HOME rm/chmod, add/remove parity, doc honesty"
---

## 2026-06-04: review fixes round 2 — $HOME rm/chmod, add/remove parity, doc honesty

Context: a second self-review found more real defects.

Decisions:
- **block-dangerous-bash** missed home-rooted targets. Factored shared target
  patterns: HOME_ROOT `(/ ~ $HOME ${HOME})` each with an optional trailing `/`
  and/or `*`, so `$HOME/`, `${HOME}/`, `~/*`, `$HOME/*` and the chmod/chown
  equivalents now block, while `$HOME/projects`, `~/.cache/x`, `/tmp/x`, `build/*`
  still pass. Tests added for each; the chmod check now requires a recursive flag
  AND a home/root target.
- **add / remove** patched only CLAUDE.md, leaving AGENTS.md stale and breaking
  the sister-doc parity rule. Both now call patchAgentsMd too. Regression test
  added (`test/cli/add-remove-parity.test.ts`).
- **ARCHITECTURE.md** overclaimed that `init` wires the sync pre-commit hook into
  consumer projects (it does not). Reworded: the parity gate is a harness-repo
  concern (`.githooks/` + CI); `init`/`add`/`remove` keep the two consumer docs in
  parity, and a consumer opts into the hook by pointing `core.hooksPath` at the
  shipped `.githooks/`.
- **capture-rule** shipped without an audit note (violating "one audit note per
  skill"); backfilled `plans/skill-audits/capture-rule.md` and added its
  decision-matrix row.

Known debt (NOT fixed this round, tracked): 27 pack skills lack a co-located
`.source` file. Their sourcing is recorded in their `plans/skill-audits/*.md`
notes. Resolution pending a deliberate choice: backfill each `.source` from its
audit note, or amend the sourcing rule to make `.source` mandatory for core
skills + agents and satisfied-by-audit-note for pack skills. Not auto-generated to
avoid fabricated attributions.
