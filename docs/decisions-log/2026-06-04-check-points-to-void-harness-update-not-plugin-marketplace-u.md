---
date: 2026-06-04
title: "check points to `void-harness update`, not `/plugin marketplace update`"
---

## 2026-06-04: check points to `void-harness update`, not `/plugin marketplace update`

Context: field usage — `void-harness check`/`doctor` measure drift between the
`.void/config.json` pins and the marketplace HEAD, but `check`'s suggested remedy
was `/plugin marketplace update` (the Claude Code in-session command). That
command refreshes the loaded plugin but does NOT rewrite `.void/config.json`, so
`check` kept reporting drift even right after the user did exactly what it said.

Decision: `check` now points to `void-harness update`, which is the single
gesture that resolves the measured drift — it fast-forwards the marketplace cache
AND bumps the `.void/config.json` pins, then tells the user to restart Claude
Code. (`update` already did both; only `check`'s advice was wrong.)

Alternatives rejected:
- Make `check` itself bump the pins: a read-only "check" should not mutate; the
  mutation belongs in `update`.
