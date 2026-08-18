---
skill: offline-first-mutation
pack: harness-pwa
status: shipped
strategy: distill
target_loc: 350
phase: G
depends_on: [server-action, async-safety]
composes_with: [server-action, async-safety, drizzle-migration-safe, observability]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-pwa:offline-first-mutation`

## Need

PWAs that don't reconcile offline mutations fail their users the first time the connection blinks. The pattern is well known (capture-queue + sync) but its details are subtle: client-generated idempotency keys (UUID v7 for ordering), server-side inbox table, dead-letter UI, conflict resolution policy. Without a skill, each consumer re-invents 80% of it badly.

Solaar already implements this pattern in `@solaar/ui/offline`. This skill codifies it so future projects don't start from scratch — and so Solaar's implementation gets a reference doc to track against.

## Wins

- Single mental model (capture → sync → commit / fail / dead-letter) with explicit transitions.
- Server-side idempotency contract baked in (inbox pattern).
- Anti-patterns section addresses the 5 most common screwups (optimistic without persistence, ID collision, "Saved!" lies, silent dead-letter).
- Explicit scope limit on conflict resolution (server wins, use Yjs/Automerge for richer cases).

## Loses to

- Read-only flows (no mutation = no offline issue).
- Apps where "please retry when online" UX is acceptable (consumer-grade simple tools).
- Real-time collaboration (Yjs/Automerge territory, not this pattern).

## Composes with

- `harness-server:server-action` — Server Actions are the sync target; they must honor `idempotencyKey`.
- `harness:async-safety` — backoff schedule, dead-letter, bounded retry semantics live here.
- `harness-server:drizzle-migration-safe` — the inbox column + unique index migration pattern.
- `harness-react:01-react.md` — `useOfflineMutation` hook is the consumer-side primitive.
- `harness:observability` — sync logs are correlated by idempotency key.

## Sources audited

| Source | Verdict |
|---|---|
| Solaar `@solaar/ui/offline` implementation | Primary source. Pattern lifted with adaptation to be stack-neutral. |
| Stripe API idempotency-key docs | Confirms the client-generates-UUID approach for HTTP idempotency. |
| RxDB / WatermelonDB conflict-resolution docs | Inspiration for "server wins" baseline; rejected richer reconciliation for scope. |
| Yjs / Automerge | Mentioned as out-of-scope for explicit non-coverage. |

## Rejected ideas

- **Bundle a runtime in `@voidcorp/pack-pwa/offline`** for the hook + IndexedDB + sync engine. Tempting (it's exactly what Solaar already has), but conflates the pack's plugin-side and runtime npm package side. Defer: ship the skill first, runtime becomes its own task if multiple consumers want it.
- **CRDTs by default**: rejected. CRDTs are a hammer; 80% of mutations don't need them, and they impose a model rewrite.
- **`Last-Modified` server-side conflict detection** instead of idempotency keys: rejected. Last-Modified leaks time-of-write info and doesn't address dedup on retry.

## Open questions

- Should the dead-letter UI be a generic `@voidcorp/pack-pwa/offline` React component, or left to each consumer to render with their own design system? Lean toward shipping a headless primitive (renderless, give props to consumer's `<Dialog>`).
