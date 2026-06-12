---
skill: webhook-handler-pattern
pack: harness-server
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: harness-server:webhook-handler-pattern

**Need.** Webhooks are untrusted POSTs from external systems. Every wrong handler is a security/correctness/observability hole. Per-source patterns (Stripe, Resend, GitHub) differ on signature header, idempotency key, retry semantics — devs reinvent each one badly. This skill ships the canonical per-source patterns.

**Wins.** 5 non-negotiable layers (signature, idempotency, Zod, service call, ack). Per-source notes for Stripe/Resend/GitHub/custom. Inbox table SQL. Response code table (200 vs 401 vs 4xx vs 5xx).

**Loses to.** Outbound webhooks (calling external systems). One-shot integrations (use a script, not a webhook handler).

**Composes with.** `harness:async-safety` (doctrine). `harness-server:server-action` (both cross trust boundary). `harness-server:drizzle-migration-safe` (inbox table migration). `harness-server:env-validation` (webhook secrets). `harness:observability` (trace context). `harness:security-guidance` (Zod re-validation).

**Why not in core.** Webhook handling is a server concern with very specific per-source patterns. Stack-agnostic doctrine lives in `harness:async-safety`.
