---
date: 2026-06-01
source: solaar (init test)
kind: friction
severity: minor
status: proposed
---

# `init` hardcodes `packageManager: "bun"` and `bunx` commands

## What I saw

Solaar uses pnpm (has `pnpm-workspace.yaml`, `pnpm-lock.yaml`), but `init` wrote:

```json
"stack": { "packageManager": "bun", ... },
"commands": { "typecheck": "bunx tsc --noEmit", ... }
```

The TDD-guard hook and other skills read `commands.typecheck` to run validations — using `bunx` in a pnpm project would fail. The consumer has to manually edit `.void/config.json` post-init.

## What would unblock me

Detect the package manager from the lockfile at init time:

- `pnpm-lock.yaml` → pnpm (`pnpm exec`, `pnpm test`, …)
- `bun.lock` / `bun.lockb` → bun (`bunx`, `bun test`)
- `yarn.lock` → yarn
- `package-lock.json` → npm (fallback)

Pass detected pm into the DEFAULT_CONFIG before write.

## Risk if not fixed

Each consumer's first run hits this friction; some will silently leave the wrong `bunx` commands in place (they may not notice immediately), then later debug why a hook silently fails. Brittle DX.
