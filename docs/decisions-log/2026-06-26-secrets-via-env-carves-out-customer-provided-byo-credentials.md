---
date: 2026-06-26
title: "\"secrets via env\" carves out customer-provided (BYO) credentials"
---

## 2026-06-26: "secrets via env" carves out customer-provided (BYO) credentials

Context: an ADR audit of a consumer project (sesame, multi-tenant) surfaced a case
the doctrine handled wrong (issue #34). `PHILOSOPHY.md` and `security-guidance`
stated "secrets via env / no secret in the DB" without qualification. That is
correct for the app's OWN infra secrets, but wrong for a credential the customer
provides (a BYO API key, e.g. a per-tenant data-source key): env holds one value,
not one-per-tenant, so the absolute rule pushes a developer to either jam a key
into env (does not scale past one tenant) or store it plaintext (a DB dump leaks
every customer's credential).

Decision: add a single narrowly-scoped exception (not a new skill, not a mode). A
customer-provided credential is application **data** — store it encrypted at rest
per tenant (AES-256-GCM), keep the master key in env, never return it to a client
(masked last-four). The app's own secrets still go in env, never the DB. Recorded
in `PHILOSOPHY.md` (the hard rule), the `security-guidance` skill (a Secrets
subsection), and the skill audit.

Alternatives rejected: (a) leave the rule absolute — keeps it wrong for a real,
recurring multi-tenant case; (b) a dedicated "secret storage" skill — anti-bloat
overkill for a one-clause carve-out that belongs next to the rule it qualifies.

Why: a rule stated more absolutely than it is true trains developers to either
break it or mis-apply it; the carve-out is sourced from a validated PROJECT-DOCTRINE
rule (sesame ADR 57), so it is doctrine earning its way up, not speculation.
