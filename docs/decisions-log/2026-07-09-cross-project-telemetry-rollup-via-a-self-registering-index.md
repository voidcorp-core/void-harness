---
date: 2026-07-09
title: "cross-project telemetry rollup via a self-registering index; opt-in issue push (issue #72)"
---

## 2026-07-09: cross-project telemetry rollup via a self-registering index; opt-in issue push (issue #72)

Per-project telemetry is structurally too thin to trust — a skill fires a handful of times in one
repo, never clearing the cost/behavior gates (>=20 events / >=3 sessions). The audit decision was
to aggregate across projects locally and push only *findings* (never raw data) as GitHub issues,
opt-in and HITL.

**Project discovery — the `activation-meter` self-registers, telemetry-driven.** Rejected a
separate registry written by `init` (misses projects wired before the feature, needs an extra
step, drifts if a project is re-init'd) and a filesystem scan for `.void/` dirs (fragile, assumes
a common parent). Instead the meter — which already runs in every project and knows the root —
drops an idempotent pointer file `~/.void/projects/<cksum>.path` holding the project root, once per
project (a local `.void/.registered` marker avoids re-hashing every tool call). Any project that
runs the harness announces itself; the index self-heals (roots whose dir is gone are dropped on
read); nothing leaves the machine. This is the loomcraft-style self-registration the maintainer
asked for.

**Issue format and dedup.** One issue per `(type, component)` with a deterministic title
`[harness-audit] <type>: <component>` and the `harness-feedback` label, so a re-run edits/leaves
the same issue instead of duplicating (dedup by title via `gh issue list`, GitHub-side dedup across
machines). The body carries component names and aggregate counts/windows ONLY — never a project
path, file content, or session id. `void-harness audit --push` is dry-run by default (prints the
create/update plan and stops) and a real push additionally requires an interactive confirmation; a
missing/unauthenticated `gh` fails loud, never a silent no-op.

Why: the loop was a cost accountant with no revenue side and no cross-project view. Telemetry-driven
registration means aggregation "just works" as projects are used, and the strict privacy scope +
double gate (flag + confirm) keeps the outbound path safe enough to leave on. The cost/behavior
findings (`expensive`, `should-have-fired`) surface through `void-graph --all-projects`; the audit
command owns the skill-usage findings (`never`, `stale`).
