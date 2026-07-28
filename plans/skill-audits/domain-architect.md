---
specialist: domain-architect
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `domain-architect`

## Need and boundary

Domain changes need a business-model owner distinct from solution topology. This role owns
ubiquitous language, bounded contexts, aggregate invariants, value semantics, and translations. It
does not choose deployment, database mechanics, public API shape, or code.

## Sources and adaptation

Microsoft domain analysis, Cockburn ports/adapters, and the harness DDD doctrine were distilled.
Microservices, CQRS, event sourcing, generic repositories, and infrastructure-first modeling were
rejected.

## Overlap audit

Solution Architect owns system dependency and operational trade-offs; Data Migration Engineer owns
persistent rollout. Shared boundary vocabulary is under 30% of either role's responsibility.
