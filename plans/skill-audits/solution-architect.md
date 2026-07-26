---
specialist: solution-architect
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-438
audit_date: 2026-07-26
auditor: VoidCorp
---

# Specialist audit: `solution-architect`

## Need and boundary

Team mode needs an independent owner for structural trade-offs that deterministic boundary hooks
cannot judge. This specialist owns dependency direction, data ownership, reversibility, and
operational fit. It does not own implementation, security, QA, product, or visual design.

## Sources audited

| Source | Status | Adaptation |
|---|---|---|
| [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/2025-02-25/framework/welcome.html) | reviewed, 2024-11-06 revision | Kept explicit trade-offs, system qualities, evidence, and remediation; removed AWS-specific advice. |
| [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) | reviewed | Fresh context, native tools/deny fields, max-turn budget, project discovery. |
| [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents) | reviewed | Project TOML discovery, required fields, read-only sandbox, parent-override limitation. |

## Adaptations and rejections

- Distilled architecture review into one short contract, not a framework checklist.
- Requires repository evidence and the smallest viable correction; opinions without evidence fail
  the shared result parser.
- Rejected implementation authority and overlapping specialist reviews.
- Runtime wrappers are generated from YAML; the committed Claude copy exists only for marketplace
  discovery and is byte-checked.

## Verification

Strict schema and YAML parsing, golden Claude/Codex outputs, native discovery, write-tool denial,
shared instruction equality, output identity/version checks, and duplicate-completion rejection.
