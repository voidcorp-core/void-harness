---
schemaVersion: 1
id: "adr:123b596b-c484-429b-8d1e-b2944cfbe8f1"
createdAt: "2026-08-04T07:01:55.555Z"
title: "Codex native plugin channel declined; .agents/skills stays the only path"
status: accepted
deciders: []
supersedes: []
---

# Codex native plugin channel declined; .agents/skills stays the only path

## Context

Codex ships a native plugin channel: a plugin bundles skills, connectors, MCP
servers, hooks and scheduled-task templates, and a user installs it through
`/plugins` from a configured marketplace, then starts a new session. Issue #144
asked whether to author one as a **complementary** install path, symmetric with
Claude's marketplace, so a Codex user could add the harness through their own
plugin manager rather than through the CLI.

Today `void-harness init --runtime codex` materializes every `runtimes: [codex]`
skill into `.agents/skills/<name>/` and lays the `.codex/hooks.json` floor. That
is Codex's documented directory-convention discovery — scanning `.agents/skills`
from the cwd up to the repo root — and it is account-free, reproducible and
already complete: a Codex user gets the full functional bundle.

Re-read of the official docs on 2026-08-03 (`learn.chatgpt.com/docs/plugins` and
`/docs/hooks`; the `developers.openai.com/codex/*` URLs now 308 to that host)
confirmed the channel exists and bundles skills and hooks. It also showed the
public documentation does **not** specify the `.codex-plugin/plugin.json` schema
or the repo-level marketplace declaration — both would have to be derived from an
example.

## Decision

Decline the native plugin channel. `.agents/skills` (plus the `.codex/hooks.json`
floor), written by `void-harness init --runtime codex`, remains the single
supported way to install the harness for Codex.

## Consequences

Positive:

- One distribution surface per runtime, so there is no second manifest that can
  silently diverge from the skills it claims to ship.
- The account-free property holds for Codex exactly as it does for Claude: no
  marketplace configuration, no plugin manager, no session-start install step.
- No dependency on an under-documented manifest schema that would have to be
  reverse-engineered and then tracked across Codex releases.

Negative:

- A Codex user who manages every other tool through `/plugins` installs this one
  differently, and may not find it where they look first.
- If the plugin channel later becomes the discovery path Codex privileges, the
  harness adopts it late rather than early.

## Alternatives considered

- **Author `.codex-plugin/plugin.json` as a complementary channel** (the issue's
  proposal). Rejected: it re-litigates, for one runtime, the call already made
  for the other. On 2026-07-21 `public-mit-npx-supersedes-marketplace-only` made
  npx the primary channel and the marketplace an optional secondary, precisely to
  remove the account and marketplace dependency; adding a marketplace path for
  Codex inverts that without a new fact. It also creates a second surface to keep
  in lockstep with the first — the drift class this repo already had to gate with
  a dedicated CI job for the `core-assets` mirror — while the artifacts on both
  sides would be identical by construction. What the user gains is
  `codex plugin marketplace add` instead of
  `npx voidharness init --runtime codex`: no capability is unlocked.
- **Replace the directory convention with the plugin channel.** Rejected
  outright: it would make installation depend on a marketplace and a plugin
  manager, breaking the account-free promise, and would strand every project
  already wired through `.agents/skills`.

## Reversal cost

Low. Nothing built here forecloses the channel: the skills and hooks a plugin
would bundle are the same artifacts already staged today, so adopting it later is
additive — author the manifest against the existing assets and add a lockstep
gate. Reopen when Codex degrades directory-convention discovery (deprecation, or
plugin skills treated differently from `.agents/skills`), or when a capability is
reachable only through a plugin; scheduled-task templates are the candidate to
watch.
