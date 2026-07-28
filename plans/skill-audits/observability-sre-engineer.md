---
specialist: observability-sre-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `observability-sre-engineer`

## Need and boundary

Runtime changes need an owner for SLOs, telemetry, actionability, resource bounds, failure
containment, graceful degradation, capacity, runbooks, and recovery proof. It does not own security,
migration mechanics, feature correctness, API design, or code.

## Sources and adaptation

OpenTelemetry and Google SRE were combined with harness observability doctrine. Vendor dashboards,
unbounded telemetry, secret/PII logging, and implementation authority were rejected.

## Overlap audit

Performance Engineer owns measured speed/resource budgets; Data Migration Engineer owns rollout
recovery for persistent schemas. Runtime reliability remains distinct and overlap stays below 30%.
