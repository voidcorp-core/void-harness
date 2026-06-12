---
skill: rate-limit-strategy
pack: harness-server
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-server:rate-limit-strategy

**Need.** `harness:security-guidance` says "rate limit at every boundary" but doesn't tell devs HOW to pick window/max/key. Result: identical limits everywhere (over-tight on reads, under-tight on auth-adjacent). This skill ships the void-harness presets per action class.

**Wins.** Preset table by action class (read, write, login, password-reset, 2FA, LLM, upload, webhook, public form). user/IP/both key strategy. Sliding-window default with token-bucket exceptions. Progressive lockout for auth.

**Loses to.** Stateless internal services with no user concept (use a token/API-key bucket model, not user/IP).

**Composes with.** `harness:security-guidance` (doctrine). `harness:async-safety` (webhook + job retry interacts with rate limits). `harness-server:server-action` (rate limit config in defineAction). `harness-server:webhook-handler-pattern` (per-source rate limit). `harness:llm-cost-discipline` (LLM rate limits = cost control).

**Why not in core.** Concrete presets are server-pack specific. Generic "rate limit obligatoire" doctrine lives in `harness:security-guidance`.
