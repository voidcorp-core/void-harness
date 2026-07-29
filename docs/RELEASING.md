# Releasing void-harness

How to ship a new version. One model, one number — everything moves together.

## Model: total lockstep (pre-1.0)

While the harness is pre-1.0, **one version governs everything** that carries a version (below).
Distinguish **versioned** (all manifests, in lockstep) from **published to npm** (only the CLI):

- Plugin manifests (each `plugin.json`; the catalog is self-hosted at `.claude-plugin/marketplace.json`) — versioned.
- Packs (`@voidcorp/pack-monorepo`, `@voidcorp/pack-nextjs`, …) and the `@voidcorp/harness-graph`
  kernel — versioned, but **not published to npm**: packs ship via the marketplace, and the kernel is
  bundled into the CLI (see DECISIONS.md 2026-07-22).
- **CLI npm package (`voidharness`) — the only package published to npm.** Self-contained
  (the kernel is bundled in), so `npx voidharness` needs nothing else from the registry.

A skill change, a CLI bugfix, and a runtime helper addition all ship under the same version bump.

### Why one number

- **Coherence.** A skill that references a runtime helper ships in the same version as that helper.
- **Trace.** `void-harness --version` matches `pnpm view voidharness version` matches the marketplace HEAD.
- **No skew incidents.** Pre-1.0, every divergence is a support nightmare. Lockstep eliminates the question.

### When we might split (post-1.0)

If runtime npm packages and Claude Code plugins develop genuinely independent cadences (multiple pack runtime patches between marketplace releases), we revisit. Until that's a real observed problem, single number stays.

## Files that carry a version

The bump script touches **all of these**. Don't edit them by hand.

| File | What it's for |
|---|---|
| `packages/core/.claude-plugin/plugin.json` | Core plugin manifest. |
| `packages/packs/<pack>/.claude-plugin/plugin.json` (6 files) | Each pack's plugin manifest. |
| `packages/cli/package.json` | CLI npm package version. |
| `packages/harness-graph/package.json` | harness-graph kernel npm package version. |
| `packages/packs/<pack>/package.json` (pack-monorepo, pack-nextjs) | Runtime npm packages with shipped code. |

`packages/cli/core-assets/.claude-plugin/plugin.json` is **generated** at `prepack` time — do not edit.

## The flow (automated — you do not hand-bump)

Releasing is driven by **release-please** off the Conventional Commits this repo
already enforces. No one runs the bump script by hand in the normal path.

1. **Merge feature/fix PRs to `main` as usual.** `feat:` → minor, `fix:` → patch,
   a breaking change → minor (pre-1.0; `bump-minor-pre-major`). `docs:`/`chore:`/
   `ci:`/`test:` alone do not trigger a release.
2. **release-please maintains a single "release PR"** (`.github/workflows/release.yml`).
   It computes the next version, bumps it across **every** manifest at once (via
   `extra-files` in `release-please-config.json` — the same file list as the bump
   script, plus the core-assets mirror), writes `CHANGELOG.md`, then dispatches
   `ci.yml` and `void-enforce.yml` on that PR's exact head. This explicit dispatch
   avoids a PAT while satisfying the protected `main` checks.
3. **Merge the release PR when you want to cut the release.** That tags `vX.Y.Z`,
   creates the GitHub release, and (once the one-time bootstrap below is done)
   **automatically publishes** `voidharness` to npm. Merge only after `validate`,
   `enforce` and all three install-conformance checks pass. This merge is the only
   human gate (HITL) — there is no separate publish step and no stored token.
4. **Automated publish (`.github/workflows/release.yml`, `publish` job)** via npm
   **Trusted Publishing (OIDC) — tokenless**. Gated on `release_created`, it runs
   under `id-token: write` (no `NODE_AUTH_TOKEN`, no secret): `pnpm check:publish`
   (fails closed if any `workspace:` specifier survived a packed tarball), then
   `pnpm --filter voidharness publish`. Publishing only ever happens in
   CI, from the tagged commit, so the `workspace:` rewrite, the guard, and an npm
   **provenance attestation** are always applied. Only the self-contained CLI is
   published; packs and the kernel ship via the marketplace / bundle. The repo's
   `packageManager` is **pnpm 10** (bumped from 9 because OIDC trusted publishing
   landed in pnpm 10; 11.0.8 has a known 404 bug — pnpm/pnpm#11513).

### First publish (one-time bootstrap)

> **Note (2026-07-24):** this bootstrap is **done**. `voidharness` exists on npm
> (1.2.0, then 2.0.0), both published by hand. Do not re-run it.
>
> Beware of what this section used to claim: that a CI auth failure means the
> bootstrap is missing. When 2.0.0 failed to publish from CI with `E404 PUT
> /voidharness`, that note sent the investigation at the npm account settings,
> and the trusted publisher was configured correctly all along. The real cause
> was in `release.yml`: `setup-node`'s `registry-url` input writes an
> `_authToken` line into a temp `.npmrc`, so npm believed it already had a
> credential and never ran the OIDC exchange (actions/setup-node#1551). **An
> `E404` on publish is a credential problem, and the credential to suspect first
> is the one the workflow injected, not the one npm is missing.**

npm Trusted Publishing configures a publisher on an **existing** package — it
cannot create a brand-new one. So the very first version is bootstrapped by hand,
with no token and no 2FA-bypass:

1. `voidharness` is **unscoped** — no org needed; just an npm account that can
   publish the name (confirmed free as of the rename).
2. From a clean `main` at the target version: `pnpm release` (or
   `pnpm --filter voidharness publish`). Enter your **2FA OTP** when
   prompted — an interactive publish, no stored credential.
3. On npmjs.com → the `voidharness` package → **Settings → Trusted Publisher →
   GitHub Actions**: organization `voidcorp-core`, repository `void-harness`,
   workflow file `release.yml`, environment blank.
4. From the next release on, the CI `publish` job publishes tokenlessly. You never
   run `publish` by hand again.

Two CI gates fail the build on a drift so a version bump can never ship a stale
artifact: `pnpm version:check` (every manifest at the canonical version) and
`pnpm certification:check` (the frozen `certification.json` matches the model +
its `harnessVersion` stamp). Both the release-please flow (via `extra-files`) and
the manual script bump the certification's `harnessVersion` in lockstep, so a
release never breaks CI on a forgotten regenerate.

Release PRs receive the same five checks as feature PRs. Release Please reports
`prs_created` when it creates or updates its PR; the release workflow then uses
GitHub's always-runnable `workflow_dispatch` event for `ci.yml` and
`void-enforce.yml`. It resolves exactly one open `autorelease: pending` PR and
fails closed on zero or multiple candidates. The publish job still reruns its
release safety suite against the tagged tree as defense in depth and for manual
re-publish runs.

Two things are needed, not one, and 2.3.0 is why. A dispatched run proves the
tree is good, but branch protection reads the checks attached to the **pull
request**, and those sit at `action_required` until approved — on 2.3.0 both
dispatched runs were green while the PR stayed `BLOCKED`. So the same step also
approves the waiting `pull_request` runs on that branch. Approving runs the
workflow's own bot just queued is not a review bypass: the human gate is merging
the release PR, and it is untouched.

Both halves poll, and 2.3.1 is why. `prs_created` turns true when the API call
returns, not when the PR becomes searchable by label: the step listed zero
candidates one second before the PR appeared, and failed closed on a race rather
than on a real condition. GitHub also queues the `pull_request` runs on its own
schedule, so a single pass can look at the branch before they exist. Both loops
are bounded and still fail closed — a genuinely missing candidate, or fewer than
two approved runs, stops the release.

The CI validation lane also runs `self-host sync --mode release-gate` followed
by the strict self-host doctor. It builds the hook runner directly from current
TypeScript with the source checkout's esbuild, compiles and executes a
current-source runtime-adapter worker under the isolated staging boundary,
revalidates the source hash before publication, verifies the deterministic
receipt, executes both hooks, and replays their canonical events. No generated
self-host file is published or committed. Missing Claude/Codex executables are
reported as degraded rather than certified. When present, a bounded `--version`
process smoke receives no ambient credentials. Install conformance and later
runtime-invocation certification remain separate gates.

### Manual fallback

`scripts/bump-version.mjs <patch|minor|major|X.Y.Z>` still bumps all manifests
**and the certification `harnessVersion`** (source + core-assets mirror) in
lockstep for an emergency/offline release. After it, run
`pnpm --filter voidharness build:assets` to sync the rest of the mirror,
commit `chore: release vX.Y.Z`, tag, push. Prefer the automated flow.

Consumers on a project pull the new version with:

```bash
void-harness update    # refresh marketplace cache + bump .void/config.json pins
# then restart Claude Code
```

## What counts as breaking

For pre-1.0 we use caret-incompatible semver (`^0.5.x` matches `0.5.*`, not `0.6.*`):

- **Major** (or any minor bump pre-1.0): removes/renames a skill, hook, agent, or manifest field consumers reference. Changes the location of doctrine files. Changes a runtime npm package's public API in a breaking way.
- **Minor**: new skill, new hook, new pack, new runtime export. Additive change to PHILOSOPHY.md.
- **Patch**: skill content edits, hook bugfixes, CLI bugfixes, internal refactors with no consumer-visible API change.

When in doubt, prefer minor over patch — consumers are alerted either way.

## First-bump formatting note

The first run of `bump-version.mjs` normalizes JSON formatting (2-space indent, multi-line arrays). Subsequent bumps touch only the `version` line. Intentional — the script uses `JSON.stringify(value, null, 2)` so we don't carry a hand-tuned formatter just for these manifests.

## Why release-please, not changesets

We chose **release-please**: it derives the bump from Conventional Commits (which
we already enforce), so there is no per-PR ceremony, and its `extra-files` config
bumps all our non-npm manifests (marketplace + 7 plugin.json + mirror) in lockstep
from one canonical version. The release PR keeps a human gate.

[changesets](https://github.com/changesets/changesets) was used earlier for CLI
npm versioning and removed in v0.5.4: its model (independent versions per package,
per-package CHANGELOGs) contradicts the single-number lockstep. If runtime npm
cadence ever splits from marketplace cadence (post-1.0), revisit.

## CHANGELOG

`CHANGELOG.md` is generated and maintained by release-please from the Conventional
Commit history (grouped Features / Bug Fixes). Do not hand-edit it.
