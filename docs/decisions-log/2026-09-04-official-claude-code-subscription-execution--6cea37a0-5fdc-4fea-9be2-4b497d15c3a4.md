---
schemaVersion: 1
id: "adr:6cea37a0-5fdc-4fea-9be2-4b497d15c3a4"
createdAt: "2026-09-04T10:06:09.161Z"
title: "Invoke official Claude Code for subscription-first execution"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Invoke official Claude Code for subscription-first execution

## Context

Claude Code subscription use is a product requirement. Anthropic documents subscription OAuth as
the default Claude Code credential and supports `claude -p`, but API and bearer-token environment
variables take precedence. `--bare` skips OAuth and the keychain. Anthropic also forbids third-party
products from offering Claude.ai login or routing requests through a user's plan credentials.

## Decision

Implement Claude managed execution as a process adapter over the official non-bare `claude -p`
command, with subscription certification as a release gate and API fallback disabled by default.

Claude Code owns login, credential refresh and provider communication. Void Machine never extracts
or copies OAuth credentials, embeds the Agent SDK for this path, offers Claude.ai login, or proxies
Anthropic traffic. In subscription mode it removes API/provider override variables from the child
environment, verifies the effective authentication class without exposing credentials and refuses
when it cannot prove the supported path. The default API budget is zero.

## Consequences

Positive:

- Users keep the subscription workflow they already pay for without giving credentials to Void.
- Authentication precedence cannot silently turn a subscription run into API spend.
- The adapter remains inside Anthropic's documented official CLI automation path.

Negative:

- Non-bare Claude execution may discover ambient configuration, which the outer Machine sandbox
  must contain and the proof must report separately from effect containment.
- Claude CLI authentication and quota behavior can change and therefore needs recurring real tests.
- Subscription `-p` usage may consume Anthropic's separate monthly Agent SDK allowance.

## Alternatives considered

- **Embed the Agent SDK with an API key**: rejected as the default because it forces usage billing
  and makes the product unusable for the approved subscription-only case.
- **Reuse or proxy a subscription OAuth token**: rejected because Void would cross the credential
  and provider boundary Anthropic reserves for its native applications.
- **Use `claude --bare -p`**: rejected for subscription mode because official documentation says it
  skips OAuth and keychain reads.
- **Drop Claude support**: rejected because dual Claude/Codex runtime support is a core acceptance
  criterion.

## Reversal cost

**Low for the kernel, High for Claude availability.** The process adapter can be replaced without
changing core contracts, but no Claude-capable release ships if an official subscription path is
unavailable.
