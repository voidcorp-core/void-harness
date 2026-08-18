---
specialist: api-integration-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `api-integration-engineer`

## Need and boundary

Consumer-facing boundaries need a contract owner for validation, stable errors, compatibility,
idempotency, pagination, timeouts, retries, and consumer migration. It does not place domain
boundaries or own authorization, persistence, runtime-wide reliability, or implementation.

## Sources and adaptation

OpenAPI, SemVer, and `api-and-interface-design` were generalized across HTTP, events, packages, SDKs,
and third-party integrations. Transport prescription and implementation ownership were rejected.

## Overlap audit

Domain Architect supplies language; Solution Architect places boundaries; Security Engineer owns
threats. This role owns the external promise, keeping shared concerns below 30%.
