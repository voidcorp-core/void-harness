---
skill: server-action
pack: harness-server
status: shipped
strategy: native
target_loc: 250
phase: F
depends_on: [security-guidance, async-safety, observability]
composes_with: [security-guidance, async-safety, observability, tdd, hexagonal-architecture]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-server:server-action`

## Need

Every `'use server'` function is a trust boundary reachable from the public internet. Without this skill, Server Actions ship without one or more of: auth gate, Zod validation, rate limit, observability, return-type discipline. Each gap is a Sev-2 waiting to happen — credential stuffing, prototype pollution via formData, denial-of-wallet on LLM-backed actions, leaked PII in error messages.

This skill encodes the **five non-negotiable layers** (auth, Zod, rate limit, observability, service call) so they happen by default, in the right order.

## Wins

- Every Server Action shipped is auditable against a 5-point checklist.
- Forbidden patterns (DB in action, throw to client, Date/BigInt return) caught at creation, not in code review.
- Composes the trust-boundary patterns from `pack-server`'s `withWebhookSafety`, `defineAction`, `defineFormAction` into a single workflow.

## Loses to

- Server functions that are NOT `'use server'`. Those are normal service functions in `src/services/` → use `harness:tdd` directly.
- Webhook handlers (POST endpoints, not buttons-triggered). Use `withWebhookSafety` instead — see `pack-server/01-server.md`.

## Composes with

- `security-guidance` — Zod at every ingress, no PII in returned errors.
- `async-safety` — wrappers (withWebhookSafety, withCronSafety, withJobSafety) materialize this skill's principles for non-action endpoints.
- `observability` — withTraceContext, Sentry user scope (hashed).
- `tdd` souple — boundary tests at the action layer; strict on the underlying service.
- `hexagonal-architecture` — action is the boundary; pure logic stays in `services/`.

## Adaptations from sources

Native — distilled from Next.js 16 docs (`'use server'`, `defineAction` semantics), Vercel security guidance, and Solaar's actual webhook safety implementation. Adapted to the void-harness convention where services own the domain logic and actions are pure trust-boundary wrappers.

## Rejected ideas

- **A `harness-server:server-action-strict` mode** that fails CI if any of the 5 layers is absent. Considered but rejected for now — would require deeper static analysis (e.g., AST walk for `auth: 'required'`). Capture as a hook proposal in `harness-evolution` if frictions accumulate.
- **Auto-generating return types from Zod input**: the action return is a discriminated union shaped by the *handler*, not the input. Coupling them would be wrong.

## Open questions

- The skill mentions `defineAction`/`defineFormAction` from `@repo/auth`. The pack itself doesn't ship these — they're expected from `pack-monorepo`'s `@repo/auth` package. Should the wrappers be moved to `@voidcorp/pack-server` so the skill stands alone? Decision deferred until we see a non-monorepo consumer of this skill.
