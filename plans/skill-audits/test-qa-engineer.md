---
specialist: test-qa-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-438
audit_date: 2026-07-26
auditor: VoidCorp
---

# Specialist audit: `test-qa-engineer`

## Need and boundary

Test presence does not prove behavioral coverage or release confidence. This specialist owns
acceptance-criteria traceability, meaningful assertions, failure paths, regression risk, flakiness,
and verification evidence. It reviews but does not write tests or decide release.

## Sources audited

| Source | Status | Adaptation |
|---|---|---|
| [ISTQB CTFL syllabus 4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf) | reviewed | Kept test-basis traceability, risk focus, and collaborative quality; removed certification process. |
| [ISTQB CTFL 4.0 release](https://www.istqb.org/istqb-releases-certified-tester-foundation-level-v4-0-ctfl/) | reviewed | Confirmed the current holistic Agile/DevOps scope. |
| [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents) | reviewed | Native discovery, fresh context, budgets, and runtime safety limits. |

## Adaptations and rejections

- Separates a proven defect from absent evidence; both are actionable but not equivalent.
- Complements `testing` and `tdd`: those guide the writer, while this role independently judges the
  resulting behavior and proof.
- Rejects test implementation, release authority, process ceremony, and adjacent discipline review.
- Emits the same bounded JSON contract as every specialist.

## Verification

Strict canonical parsing, golden runtime compilation, native discovery, scope separation, bounded
output, evidence-required findings, and duplicate-completion rejection.
