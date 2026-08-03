---
skill: security-audit
status: shipped
strategy: distill (vendor the methodology, reject the runtime)
target_loc: 400
actual_loc: 128
activation: on-demand
phase: D
depends_on: []
composes_with: [security-guidance, code-review, ticket-runner, verification-before-completion]
source_ticket: DEV-387
epic: DEV-383
audit_date: 2026-07-09
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `security-audit`

## Need

`security-guidance` is the daily floor — defaults at every trust boundary while you write code. It always pointed at gstack `/cso` for the periodic ceiling: the deep, phase-driven audit (OWASP, STRIDE, supply chain, infra). The gstack teardown (epic DEV-383) turns that pointer into a dead reference. The methodology is load-bearing and must survive; the vehicle (gstack's runtime) must not. This skill vendors the methodology.

## Decision: dedicated skill vs extending `security-guidance`

Chosen: a **dedicated `security-audit` skill**, not an extension of `security-guidance`. Logged in `docs/DECISIONS.md` (2026-07-09, DEV-387).

- **One skill = one subject.** `security-guidance` is *continuous boundary discipline* applied passively on every diff (`activation: always`). A full audit is a *periodic, deliberate, read-only investigation* producing a findings report (`activation: on-demand`). Different subject, different activation, different lifecycle.
- **Anti-bloat.** Folding the whole phase framework into `security-guidance` (257 LOC) would push it toward / past the 400-line cap and dilute the description's auto-discovery signal. The prose already named the split ("daily floor" vs "periodic ceiling") — this makes it structural.
- **First `on-demand` skill in core.** All 17 prior skills are `activation: always` (passive doctrine). An audit is invoked, not followed — `on-demand` is semantically correct and, per the graph's behavior liveness logic, means the graph will track whether audits actually run (exactly what we want for a periodic skill).

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| gstack `/cso` (v1.57.10) | ~/.claude/skills/gstack/cso/ (1243 LOC + sections/) | reviewed | methodology distilled; runtime rejected |
| OWASP Top 10 | https://owasp.org/www-project-top-ten/ | reference | kept (Phase 9 A01-A10) |
| OWASP Top 10 for LLMs | https://owasp.org/www-project-top-10-for-large-language-model-applications/ | reference | kept (Phase 7) |
| STRIDE | Microsoft threat modeling | reference | kept (Phase 10) |
| Snyk ToxicSkills | skill supply-chain research | reference | kept (Phase 8 rationale) |

## Kept (load-bearing methodology)

- Mode/scope resolution (full / comprehensive / scoped / diff), with the "phases 0,1,12,13 always run; 2-11 scope-gated" invariant and the "two scope flags = error, never silently pick" rule.
- The phase framework: 0 stack model, 1 attack-surface census, 2-11 audit families (secrets archaeology, supply chain, CI/CD, infra, webhook, LLM, skill supply chain, OWASP, STRIDE, data classification), 12 FP filter + confidence gate + code-tracing verification + independent-verifier subagent + variant analysis, 13 findings report.
- The discipline: zero-noise > zero-misses, absolute confidence gate, exploit-scenario-required, quote-the-motivating-line, read-only, anti-manipulation, framework-aware. FP hard-exclusions distilled to the *principle* (flag concrete exploitable vulns, not absent best practices) + the highest-value examples, rather than the full 22-item + 12-precedent verbatim list (that would be copying, and rots as gstack's list drifts).
- The disclaimer (AI scan ≠ professional pentest).

## Rejected (gstack runtime plumbing, not security)

Preamble, gbrain sync, prior-learnings via `gstack-learnings-search`, telemetry, plan-mode detection, AskUserQuestion format machinery, voice / writing-style / context-recovery / model-specific patch, artifacts sync, `gstack-config` + `gstack-learnings-log` binary calls, trend-tracking persistence to gstack paths, completion-status / question-tuning protocols. All are gstack's own harness, orthogonal to the audit method.

## Deferred (not rejected)

Live-surface DAST — nuclei, live TLS/header probing, authenticated crawls. The `/cso` methodology is itself deliberately code-tracing-only ("never make live requests"), so nothing live was lost. The live layer belongs to the `claude-in-chrome` MCP re-point, **epic DEV-383 Vague 4**. The skill notes this boundary explicitly.

## Repointing (dead-reference cleanup)

Every live routing reference to `gstack:/cso` now points to `harness:security-audit`:

- **4 skills**: `security-guidance` (frontmatter + body + escalation section + composition + anti-rules), `code-review` (dimension + delegation table + anti-rule), `ticket-runner` (security pass), `verification-before-completion` (security-review row).
- **5 agents** (added after the doctrine-critic pass flagged that `security-audit`'s "doctrine-critic routes here" claim was false while the agent still said `/cso`): `doctrine-critic`, `silent-failure-hunter`, `type-design-analyzer`, `code-explorer`, `migration-planner` — each routes a security handoff, now to `security-audit`.

Grep for `/cso` as a live routing target across `packages/core` is green. The only remaining `/cso` strings are `.source` provenance and the skill's own attribution line ("distilled from gstack /cso"), which the sourcing discipline mandates. The generated `packages/core/graph/void-graph.mjs` + `model.json` are rebuilt from these repointed descriptions in the same commit.

## Verification

Anti-bloat (≤400 LOC, desc ≤200, name==folder, `.source` + this note present), core-assets mirror sync (`core/` and `cli/core-assets/` byte-identical), the graph gate (`pnpm graph:check` + `graph:check-bundle` after regenerating `model.json` + `void-graph.mjs`), and the full test suite green. Behavioral eval (DEV-394) not authored here: a full-audit skill's output is a findings report, hard to score deterministically without an LLM judge; a scored eval case is a candidate follow-up, not a blocker for the vendoring.

## Revision 2026-07-31 — the deferred live layer landed (DEV-445)

The skill shipped with a section declaring live-surface scanning out of scope, deferred to the `claude-in-chrome` re-point. DEV-445 makes that section wrong: the live layer exists, and it is not browser tooling. It is `void-harness security scan`, a deterministic command with an authorization gate.

**What changed in the skill.** The deferred section is replaced by a routing section, and two anti-rules were added. The removal is deliberate rather than an edit: a deferral that has been resolved is not stale prose, it is a false statement about where a capability lives.

**Why the split holds.** Reading code for a reachable exploit path is judgement, which is what the model is for. Deciding that a host may be probed is a rule, which is what a command is for. Putting the authorization gate inside prose would mean a target could be widened by an argument — and the entire point of the gate is that it cannot be.

**Doctrine the skill now carries, all of it enforced in code rather than asserted here:**

- a scan that did not finish is `degraded` or `blocked`, never green — an unmeasured surface is not a clean one;
- severity comes from the finding class; a scanner may argue upward, never down; three classes are never waivable;
- pre-launch is a phase, not a mission mode, and it only ever tightens what blocks;
- probes are non-destructive unless a grant explicitly says otherwise, and never against a non-ephemeral target.

**Rejected.** Teaching the skill to invoke scanners directly. It would have duplicated the authorization gate in a place where it can be argued with, and made the audit unrunnable without the tools installed — the opposite of the "every scanner is optional" promise the core makes.

**Line count.** 137 → 148, well under the 400 cap.
