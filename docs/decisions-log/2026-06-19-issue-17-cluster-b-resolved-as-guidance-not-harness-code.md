---
date: 2026-06-19
title: "issue #17 cluster B resolved as guidance, not harness code"
---

## 2026-06-19: issue #17 cluster B resolved as guidance, not harness code

Context: cluster B (B1 fail-soft outbound HTTP, B2 `defineFormAction` drops
multi-value FormData, B3 `server-only` untestable under Vitest) read like code
bugs, but the harness is a meta-repo of skills + CLI + thin pack runtimes — it
has no `defineFormAction` and no Next.js app. The bugs were observed in a
consumer project; the harness's job is to teach the correct pattern so the
consumer's agent does it right.

Decision: fix each as guidance in the skill that owns the subject.
- B1 → a "Fail-soft outbound HTTP" section in core `async-safety` (the mirror of
  its outbox pattern: a degradable read on the request path — timeout + decided
  failure mode).
- B2 → `harness-server:server-action` taught the bug itself
  (`Object.fromEntries(formData)` collapses repeated fields to the last value).
  Fixed there (`getAll` + `z.array`) and cross-referenced from
  `harness-react:form-pattern`'s native-form path.
- B3 → a new `harness-server:testing-server-modules` skill: alias
  `server-only`/`client-only` to an empty stub in the shared Vitest config, with
  the load-bearing caveat that the alias is test-only and must never erode the
  real build-time boundary.

Why guidance over code: there is no harness code to patch; a skill edit is the
durable fix that reaches every consumer. Packaged as one cluster-B PR.
