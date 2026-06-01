---
skill: doctrine-critic
kind: agent
status: shipped
strategy: original
target_loc: n/a (agent, not a skill; kept lean)
phase: D
depends_on: []
composes_with: [code-review, security-guidance, tdd, hexagonal-architecture, domain-driven-design]
matrix_row: plans/skill-decision-matrix.md#code-review
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.8
---

# Agent audit: `doctrine-critic`

## Need

Without this agent, conformance to VoidCorp doctrine is judged only mechanically.
The 8 PreToolUse hooks catch the grep-able floor (`no-any`, `no-as-cast`,
`boundary-direction-check`, …) at Edit/Write time; generic reviewers
(`pr-reviewer`, gstack `/review`, built-in `/code-review`) judge generic quality;
`/cso` owns security. None of them judges the *non-mechanical* doctrine calls —
tests that assert nothing, the strict-TDD Iron Law, a boundary respected by the
letter but not the spirit, over-abstraction, the anti-bloat rules on the harness's
own skills/hooks. `doctrine-critic` is the read-only, context-isolated judge of
exactly that gap, and nothing else.

## Decision matrix anchor

- **Wins**: judging a diff against VoidCorp doctrine where a hook cannot (taste
  calls) and a generic reviewer does not know the doctrine.
- **Loses to**: gstack `/cso` for the security audit (it only flags trust-boundary
  code and hands off). gstack `/code-review` for line-level bugs/perf. gstack
  `/plan-eng-review` for forward architecture planning. `pr-reviewer` for posting
  to GitHub.
- **Cannot decide**: whether to ship (user). It is advisory; it does not gate.
- **Composes with**: `code-review` (inherits its dimensions + blocker/nit framing),
  `security-guidance` (reuses the "flag + route to /cso" pattern), `tdd`,
  `hexagonal-architecture` / `domain-driven-design` (boundary spirit).

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| citypaul pr-reviewer agent | ~/.claude/agents/pr-reviewer-citypaul.md | read | kept: frontmatter shape, read-only allowlist, manual-invocation stance. Rejected its generic TDD/TS scope (already owned by hooks + `pr-reviewer` itself) |
| superpowers code-reviewer agent | ~/.claude/superpowers/agents/code-reviewer.md | read | kept: isolated-context, verdict-as-final-message |
| Claude Code plugin docs | https://code.claude.com/docs/en/plugins-reference.md | read | agents auto-discovered from `agents/`; NO plugin.json field |
| Claude Code subagent docs | https://code.claude.com/docs/en/sub-agents.md | read | `tools` comma-separated allowlist; read-only = omit Edit/Write/NotebookEdit; `name`+`description` the only required fields |

## Adaptation strategy

**original (compose-not-duplicate).** The agent is authored for void-harness, not
ported. Its discipline: judge only what no other layer judges, and route the rest.
It carries no security engine (→ `/cso`) and no bug-finder (→ `/code-review`).

## Adaptations and rejections

- **Rejected the three-agent plan.** `senior-reviewer`, `security-reviewer`,
  `architect-critic` overlapped existing capabilities 70-85% (global `pr-reviewer`,
  gstack `/cso` + `/plan-eng-review`, the `boundary-direction-check.sh` hook, the
  `code-review` + `security-guidance` skills). Collapsing to one doctrine-aware
  agent removes the overlap and the routing non-determinism of three thin wrappers
  competing with the global agents already in a consumer session. Full rationale:
  `docs/DECISIONS.md`.
- **No first-class write tools.** `tools: Read, Grep, Glob, Bash` — Edit / Write /
  NotebookEdit are omitted; `Bash` is allowed for observation, read-only by
  convention (it can technically mutate, so the prose forbids it). The real
  structural delta over an in-context skill is the isolated context, not Bash.
- **Routes, never re-implements.** Security and bug review name a handoff in the
  verdict instead of being performed, so overlap with `/cso` and `/code-review`
  stays well under the 30% anti-bloat ceiling.

## Verification checklist

- [x] Frontmatter valid: `name`, `description` ≤ 200 chars, read-only `tools`
- [x] Mirrored byte-identically into `packages/cli/core-assets/agents/`
- [x] Manifests + README + ARCHITECTURE drop the "roadmap"/"planned" three-agent
  wording and name `doctrine-critic`
- [x] All shipped skills that referenced the dropped agents updated
  (`code-review`, `security-guidance`, `systematic-debugging`,
  `verification-before-completion`) + the matrix and audit notes
- [x] Tests cover frontmatter validity, read-only tools, mirror parity, and that
  the manifests/docs no longer advertise the dropped agents
- [ ] Installed into a fixture project; confirmed `doctrine-critic` appears as a
  subagent and stays in scope (DEV-363 QA checklist — pending a fixture run)
