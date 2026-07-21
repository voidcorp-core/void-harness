---
date: 2026-07-09
title: "vendor gstack /cso as a dedicated `security-audit` skill, not an extension of `security-guidance` (DEV-387)"
---

## 2026-07-09: vendor gstack /cso as a dedicated `security-audit` skill, not an extension of `security-guidance` (DEV-387)

De-gstackification Vague 1 (epic DEV-383). `harness:security-guidance` always pointed at gstack `/cso`
for the periodic deep audit ("compose gstack /cso for full audits"). The teardown turns that into a dead
reference, so the /cso methodology (OWASP Top 10, STRIDE, secrets archaeology, supply chain, CI/CD, infra,
LLM, skill supply chain) had to be vendored into the harness.

Decision: a **dedicated `harness:security-audit` skill** (the periodic ceiling), NOT an extension of
`security-guidance` (the daily floor). Every live reference to /cso now points to `security-audit`: the
four skills that routed to it (`security-guidance`, `code-review`, `ticket-runner`,
`verification-before-completion`) and the five read-only agents that handed security off to it
(`doctrine-critic`, `silent-failure-hunter`, `type-design-analyzer`, `code-explorer`, `migration-planner`).

Load-bearing choices:
- **One skill = one subject.** `security-guidance` is continuous boundary discipline applied passively on
  every diff (`activation: always`); a full audit is a periodic, deliberate, read-only investigation
  producing a findings report (`activation: on-demand`). Different subject, activation, and lifecycle.
  Folding the phase framework into the 257-LOC floor skill would breach the 400-line cap and dilute its
  auto-discovery description. The prose already named the "floor vs ceiling" split — this makes it structural.
- **First `on-demand` skill in core.** All 17 prior skills are `activation: always` (passive doctrine,
  exempt from the graph's dead-component liveness check). An audit is invoked, not followed; `on-demand` is
  semantically correct and makes the graph track whether audits actually run — the right signal for a
  periodic skill.
- **Distill the methodology, reject the runtime.** Vendored: mode/scope resolution, the phase framework
  (0-13), the discipline (zero-noise > zero-misses, absolute confidence gate, exploit-scenario-required,
  quote-the-motivating-line, read-only, anti-manipulation). FP hard-exclusions distilled to the *principle*
  plus the highest-value examples, not gstack's 22-item + 12-precedent verbatim list (copying it would
  freeze a list that drifts upstream). Rejected: gstack runtime plumbing (gbrain sync, telemetry,
  prior-learnings, plan-mode, voice, AskUserQuestion machinery, config/learnings binaries).
- **Live-surface DAST deferred, not lost.** The /cso methodology is itself code-tracing-only ("never make
  live requests"), so nothing live was dropped. Active scanning (nuclei, live TLS/header probing) belongs
  to the `claude-in-chrome` MCP re-point, Vague 4 (DEV-390). The skill marks that boundary explicitly.
- **Provenance /cso mentions are kept on purpose.** Grep for /cso as a *live routing target* is green; the
  remaining mentions live in `.source` provenance ("distilled from gstack /cso"), which the sourcing
  discipline mandates. Provenance is not a dead link.

Why: the deep-audit methodology is ~65%-durable gstack value that must outlive the teardown. Vendoring it as
its own skill keeps the floor lean, gives the audit a home with the right activation semantics, and turns a
soon-to-be-dead composition into a first-class harness capability.
