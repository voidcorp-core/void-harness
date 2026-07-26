---
specialist: security-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-438
audit_date: 2026-07-26
auditor: VoidCorp
---

# Specialist audit: `security-engineer`

## Need and boundary

Team mode needs an independent security verdict when a ticket crosses a trust boundary. This role
owns authorization, validation, sensitive data, dependencies, and realistic exploit paths. It is a
bounded code review, not the full periodic `security-audit` skill and never a live attack.

## Sources audited

| Source | Status | Adaptation |
|---|---|---|
| [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) | reviewed | Kept verification rigor and evidence-backed controls; reduced the standard to diff-relevant trust boundaries. |
| [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) | reviewed | Fresh context, native tool denial, and bounded turns. |
| [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents) | reviewed | Native TOML agent and honest sandbox limitation. |

## Adaptations and rejections

- Requires a concrete exploit path and repository evidence, avoiding generic best-practice noise.
- Routes full-system audit to `security-audit`; it does not duplicate OWASP/STRIDE phase machinery.
- Rejects DAST, secret retrieval, network access, implementation, and adjacent discipline reviews.
- Uses the same result parser as architecture and QA so orchestration cannot invent a second schema.

## Verification

Strict schema and YAML parsing, golden runtime compilation, deny-by-default built-ins/network
configuration, native discovery, grounded findings, and degraded state when isolation is incomplete.
