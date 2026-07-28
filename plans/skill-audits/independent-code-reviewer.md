---
specialist: independent-code-reviewer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `independent-code-reviewer`

## Need and boundary

Every code diff needs a fresh-context final review for correctness, maintainability, repository
boundaries, unsafe complexity, and contradictions between claims and evidence. It reports actionable
findings but does not repeat specialist deep audits or edit code.

## Sources and adaptation

Google engineering practices and harness `code-review` were distilled into a bounded read-only
contract. Style enumeration, reviewer voting, mutation, and domain-audit duplication were rejected.

## Overlap audit

Test/QA Engineer owns behavioral coverage and release proof. The independent reviewer owns code-level
correctness and maintainability, deferring security, QA, accessibility, and performance depth.
