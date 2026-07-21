---
date: 2026-06-21
title: "auto-merge is risk-gated and sequential, not a \"deterministic conflict-free cascade\""
---

## 2026-06-21: auto-merge is risk-gated and sequential, not a "deterministic conflict-free cascade"

Context: the first design promised auto-merge with a "deterministic conflict-free
cascade" across stacked PRs. An `/autoplan` review (CEO + Eng + DX, dual Claude +
Codex voices) found this infeasible: `gh pr merge --squash` rewrites the parent
SHA, so a child rebased onto it conflicts whenever the parent touched shared
lines; GitHub does not auto-retarget a child unless the base branch is deleted;
and the existing `reconcile` is an LLM subagent, not deterministic.

Decision (binding, supersedes the cascade promise in the original spec):
- **No "guarantee conflict-free".** Stacked merges run **strictly sequentially**:
  wait for the parent to fully merge, rebase the single next child, **human gate
  on conflict** (never silent LLM resolution). A state machine **classifies**
  (conflict / stale / protection / CI / merge-queue) and **blocks safely** with an
  actionable report; tested against an ephemeral git remote, not arg snapshots.
- **Risk-gated auto-merge.** `--auto-merge` to `develop`/`main` arms only for a
  **low-risk** cluster (small diff, non-UI/security/migration, owned paths, not a
  stack root); risky clusters and stack roots get a PR for a human to merge.
- **Unknown branch protection is fatal** under `--auto-merge` (was a warning).
- **Worktree always** — one cluster worktree even for sequential work, per-ticket
  in parallel (crash / dirty-state safety); the earlier "worktree only when
  parallel" regressed safety.
- **Crash-resume reconciles remote state** (`gh pr list`, SHA, base, checks) with
  atomic writes, instead of replaying a local cursor.

Why: branch protection proves the tests passed, not that the change is right; the
review made the auto-merge blast radius explicit and replaced an impossible
mechanism with a safe, testable one. The operator's choices at the review gate:
keep the clean deletion (no alias), reserve a future headless backend, restrict
auto-merge to low-risk clusters, and always use a worktree.
