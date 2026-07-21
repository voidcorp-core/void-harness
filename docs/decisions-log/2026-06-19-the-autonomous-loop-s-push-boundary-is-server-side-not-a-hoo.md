---
date: 2026-06-19
title: "the autonomous loop's push boundary is server-side, not a hook (issue #17 cluster A)"
---

## 2026-06-19: the autonomous loop's push boundary is server-side, not a hook (issue #17 cluster A)

Context: the autonomous backlog-loop (`autonomous-backlog-loop`) let each worker
push its branch and open its PR, with a planned `git push` PreToolUse hook as the
guard against a push to a protected branch. The autoplan (3 Claude voices + Codex
gpt-5.5 xhigh) found the guard is at the wrong layer: the worker also holds
`Bash(node:*)`/`Bash(npm:*)`/`Bash(npx:*)`, so `node -e "execSync('git push
origin HEAD:main')"` makes PreToolUse see `node`, not `git push` — a
string-matching hook guarding an agent with arbitrary code execution is
bypassable by construction.

Decision: move the boundary off the hook.
- **Server-side branch protection** on the base (`main`/`master`) is the durable
  boundary — the remote refuses a non-PR push regardless of what the worker runs.
  The orchestrator probes it at preflight (`gh api .../branches/<base>/protection`)
  and hard-refuses a confirmed-unprotected base.
- **The worker is commit-only.** `git push` and `gh pr` are removed from its
  allowlist; the trusted orchestrator pushes (explicit refspec, no force) and
  opens the PR. The capability is removed, not gated.
- **Per-ticket worktree isolation** so a worker's branch never moves the main
  HEAD; run-scoped, pruned at start, removed in a finally.
- `block-protected-push` stays as a **secondary net**, not the boundary.
- A4: the git allowlist is trimmed to the non-destructive subset (`cherry-pick`,
  `rebase --onto`); `git apply` was dropped (arbitrary write past the Edit/Write
  protect-sensitive-files gate). Command-execution rebase flags (`--exec`,
  `--rebase-merges`, `--strategy-option`, `--unsafe-paths`) are blocked in
  `block-dangerous-bash`, because Claude permission patterns are prefix-only and
  cannot catch a mid-command flag.
- A3: `source-driven-development` gains an offline branch (inject the doc as a
  port, validate with Zod) and a blocking `source-debt` (label + PR checkbox);
  the loop withholds auto-merge while a source-debt is open. Egress stays at zero.

Alternatives considered:
- Keep enforcement in the hook (original plan): rejected — bypassable by code
  execution, as above. The hook is demoted to a secondary net.
- Give the orchestrator a Linear GraphQL client so it (not the worker) moves the
  ticket: rejected as bloat — Linear is not the protected boundary; the git remote
  is. The worker keeps its scoped Linear MCP access; the orchestrator owns only
  the remote write (push + PR).

Framing: these changes reduce *false blocks* (the worker no longer trips a guard
mid-task), not the *blast radius*. Rollback tripwire: another direct-push-to-base
incident → unattended mode requires `VOID_SANDBOX` until the gap is closed.

Known pre-existing gap (logged separately, not closed here): `cat > .env` and
`node -e "fs.writeFileSync('.env', ...)"` bypass `protect-sensitive-files`, which
is wired to `Edit|Write` only, not `Bash`. Tracked in
`.void/harness-feedback/proposed/`.
