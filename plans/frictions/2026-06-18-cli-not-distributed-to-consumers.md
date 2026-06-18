---
date: 2026-06-18
source: void-harness self (backlog-loop dogfood — "how do I launch from Claude?")
kind: dx
severity: major
status: proposed
---

# The `void-harness` CLI is not distributed to consumers — every `/void-*` command body is unrunnable as written

## What I saw

All `/void-*` slash commands tell Claude to run `npx @voidcorp/harness <cmd>`.
On a real machine that 404s:

```
$ npx @voidcorp/harness doctor
npm error 404 Not Found - GET https://registry.npmjs.org/@voidcorp%2fharness
```

`@voidcorp/harness` is **not published to npm** (`docs/RELEASING.md` step 4:
"the package is not published"), and `npx` does not resolve a pnpm global link.
So the command bodies fail for everyone. They only ever worked for a maintainer
who happens to have `void-harness` on PATH via a local `pnpm link`.

## Why this is the real gap

The marketplace (`voidcorp-core/void-plugins`) distributes the **commands and
skills** via `git-subdir` on `packages/core` — no npm needed, works great. But
it distributes **nothing from `packages/cli`**. The commands assume a CLI that
no channel actually ships:

- not on npm (unpublished),
- not in the marketplace plugin (only `packages/core` is pinned),
- not installed by `void-harness init` (init wires config/settings, not a CLI).

So a fresh consumer can install the plugin, see `/void-doctor` listed, run it,
and get a 404. First impression = broken.

## Stopgap shipped (this branch)

`fix/void-commands-cli-invocation` rewrites the 3 command bodies to prefer
`void-harness <cmd>` (PATH binary) and fall back to `npx` only if absent. This
unblocks anyone who has the CLI on PATH (the maintainer case) without making the
npm case worse. It does **not** solve distribution.

## What would unblock me (decide later)

Pick a real distribution channel for the CLI, then make the command bodies + docs
match it:

1. **Publish `@voidcorp/harness` to npm** (wire RELEASING step 4 into the release
   workflow). Then `npx @voidcorp/harness` works everywhere, zero install. Most
   robust; needs an npm org + publish automation.
2. **Have `void-harness init` install/link the CLI** (e.g. `pnpm add -g` from the
   pinned tag, or a thin launcher script on PATH). Keeps everything git-based,
   but adds an install side effect and a PATH assumption.
3. **Bundle a launcher in the marketplace plugin** that resolves the pinned
   `packages/cli` from the plugin cache. No npm, but more moving parts.

Until one is chosen, the `/void-*` family is maintainer-only.
