---
date: 2026-06-01
source: solaar (init test after capability-first refactor)
kind: bug
severity: major
status: proposed
---

# Default plugin pin is hardcoded to `^0.1.0`

## What I saw

Running `void-harness init --all-packs` on Solaar (a fresh consumer) wrote `.void/config.json` with every pack pinned at `^0.1.0`, even though the marketplace HEAD was already `0.3.0`. Immediately after init, `void-harness check` reported 7 plugins behind — for a brand-new install. This is the first impression a new consumer gets, and it makes the tool look stale by default.

## Source

`packages/cli/src/commands/init.ts`:

```ts
const DEFAULT_CONFIG = { core: '^0.1.0', ... } as const;
// ...
for (const pack of packs) config.packs[`@voidcorp/${pack.name}`] = '^0.1.0';
```

The `^0.1.0` literal is hardcoded — it doesn't track the marketplace.

## What would unblock me

`init` should resolve the current marketplace version via `gh api repos/.../contents/.claude-plugin/marketplace.json` (already implemented in `lib/remote.ts` for `check`) and pin to that version. Fallback to `^0.1.0` if remote is unreachable (offline / no auth).

Bonus: emit a one-line confirmation `pinning at marketplace HEAD (^0.3.0)` so the consumer sees what was decided.
