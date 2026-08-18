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

## Branches: what each one guarantees

Two long-lived branches, with different gates and different levels of autonomy.

| | `develop` | `main` |
|---|---|---|
| Merged by | autopilot, once every required check is green | a human, after reading the change as a whole |
| Guarantees | the suite passed and the doctrine floor held | the above, plus a human said yes |
| CI (`ci.yml`, `void-enforce.yml`) | identical job set to `main` | identical job set to `develop` |
| `release.yml` | never fires | fires on every push — release-please, then publish |
| Server-side protection | same required checks as `main`, no force-push, no deletion | unchanged |

**`develop` is the autonomous branch, so it carries the *same* checks as `main`, not
fewer.** The predicate autopilot merges on is "every required check is green", and
that predicate is satisfied by an *absence* of checks exactly as happily as by
passing ones. A `develop` without CI would not make autopilot cautious; it would
make it blind and confident. This is why `develop` may not exist unprotected, and
why `branch-protection.ts` treats "protection could not be determined" as
"unprotected" (see `packages/cli/src/lib/autopilot/branch-protection.ts`).

Releasing is unchanged and still happens **only from `main`**: `release.yml` is
triggered by `push: branches: [main]` and nothing about the two-branch flow touches
it. `develop` never publishes anything. Work reaches `main` through a human-merged
PR from `develop`; a hotfix applied directly to `main` must be merged back down, or
`develop` silently diverges and starts testing a tree that no longer matches what
ships.

### The promotion pull request opens itself, and stops there

`promotion.yml` runs on every push to `develop` and keeps a `develop` to `main`
pull request standing whenever `develop` holds something `main` does not. It
opens one and never merges it, which is the whole point: merging it is the gate,
and it is the only decision in the cycle that is about content rather than
mechanics. What is automated is the typing, not the judgement.

It opens with the log of what it carries, because this is the one pull request
whose diff is meant to be read as a whole.

So a release costs exactly two human actions: merge the promotion, then merge
the release pull request that release-please proposes on `main`. The first says
what ships, the second sends it to npm. The back-merge below closes the loop
without asking.

### The back-merge is automatic, because the divergence is structural

Merging the release PR writes the version bumps and the changelog to `main`, so
`main` gains commits `develop` does not have on **every** release, and protection
being `strict` refuses the next promotion until they meet. That happened three
times in one day before it was automated.

It is worth being precise about why this is repaired rather than designed away.
Pointing release-please at `develop` would remove the divergence at its source,
and it was the first thing considered. It also proposes a release the moment a
commit lands on `develop`, which is before the human decision that the `main`
gate exists to make. The divergence is therefore a consequence of `main` being
the gate, not a wiring mistake, and automating the repair is the honest trade.

`back-merge.yml` runs on every push to `main` and opens a `main` to `develop`
pull request when the two trees differ. It decides on content rather than on a
commit count: a promotion leaves a merge commit on `main` that `develop` does not
carry, so counting would open an empty pull request every time, and a robot that
opens pull requests nobody needs gets merged without being read.

That pull request merges itself once the required checks pass. It is the one
place auto-merge is allowed, and the reason is a property of its content rather
than a relaxation: it carries the release output a human approved minutes
earlier, so a second reading is ceremony. Anything carrying an unread diff still
stops at a human, which is why `autopilot` refuses `--auto-merge` and this does
not. Native auto-merge is used, so protection and the required checks stand; a
failing check simply leaves it open. It opens rather than pushes: `develop` is
protected with `enforce_admins`, and a branch only a robot may bypass is not
protected. A conflict fails the job instead of being resolved unattended, since
it means `develop` and `main` both touched a file release-please owns.

### Promotion cadence: `develop` to `main`

**Promoting publishes nothing.** The `publish` job is gated on `release_created`, which is
only true when the release PR itself is merged. A promotion merely recomputes that PR. So a
promotion costs almost nothing, while a late one costs a diff nobody reads — and the whole
value of the `main` gate is that someone still reads.

That asymmetry sets the rule:

- **Promote when a coherent set of work is green on `develop`.** Coherence is the trigger,
  not the clock. "End of day" can cut a feature in half or bundle three unrelated subjects.
- **Never let a working day pass without promoting.** The clock is the safety net, not the
  trigger. Roughly ten commits is the point where the promotion PR stops being readable.
- **The gate is not "the diff was reviewed".** It is **"the behaviour was validated on
  `develop`"**. Writing down the gate that is actually performed is what keeps it real; a
  gate everyone claims and nobody performs protects nothing.

A `develop` far ahead of `main` is the failure mode this flow is most exposed to. It
reintroduces exactly the unreviewable batch that the sequential autopilot was designed to
eliminate.

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

1. **Merge feature/fix PRs to `main`** (directly, or promoted from `develop` — see
   Branches above). `feat:` → minor, `fix:` → patch,
   a breaking change → minor (pre-1.0; `bump-minor-pre-major`). `docs:`/`chore:`/
   `ci:`/`test:` alone do not trigger a release.
2. **release-please maintains a single "release PR"** (`.github/workflows/release.yml`).
   It computes the next version, bumps it across **every** manifest at once (via
   `extra-files` in `release-please-config.json` — the same file list as the bump
   script, plus the core-assets mirror) and writes `CHANGELOG.md`. It opens that
   PR with a **GitHub App token**, so the PR receives its required checks the way
   any other PR does.
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

Release PRs receive the same five checks as feature PRs, and getting there took
three releases to get right — so the reason is worth keeping.

A pull request opened with `GITHUB_TOKEN` triggers **no workflows**. That is a
deliberate GitHub anti-recursion rule, not a repository setting, and no amount of
permission granting changes it. ("Allow GitHub Actions to create and approve pull
requests" is enabled here and was never the blocker.)

The workflow used to answer that by hand: resolve the single open
`autorelease: pending` PR, dispatch `ci.yml` and `void-enforce.yml` at its exact
head, then approve the `pull_request` runs sitting at `action_required` — because
branch protection reads the checks attached to the PR, and on 2.3.0 both
dispatched runs were green while the PR stayed `BLOCKED`. It also had to scope
the approval to the head SHA rather than the branch (2.4.0: a long-lived release
branch met the quota with never-approved runs from previous cycles) and to poll
rather than sample (2.3.1: `prs_created` turns true before the PR is searchable).

All of it is gone. The release job now mints a token from a **GitHub App**
(`RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY`, `Contents` and `Pull requests` as
read & write, installed on this repository only) and hands it to release-please.
An App token is not `GITHUB_TOKEN`, so the pull request it opens triggers
workflows normally. The `actions: write` permission went with the dispatch.

`packages/cli/src/lib/release-workflow.test.ts` pins this: the App token is used,
and none of the removed machinery has crept back. A single `GITHUB_TOKEN`
fallback would restore the whole failure silently and would only be noticed at
the next release.

The publish job still reruns its release safety suite against the tagged tree, as
defense in depth and for manual re-publish runs.

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

## Package size ceilings

`pnpm check:size` (`scripts/check-package-size.mjs`, run in CI beside `check:publish`) packs every
publishable package with `pnpm pack` and fails when a compressed tarball exceeds its declared
ceiling. The compressed tarball is what a consumer downloads on `npx voidharness`; unpacked and
bundle sizes are diagnostics, not budgets. Every size prints on every run, breach or not, so growth
reads as a trajectory rather than a one-day alarm.

Ceilings live in `PACKAGE_LIMITS` in that script, set 2026-08-06 with roughly one sixth of headroom
over the sizes measured then (voidharness 728.2 kB, harness-graph 85.7 kB, packs under 8 kB).

**Raising a ceiling is normal.** Do it in the same commit as the change that needs the room, with
the reason in the commit message, so the growth is a decision on the record rather than a drift
nobody signed. A package published without a ceiling fails the gate: an unbounded package is the one
that grows.

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
