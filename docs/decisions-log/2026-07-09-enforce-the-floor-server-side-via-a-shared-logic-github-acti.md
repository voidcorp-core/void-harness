---
date: 2026-07-09
title: "enforce the floor server-side via a shared-logic GitHub Action (DEV-393)"
---

## 2026-07-09: enforce the floor server-side via a shared-logic GitHub Action (DEV-393)

The void-harness floor (no editing secrets/keys/lockfiles, no forbidden `@repo/*` imports, no leaked
tokens, no destructive shell) was enforced only by LOCAL PreToolUse hooks — a cloud agent, a
`--dangerously-skip-permissions` run, or any non-Claude author bypassed it. Decision: a **GitHub
Action replays the same floor on every PR**, so it is incontournable regardless of author. It
complements the server-side branch protection `backlog-autopilot` already requires.

Load-bearing choice: **one body of detection logic, two callers.** The predicates were extracted from
the four floor hooks into a sourced bash library `core/hooks/_checks.sh` (path- and content-based,
no runtime coupling). The hooks became thin wrappers over it; a new diff driver `core/enforce/
ci-enforce.sh` consumes the identical functions over a PR diff. The hooks and the Action can never
diverge on *what* the floor is — the AC's zero-duplication requirement is structural, not a promise.

Alternatives rejected: (a) **port the checks to TypeScript** for a shared module — rejected, the
hooks are bash invoked as bash by Claude Code, so a TS port adds a node startup per edit and a large
rewrite for no gain; bash-sourced sharing is the idiomatic fit. (b) **Re-implement the checks in the
Action** — rejected outright, it is exactly the two-sources-of-truth the ticket forbids.

Sub-decisions: the driver lives under `enforce/` not `hooks/` (it is a CI tool, not a Claude-runtime
hook — keeps the `hooks/ = runtime` boundary honest and out of the 100-LOC hook cap). Distribution is
a **composite action** + a **reusable workflow** (`enforce.yml`) so a consumer adopts in ≤5 lines;
`doctor` reports adoption **advisory-only** (never blocks). The internal composite ref is pinned to
`main` in v1 (a floating major tag is deferred until marketplace tags stabilize). v1 scope is the
path/secret/boundary/destructive-shell checks; the project **test gate stays the consumer's own CI**
— this Action enforces the doctrine floor, not general quality, and must not double the existing CI.

**Fail-closed is the invariant** (the #62-64 class it must not reproduce): a missing prerequisite,
an unresolvable base ref, **no merge-base** (shallow/disjoint history), or any git-diff error is an
explicit red check, never a silent green. The diff enumeration uses `-z` + `core.quotepath=false` so
non-ASCII / spaced / tabbed filenames arrive raw — under the default quotepath a secret in an accented
filename (`café.ts`) would have skipped every content check and passed green (caught in security
review, now regression-tested). v1 replays three checks: sensitive-path, secret-content,
boundary-direction. **Destructive-shell is intentionally NOT replayed on the diff** — a catastrophic
pattern committed into a file is a weak signal that self-matches the harness's own detector
(`_checks.sh` literally contains the force-push regex), security docs, and test fixtures; the false
positives make it net-negative for a floor check. It remains a *local runtime* Bash guard
(block-dangerous-bash), and a diff variant is deferred to a follow-up with a per-line allow tag.
Escape hatch: the local hooks take a per-run env override (`VOID_HARNESS_ALLOW_SECRET_EDIT`); the
Action's committed equivalent is `.github/void-enforce-allow` — path globs (one per line) skipped
entirely, with each skip LOGGED (never silent). It exists because the sensitive-path check
deliberately flags any file NAMED for secrets/credentials (the `Credentials.ts` rule, enforced by
test), which correctly but inconveniently flags the harness's OWN `secret-in-content.sh`; the
allowlist is how the dogfood — and any consumer maintaining a legitimately secret-named file — opts a
reviewed path out. An allowlisted path is not scanned at all, so it is security-sensitive by
definition. Self-dogfood
caveat: void-harness runs the *local* composite on its own PRs, so a PR editing `_checks.sh` /
`enforce/**` / the action can neuter its own check — a reviewer treats those paths as
security-sensitive; consumers are unexposed (the reusable workflow pins the check code at `@main`).

Why: the floor is only a floor if it cannot be walked around. Local-only enforcement was a floor with
a side door; the same logic run server-side on the diff closes it without a second, driftable copy.
