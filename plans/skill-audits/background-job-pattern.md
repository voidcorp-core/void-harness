---
skill: background-job-pattern
pack: void-server
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: void-server:background-job-pattern

**Need.** "Background job" is ambiguous — event-driven vs cron vs one-shot use different tools (Inngest vs Vercel Cron vs custom). Devs default to fire-and-forget Promises which silently die on serverless. This skill ships the type taxonomy + per-type wrapper pattern.

**Wins.** Decision table (job type by trigger). Concrete Inngest pattern + concrete Vercel Cron pattern. Cron secret + concurrency lock callouts. Anti-patterns include the fire-and-forget Promise trap.

**Loses to.** Inline work < 200ms (no queue overhead). Work that needs per-request context (cookies). One-off scripts (runbook, not a job).

**Composes with.** `void:async-safety` (doctrine: retry/idempotency/dead-letter). `void-server:server-action` (actions emit events). `void-server:webhook-handler-pattern` (webhooks emit events too). `void-server:env-validation` (CRON_SECRET, queue API keys). `void:observability` (trace links action → event → job).

**Why not in core.** Specific to server-side runtimes (Node/Edge serverless). Queue tooling (Inngest, Trigger, Cloudflare Queues) is server-pack territory.
