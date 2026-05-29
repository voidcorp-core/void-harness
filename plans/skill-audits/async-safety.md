---
skill: async-safety
status: draft
strategy: distill
target_loc: 400
phase: D
depends_on: []
composes_with: [observability, security-guidance]
matrix_row: plans/skill-decision-matrix.md#async-safety
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `async-safety`

## Need

Without `async-safety`, webhooks get processed twice, retries duplicate state, jobs lose work on restart. TypeScript types don't catch this. `async-safety` codifies idempotency, retry semantics, deduplication keys, outbox pattern, and the "at-least-once vs at-most-once" mental model.

## Decision matrix anchor

- **Wins**: concurrent code, retries, webhooks, jobs, distributed coordination. Idempotency design
- **Loses to**: `hexagonal-architecture` on where the async boundary sits
- **Cannot decide**: queue technology (pack concern)
- **Composes with**: `observability` (traces), `security-guidance` (replay attacks)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Stripe "Designing robust webhook handlers" | https://stripe.com/blog/idempotency | foundation | kept (idempotency keys, replay protection) |
| Bryan Cantrill talks on distributed systems failure modes | various conf talks | reference | reference (mental model) |
| Outbox pattern (Microservices.io) | https://microservices.io/patterns/data/transactional-outbox.html | reviewed | kept |
| n8n retry semantics | https://docs.n8n.io | reference | tactical (consumer n8n workflows) |
| BullMQ patterns | https://docs.bullmq.io | reference | tactical |

## Adaptation strategy

`distill`. Principles from Stripe + outbox pattern. Stack-specific implementations (BullMQ vs Inngest vs Vercel Cron) live in packs.

## Hard rules (draft)

- Every webhook handler is idempotent. Dedup key from upstream (Stripe event ID, GitHub delivery ID, etc.) stored with TTL
- Replay protection: signature verification at boundary + timestamp check (reject events > N minutes old)
- Retries: exponential backoff with jitter. Max attempts declared, dead-letter on exhaustion
- Outbox pattern for "DB write + external notification": write event to outbox in same transaction, dispatcher process publishes
- At-least-once is the default. At-most-once requires explicit justification + idempotency at consumer
- Background jobs: idempotent by design. State machine with explicit transitions, not "do step 1 then 2 then 3"
- Cron jobs: protect against overlap (advisory lock if job takes longer than interval)

## Modes — none

## Companion hooks — TBD

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Default outbox implementation (raw Drizzle table vs Inngest vs Trigger.dev) — defer to pack-monorepo extension
- Idempotency key store (Redis vs Postgres) — same, pack concern
