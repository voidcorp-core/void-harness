---
date: 2026-06-04
title: "opt-in autonomous-backlog-loop (Ralph distilled, HITL at the boundaries)"
---

## 2026-06-04: opt-in autonomous-backlog-loop (Ralph distilled, HITL at the boundaries)

Context: the harness wanted a way to drain a curated Linear backlog unattended,
with full craftsman discipline, without adopting the unsupervised Ralph loop
(`while :; do cat PROMPT | claude --dangerously-skip-permissions; done`) which is
the antithesis of the harness's HITL-absolute principle.

Decision: ship `autonomous-backlog-loop` as an explicitly-launched skill (core,
never a default). One FRESH `claude -p` process per ticket (true context reset),
state in Linear + on-disk plan files. The human gates move to the boundaries —
backlog curation (acceptance criteria = approved spec) and PR merge — instead of a
per-action prompt. Default `AUTO_MERGE=0` (PRs, human merges). Full-auto
(`--dangerously-skip-permissions`) is gated behind `UNSAFE_FULL_AUTO=1` + a required
`VOID_SANDBOX` marker. The security hooks stay live; the orchestrator refuses to
start with `VOID_HARNESS_ALLOW_*` set or on a dirty tree.

Alternatives rejected:
- Unsupervised Ralph loop as default: no review, no floor, no sandbox. Rejected;
  offered only as an explicit sandboxed opt-in.
- Auto-merge by default: review is where correctness is owned. Default to PRs.
- Self-judged completion: the test suite is the gate, not the model's self-report.
- A `/clear`-only loop (single long session): context rot degrades quality silently;
  a fresh process per ticket is the stronger anti-context-rot.
