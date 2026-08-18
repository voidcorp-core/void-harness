---
specialist: data-migration-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `data-migration-engineer`

## Need and boundary

Persistent schema changes require a production rollout owner. This role owns compatibility,
locking, backfills, rollback, integrity, mixed-version operation, and migration telemetry. It does
not redesign the domain, API, application, or generic runtime.

## Sources and adaptation

PostgreSQL locking semantics, GoCardless zero-downtime practice, and `migrations` were
distilled into an ORM-neutral review. Database implementation and schema redesign were rejected.

## Routing and overlap audit

Only `migration` or an applicable SQL profile activates it; CSS cannot. Observability/SRE reviews
service operation, while this role owns migration-specific telemetry and recovery, below 30% overlap.
