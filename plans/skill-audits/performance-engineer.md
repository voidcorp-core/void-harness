---
specialist: performance-engineer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `performance-engineer`

## Need and boundary

Performance-sensitive missions need an owner for budgets, representative workloads, baselines,
variance, latency, throughput, memory, bundle, query, and cost evidence. It does not own generic code
quality, reliability, product scope, or speculative optimization.

## Sources and adaptation

MDN and web.dev measurement guidance were generalized beyond web surfaces. Unmeasured claims,
irrelevant microbenchmarks, and optimization without a stated budget were rejected.

## Overlap audit

Observability/SRE owns production reliability and telemetry actionability. Independent Code Reviewer
flags obvious complexity but defers measured performance judgment, keeping overlap below 30%.
