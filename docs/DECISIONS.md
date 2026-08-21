# Decisions log

Each current decision is an immutable file under `docs/decisions-log/`. Create
one with `void-harness decisions new`, validate with `pnpm decisions:check`, and
render the current Markdown or JSON projection with `void-harness decisions
render`. No worker writes a shared index.

> **Frozen legacy snapshot.** The entries below preserve the historical
> newest-first log through 2026-07-24 so existing date links remain useful.
> They are not regenerated or edited. New decisions exist only as individual
> source files and in read-only projections.

## 2026-07-24: Tokenless publishing works; provenance does not yet, and the README says so

With the `registry-url` bug fixed, 2.0.1 published from CI with **no token anywhere** —
trusted publishing via OIDC works. But the attestation endpoint
(`/-/npm/v1/attestations/voidharness@2.0.1`) returns 404: **no provenance was
attached**, despite the publish step being named "provenance auto" and
`docs/RELEASING.md` promising provenance-signed releases.

npm attaches provenance automatically for a trusted-publishing flow on npm >=
11.5.1, and the runner has npm 11.x. The likely reason it did not fire: the
publish goes through `pnpm publish`, so pnpm performs the OIDC exchange itself and
hands npm a short-lived token. npm then sees an ordinary token publish, not a
trusted-publishing one, and skips the automatic attestation.

Two things follow.

**The mechanism is now declared explicitly.** `publishConfig.provenance: true` in
`packages/cli/package.json`, which is npm's documented opt-in and travels with the
package rather than living in a workflow step. Whether pnpm honours it end to end
is unverified — proving it requires cutting a release, and a version should not be
burned on an experiment. The next release settles it.

**The README stops claiming it.** It previously advertised provenance-signed
releases; two published versions carry no attestation. The claim is replaced with
what is actually verified — tokenless OIDC publishing, no npm token in the repo —
plus an explicit "do not rely on a provenance attestation". It will claim
provenance again once one is observed on a real release.

This is the same discipline applied to the status score: report what is observed,
not what was intended. A supply-chain guarantee is the last place to round up.

## 2026-07-24: Provenance was never a pnpm problem: npm rejects attestations from a private repo

Completes the earlier note the same day, which concluded that provenance "does not
yet" work and guessed at the cause. The guess was wrong and the record should not
keep it.

Once `publishConfig.provenance: true` was declared, the 2.0.2 publish produced the
attestation correctly:

```
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: search.sigstore.dev
npm error 422 Unprocessable Entity - Error verifying sigstore provenance bundle:
  Unsupported GitHub Actions source repository visibility: "private".
  Only public source repositories are supported when publishing with provenance.
```

So the generation side worked all along. **npm refuses a provenance attestation
whose source repository is private**, because the attestation's entire value is
that a third party can follow it back to the commit and workflow that produced the
artifact — which is impossible if nobody can read the repo.

The earlier hypothesis (that `pnpm publish` performed the OIDC exchange itself and
handed npm a token, so npm skipped the automatic attestation) was plausible and
wrong. What actually happened on 2.0.1 is simpler: provenance was never requested,
because the `publishConfig` opt-in did not exist yet.

The repository was made public, the publish was re-dispatched, and
`/-/npm/v1/attestations/voidharness@2.0.2` now returns a sigstore bundle. The
README claims provenance again, with the two commands a reader can run to check
the claim instead of believing it.

**The dependency worth remembering**: provenance is not merely nice-to-have once
you are public — it is *only available* once you are public. For a project whose
pitch is a supply-chain-honest, account-free install, that made opening the
repository a technical prerequisite rather than a marketing decision.

## 2026-07-24: The publish job must not set setup-node's registry-url (it silently disables OIDC)

Publishing 2.0.0 from CI failed with `npm error code E404 / PUT
https://registry.npmjs.org/voidharness - Not found`, and no OIDC exchange appeared
anywhere in the logs.

The cause was not the npm side. `actions/setup-node` reacts to a `registry-url:`
input by writing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into a temp
`.npmrc` and pointing `NPM_CONFIG_USERCONFIG` at it, with `NODE_AUTH_TOKEN`
defaulting to the literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. npm then sees a
credential already configured, **never initiates the trusted-publishing OIDC
exchange**, and authenticates with that garbage token. The registry answers a
permission failure as `E404`, which reads like "the package does not exist".
Upstream: actions/setup-node#1551.

`registry.npmjs.org` is the default registry, so the input bought nothing and cost
the entire tokenless-publish flow. It is now removed, with a comment on the step
saying why it must not come back.

### The expensive part was the misdiagnosis

`docs/RELEASING.md` carried a note from the package rename saying the trusted
publisher had not been bootstrapped for the new name and that "until it is, the CI
publish job will fail auth". That note was stale (the bootstrap had happened) but
it matched the symptom perfectly, so the investigation went to the npm account
settings and concluded the maintainer had to re-link the publisher. They did not:
it was configured all along. 2.0.0 was then published manually, which is why it
carries **no provenance attestation**.

Lesson recorded in `docs/RELEASING.md`: an `E404` on publish is a credential
problem, and the credential to suspect first is the one the workflow injected, not
the one npm is missing. A stale doc that explains a symptom is more dangerous than
no doc, because it terminates the search early.

## 2026-07-24: The release gate lives in the publish job, not on the release PR

Preparing the 2.0.0 release surfaced a hole: **no check ever runs on the release
PR**. `ci.yml` triggers on `pull_request: [main]`, and the release PR does target
main, but GitHub deliberately does not trigger workflows for a pull request opened
by the bot's `GITHUB_TOKEN` (anti-recursion). Polling the PR for 40 minutes
returned "no checks reported" because none were ever scheduled.

That mattered because the `publish` job only ran `pnpm install` and
`check:publish` before shipping to npm. Merging the release PR would tag and
publish a tree that **no test suite had ever run against** — and the version
bumps, which are precisely what `version:check` exists to catch, only ever appear
on that unchecked branch.

Two ways to close it:

- **Make the bot's PR trigger CI**, by having release-please authenticate with a
  PAT instead of `GITHUB_TOKEN`. Works, but buys a long-lived secret to store,
  rotate and scope, and it fixes only the *symptom* — the publish job would still
  be unguarded on the `workflow_dispatch` path.
- **Gate the publish job itself** (chosen): run `version:check`, `typecheck` and
  `test` inside `publish`, against the exact tree being published.

The second is strictly stronger. It validates what actually ships rather than
trusting that main was green when the PR was cut, it covers the manual
`workflow_dispatch` re-publish path too, and it needs no new secret. Publishing to
npm is irreversible: a failing step costs a re-run, a bad publish costs a
deprecation notice forever.

HITL is unchanged — merging the release PR is still the single deliberate human
action.

## 2026-07-24: Codex parity is reached by filling the gap, not by declaring it unsupported

A Codex-wired project received **2 enforcement hooks where a Claude one received
18**, and none of the 5 read-only agents. An external audit proposed closing this
by *declaring* it: a `requires:` field on skills plus an `unsupported` capability
state, so `status` would honestly report what a runtime cannot do.

Rejected. Declaring a gap documents it; it does not close it, and it makes
"multi-runtime" mean "Claude, plus a degraded second runtime". The chosen path is
the opposite: **diff what Claude actually receives against what Codex receives,
and fill the difference**, keeping `requires`/`unsupported` for the residue that
genuinely cannot be filled.

The diff, once measured against the official Codex docs:

| Artifact | Codex before | Resolution |
| --- | --- | --- |
| Skills | staged (core + packs) | already at parity |
| Hooks | 2 of 18 | filled: full mirror |
| Agents (5) | none | filled: compiled into Codex skills |
| Commands (5) | none | non-issue: 1 is already a skill, 4 wrap a runtime-agnostic CLI |

### Why the hooks were not a config change

The blocker was not the manifest. The content-scanning hooks read
`.tool_input.file_path` + `.new_string` — Claude's **single-file** `Edit`/`Write`
shape. Codex edits via `apply_patch`, a **multi-file diff**. Wiring the hooks as-is
would have fired them against an empty payload: they would have passed everything
while reporting green. **A wired-but-dead hook is worse than an honest absence**,
because it removes the pressure to fix what it pretends to cover.

So `_hooklib.sh` gained `hooklib_edits`, a runtime-agnostic stream of one
`<path, new-content>` record per edited file, and the content-scanning hooks
iterate it. Only added (`+`) lines are collected, and every file in a patch is
scanned — not just the first.

### Why the agents are compiled, not re-authored

Codex has no stable subagent to spawn (experimental), and its custom prompts are
deprecated in favour of skills — which are also `~/.codex`-only, never repo-local.
So skills are the target form. Two ways to get there:

- **hand-write 5 SKILL.md files** — duplicates each agent's doctrine body, giving
  one capability two sources guaranteed to drift, and trips the repo's
  no-responsibility-overlap rule;
- **compile the existing agent definitions at wire time** — chosen. One authored
  doctrine per capability, rendered per runtime, which is precisely what the
  runtime seam exists for.

Degradation stated in the compiled file itself: Codex gets the capability, not the
context isolation.

### What is deliberately still missing

`trim-large-output` is **not** mirrored. Its `PostToolUse` output rewriting
(`updatedToolOutput`) is unconfirmed on Codex and a sibling field is documented as
failing there, so wiring it would spill files to disk for no context benefit. The
irreducible residue (Workflow tool, claude-in-chrome, unpublished `void-make-pdf`,
subagent isolation) is tabled in `docs/CODEX.md` — that is where the notion of a
prerequisite keeps its meaning.

## 2026-07-23: node engines floor is >=22.12; CI and dev stay on Node 24

The published `engines.node` is `>=22.12`, while CI (`ci.yml`, `release.yml`) and
the recommended maintainer environment stay on **Node 24**.

Earlier (2026-07-22) the floor was raised to `>=24` on the reasoning "CI is on 24,
standardize". The second external audit (2026-07-23) flagged this as needless
adoption friction, and it was reconsidered: the CLI uses no Node-24-only feature,
so `>=24` is a *declared* constraint, not a technical one. With no `engine-strict`
in a consumer's `.npmrc`, a Node 22 (LTS, supported to 2027) user gets a warning
but the install still works; with `engine-strict` it hard-fails — pure friction
for a tool meant to be viral and account-free.

Resolution (maintainer call): **accept Node 22+ (`>=22.12`, the Vite 8 floor) while
keeping the codebase and CI on 24** — modern by default, welcoming to those still
on 22. Reversible in one line. Supersedes the `>=24` bump on the engines floor
only; CI's Node version is unchanged.

## 2026-07-22: stay on TypeScript 5.9 for now; defer 6 and pilot 7 later

The external audit (2026-07-22) noted PHILOSOPHY.md speaks of "TypeScript 6" while
the repo resolves TypeScript 5.9, and recommended moving to TS 6 now and piloting
the native TS 7 compiler.

Decision: **stay on 5.9** for this cycle. The credible alternative — jump to 6/7
now — was weighed and deferred:

- **TS 7 (the native compiler) is preview**; its full programmatic API (which
  `tsup`, `tsx`, and the vitest transform pipeline depend on) lands in 7.1. A repo
  whose build and test toolchain consume the TS API cannot adopt the native
  compiler wholesale without risking the whole pipeline.
- **TS 6** brings no forcing function for this codebase today; the strict-mode
  features we rely on are already in 5.9.

Plan: bump 5.9 → 6 when 6 is stable and the toolchain follows; treat TS 7 as a
**watch item**, piloting it only for the standalone compile step (not the API),
then migrating fully once the ecosystem is ready. PHILOSOPHY.md's "TypeScript 6"
mention is aspirational, not a current dependency — no change needed there beyond
this record.

## 2026-07-22: Runtime adapter seam — core iterates adapters, doc is per-runtime, runtimes add a posteriori

Context: the first multi-runtime `init` (same day, earlier) auto-wired Codex but stayed
**bolt-on** — `init`/`doctor`/`update` branched with `if (claude) … / if (codex) …`. Folpe's
standing directive is that void-harness must be **agnostic by construction**: multi-runtime and
multi-model in permanence, not Claude-first with others bolted on. A hardcoded runtime branch
makes every new runtime (Codex exec, Hermes, a local agent) a core edit, which contradicts that.

Decision: introduce a first-class **runtime adapter seam** (`packages/cli/src/lib/runtime-adapters.ts`).

- A `RuntimeAdapter` declares `{ id, label, detect, prerequisites, wire, doctorChecks }`. `wire`
  materializes the runtime's active layer **and its own doctrine doc**; `doctorChecks` verifies
  that layer + doc. The registry `ADAPTERS = [claude, codex]` is the single place a runtime is
  known. **Core commands never branch on a runtime name** — `init`, `runtime add`, and `doctor`
  iterate the adapters. Adding a runtime = one adapter object + registration, zero command edits.
- This is the **agent-runtime** axis only. The orthogonal **model-provider** axis (Anthropic /
  OpenAI-compatible / Ollama / custom) is a separate seam and is explicitly not conflated (the
  universal LLM proxy stays rejected).

Two sub-decisions, both with a credible alternative:

1. **Doctrine doc is per-runtime, not always-both.** Each adapter's `wire` writes only its own doc
   (`init --runtime claude` → only `CLAUDE.md`; `codex` → only `AGENTS.md`; greenfield default
   `both` → both). `doctor` checks only the docs of *detected* runtimes. Rejected alternative: the
   earlier "always emit both docs, cheap and future-proof" behavior — rejected because it made a
   Codex-only project carry (and be health-checked against) a `CLAUDE.md` it never uses, which is
   the Claude-centric premise this directive removes. The sister-doc lockstep gate stays a
   **harness-repo** rule; a consumer only carries what it wired.

2. **Runtimes add a posteriori without friction:** a new `void-harness runtime add <runtime>`
   (+ `runtime list`) wires exactly one runtime's layer on an already-`init`-ed project, touching
   nothing the other runtime owns (verified byte-for-byte: adding Codex leaves `.claude/settings.json`
   identical). This is the `void runtime add` command from the multi-runtime spec, and directly
   serves the archetype "init with Claude, work for weeks, then add Codex painlessly." Rejected
   alternative: telling the user to re-run `init --runtime both --force` — heavier, rewrites Claude
   state, and reads as a reinstall rather than an additive step.

Also folded in here (same refactor): `doctor`'s Claude-marketplace checks (`gh`, plugin cache,
remote versions, packs coherence) now run only when Claude is detected, so a Codex-only project
sees no marketplace noise; and the Codex-floor decision logic (`codexFloorHealth`,
`refreshCodexFloor`) was extracted into `lib/codex-floor.ts` as tested pure-ish functions, fixing
a `doctor` crash on a non-object `.codex/hooks.json` and a false-negative when a sourced hook
library was missing.

Blind spot held deliberately: **over-abstraction.** Exactly the two adapters that exist are
wired — no speculative generality. Hermes is added only after reading its docs
(source-driven-development), as a later phase; the seam is what makes that a one-file change.
Supersedes the "both docs always emitted" line from the earlier same-day decision.

## 2026-07-22: a documented peerDependency of composition between packs is allowed; a bundled runtime dep is not

`docs/ARCHITECTURE.md` said "two packs may not depend on each other", but
`pack-nextjs` declares `peerDependencies: { @voidcorp/pack-monorepo: workspace:^ }`
— it imports `Result`/`ok`/`err` from `@voidcorp/pack-monorepo/result` in
`withWebhookSafety.ts`. Doctrine and code contradicted (flagged by the external
audit, 2026-07-22).

The credible alternative was the audit's recommendation: **extract the shared
primitives (`result`, `option`, `pipe`) into a new package** that both packs
depend on, making the packs truly independent. Rejected as premature: the entire
shared surface is three pure functional primitives, and `pack-nextjs`'s only use
is `Result`/`ok`/`err` in one file. Creating, versioning, and publishing a new
package to remove one small, intentional edge is exactly the extraction
`void-package-extraction` warns against — more moving parts than the coupling it
removes.

Resolution: **amend the rule** rather than the code. The ban now targets what it
was really meant to prevent — a **bundled runtime `dependencies` edge** (a hidden
graph that couples release cycles). An **explicit `peerDependency` of
composition** is allowed when: it is declared in `package.json`
`peerDependencies`, documented in the pack README, the shared surface is small,
and `init` co-installs both packs. `pack-nextjs → pack-monorepo` is the
sanctioned example. If the shared surface ever grows substantial, revisit the
extraction (the rule still sends shared *logic* to `core/`).

## 2026-07-22: the plugin marketplace is self-hosted in void-harness, not a dedicated catalog repo

The Claude Code plugin marketplace moves from a dedicated catalog repo
(`voidcorp-core/void-plugins`, which referenced this repo via `git-subdir` + a
commit sha per entry) into **this repo**: a `.claude-plugin/marketplace.json` at
the root lists every plugin as a **local subdirectory** (`./packages/core`,
`./packages/packs/pack-*`). `MARKETPLACE_REPO` becomes `voidcorp-core/void-harness`.

The credible alternative was keeping the dedicated `void-plugins` catalog.
Rejected: it duplicated the plugin set in a second repo, required a `bump-shas`
step to re-pin every entry on each release (a drift surface), and — once
void-harness itself goes public — added a second public repo for no gain. The
official Claude Code docs support a relative/local `source` (`"./packages/core"`),
resolved from the marketplace repo root, versioned by each plugin's own
`plugin.json` at HEAD — no manual sha pinning. That makes the plugin.json the
single source of truth and collapses the two repos into one.

Load-bearing constraints preserved:

- **`MARKETPLACE_NAME` stays `voidcorp`.** Existing installs carry
  `harness@voidcorp` in `enabledPlugins`; renaming the marketplace would break
  them. Only the repo moved.
- **Back-compat.** Installs that already point `extraKnownMarketplaces.voidcorp`
  at `void-plugins` keep working (that repo still resolves via its pinned
  git-subdir); `marketplaceRepoFrom(settings, …)` reads the repo from settings,
  so only *new* inits target the self-hosted catalog. `void-plugins` is kept
  alive, deprecated, until installs migrate.
- **Version resolution.** `remote.ts` `pinnedCoordinates` now resolves a local
  string source into the marketplace repo at HEAD (`{ repo: marketplaceRepo,
  basePath: <path>/, ref: HEAD }`), so `check`/`doctor`/`update` read the version
  from `packages/<x>/.claude-plugin/plugin.json` in this repo. A catalog
  invariants test freezes that the entry set is exactly core + every pack and
  each source dir exists with a `plugin.json`.

Real end-to-end resolution (Claude Code `/plugin marketplace add
voidcorp-core/void-harness`) can only be exercised once the repo is public; the
structure, remote-version logic, and invariants are covered by unit tests.

Supersedes the marketplace-secondary-channel note of 2026-07-21 (the channel is
unchanged — optional secondary; only its hosting moved).

## 2026-07-22: `init` auto-wires the Codex safety floor -- runtimes are symmetric, gated by `--runtime`

Context: `void-harness init` treated Codex as a second-class runtime. It emitted
`AGENTS.md` (doctrine) but the Codex *safety floor* -- `.codex/hooks.json` + resolvable hook
scripts + `${VOID_HOOKS_DIR}` -- was a manual three-step opt-in documented in `docs/CODEX.md`.
The Claude side, by contrast, was fully auto-wired (marketplace + `enabledPlugins` merged into
`.claude/settings.json`). The asymmetry meant a Codex-only project shipped with no enforced
floor unless the user hand-copied files, and was still nagged about `gh`/marketplace
prerequisites that only matter for the Claude plugin channel.

Decision: `init` wires each runtime's active layer symmetrically.

- **Runtime resolution.** A new `--runtime claude|codex|both` flag; default is the
  auto-detected footprint (`.claude/`/`CLAUDE.md` -> claude, `.codex/`/`AGENTS.md` -> codex),
  falling back to both on a greenfield project. `resolveRuntimes` + `detectRuntimes` are pure
  and unit-tested.
- **Codex floor auto-wired.** When Codex is selected, `init` stages the four floor scripts
  (`block-dangerous-bash.sh`, `protect-sensitive-files.sh`, and the sourced `_hooklib.sh` +
  `_checks.sh`) into `.void/hooks/`, and compiles `.codex/hooks.json` from the single source
  `packages/core/codex/hooks.json`, rewriting the `$comment` to a generated-file notice.
- **Gating.** A Claude-only wire skips the Codex floor; a Codex-only wire skips the
  `gh`/marketplace prerequisites, the core pin, the `settings.json` merge, and the Claude
  "restart + trust" checklist steps. Both doctrine docs are still always emitted (cheap
  pointers, future-proof). `doctor` gained a `codex floor` check that runs whenever a `.codex/`
  dir exists: every hook the manifest invokes must be a staged, executable script.
- **Freshness across upgrades.** The floor scripts ship inside the CLI package, so
  a staged floor lags after a CLI upgrade. `void-harness update` re-stages it to
  the running CLI's version, gated on a content-diff (`codexFloorDrift`) so a no-op
  update stays a no-op and the status reads fresh/refreshed honestly. This is the
  Codex analogue of update's existing Claude marketplace cache/pin refresh —
  `doctor` detects a broken floor, `update` reconciles a stale one. The
  materialization itself (`wireCodexFloor`) lives in `lib/codex-floor.ts` and is
  shared by `init` and `update`, writing the manifest via a temp-file rename so a
  reader never sees a half-written `.codex/hooks.json`.

Key sub-decision -- **the `${VOID_HOOKS_DIR}` placeholder compiles to the project-relative
`.void/hooks`, not an absolute path.** Rationale: `.codex/hooks.json` is a project-local config
a team commits (like `.claude/settings.json`); an absolute path would leak `$HOME` and break on
every other machine and in CI. Relative is committable and portable. The trade-off it accepts:
it assumes Codex runs hooks with cwd at the project root, mirroring Claude Code. That mirror is
consistent with CODEX.md's stated model ("same event names, schema, exit-code convention") but
is not yet E2E-verified against a real Codex run -- flagged as the one pending link in
`docs/CODEX.md` (§Status), alongside the already-pending end-to-end firing.

Rejected alternatives. (1) **Absolute resolved path** in the manifest -- zero-config and
cwd-independent, but not committable (leaks the local home dir, breaks across machines); wrong
for a file meant to live in the repo. (2) **Keep `${VOID_HOOKS_DIR}` and require a manual
`export`** -- committable and portable but leaves a manual step, which is the exact friction
this change removes; the point was to make `init` "nickel" for Codex. (3) **Keep the floor a
documented opt-in** -- rejected: it left Codex-only installs unenforced by default, the
opposite of the safety pillar. (4) **Conditionally emit only the selected runtime's doctrine
doc** -- initially rejected here (both docs as cheap future-proof pointers), but **superseded the
same day** by the runtime-adapter-seam decision: doc ownership is now per-runtime (each adapter
writes only its own doc), because always-both made a Codex-only project carry a `CLAUDE.md` it
never uses — the Claude-centric premise the agnostic-by-construction directive removes. See
`2026-07-22-runtime-adapter-seam-per-runtime-doc-runtime-add.md`.

## 2026-07-22: the CLI npm package is renamed @voidfactory/harness -> voidharness (unscoped)

The install entrypoint `npx @voidfactory/harness init` is long to type. The CLI
package is renamed to the unscoped **`voidharness`** (verified free on npm), so the
first contact becomes `npx voidharness init`. The binary keeps its descriptive name
`void-harness` and gains a short alias `vh` (a bin name is independent of the
squatted `vh` npm package).

The credible alternative was keeping the scoped `@voidfactory/harness` and only
shortening the *installed* usage (`vh init`). Rejected: for an account-free, viral
tool the friction that matters is the first `npx`, and only the package name
shortens that. `vh` and `harness` are both taken on npm; `voidharness` is the
shortest free, readable name.

Why now: the repo is not yet public and adoption is ~zero, so the rename breaks no
one. After a public launch with users it would be painful. The lost `@voidfactory`
scope is accepted — the brand is carried by the GitHub org (`voidcorp-core`), not
the npm scope.

**Operational consequence (one-time, maintainer):** npm Trusted Publishing and
provenance were configured for `@voidfactory/harness`. They must be reconfigured
for `voidharness`: bootstrap the first `voidharness` publish manually (2FA OTP,
as with the original 1.0.0), then set the Trusted Publisher on the `voidharness`
package (org `voidcorp-core`, repo `void-harness`, workflow `release.yml`). Until
that is done, the CI publish job will fail auth for the new name. `@voidfactory/harness`
1.2.0 stays on npm as a dead-end; a final deprecate-with-pointer is optional.
Supersedes 2026-07-22-cli-published-as-voidfactory-harness-self-contained on the
package name only (the self-contained-bundle decision is unchanged).

## 2026-07-22: the CLI publishes as @voidfactory/harness, self-contained (bundled kernel); command stays void-harness

The npm scope `@voidcorp` is not available, so the public CLI publishes under **`@voidfactory/harness`**
(the 2026-07-21 public-MIT decision assumed `@voidcorp/harness`; this refines the name only). The
installed **command stays `void-harness`** — the `bin` name is independent of the npm scope, so
`npx @voidfactory/harness init` and the installed `void-harness` are the same tool.

**Only the CLI is published, and it is self-contained.** The CLI depended on the workspace package
`@voidcorp/harness-graph` at runtime; rather than rename the kernel's ~130 references to a new scope,
tsup now **bundles the kernel into the CLI** (`noExternal: ['@voidcorp/harness-graph']`), so the
published `@voidfactory/harness` has no internal-scope dependency — one atomic npm artifact. The
kernel's only runtime dep, `yaml`, is a normal public package declared in the CLI's `dependencies`
(Node handles its CommonJS interop; bundling it broke on a dynamic `require`). `@voidcorp/harness-graph`
moves to `devDependencies` (needed at build to bundle, never at runtime). The `release` script
publishes only `@voidfactory/harness`; the kernel, packs, and apps stay workspace-internal /
marketplace, unpublished.

The credible alternatives were rejected:
- **Rename the whole `@voidcorp` scope to `@voidfactory`** (~350 refs across kernel, packs, apps,
  docs, history): far larger surface for no functional gain — nothing but the CLI needs to be on npm
  for the public flow (packs ship via the marketplace). Minimal change was an explicit goal.
- **Publish the kernel separately as `@voidfactory/harness-graph`**: forces a consumer to resolve two
  packages and versions them apart; a single self-contained CLI is cleaner and atomically versioned.

**Accepted (conscious):** the published `package.json` retains `@voidcorp/harness-graph` in
`devDependencies` (rewritten by pnpm to a concrete `0.17.0` pointing at a package never pushed to
npm). It is needed in the workspace for tsup to bundle the kernel at build time; it is inert for every
consumer path (npm never installs a package's devDependencies transitively — verified: a fresh install
pulls only `@clack/prompts`, `yaml`, `zod`). The only way to hit it is `npm install` *inside the
extracted tarball* (SBOM tooling, clone-and-poke), which would `E404` loudly, not silently. Stripping
it would require a fragile prepack manipulation; the harmless, standard metadata is preferred over that
fragility.

The GitHub org (`voidcorp-core`) and the Claude Code plugin naming (`@voidcorp/harness-nextjs`, the
optional secondary marketplace channel) are deliberately **unchanged** — renaming the org is an
external repo-transfer op, and the marketplace naming couples to a separate repo; neither blocks the
npm publish.

Why: this ships the account-free `npx @voidfactory/harness` install with the smallest possible change
to the repo and zero change to GitHub, while keeping the published artifact clean and self-contained.
Validated end-to-end, not just configured: `npm pack` → install the tarball in a clean directory →
`void-harness status` renders correctly from the bundled certification + model, with no monorepo and
no internal-scope dependency.

## 2026-07-22: npm publish is automated in CI, provenance-signed, gated on the release-PR merge

> **Update (same day): tokenless via Trusted Publishing, not a stored token.** The first cut of
> this decision used an `NPM_TOKEN` automation secret. npm's own UI flags the 2FA-bypass token that
> a CI token implies as a security risk and steers to **Trusted Publishing (OIDC)** for automation.
> So the design is now **tokenless**: the `publish` job authenticates via GitHub OIDC (`id-token:
> write`, no `NODE_AUTH_TOKEN`, no repo secret), and npm attaches provenance automatically. The one
> catch npm documents: Trusted Publishing configures a publisher on an **existing** package and
> cannot create a new one — so v1 is a one-time manual `pnpm publish` bootstrap (interactive 2FA, no
> stored credential), after which the trusted publisher is linked and every later release is
> tokenless. The repo's `packageManager` is **pnpm 10** (OIDC landed in pnpm 10; 11.0.8 has a known 404 bug,
> pnpm/pnpm#11513). Everything below about HITL, CI-only publishing, and the `workspace:` rewrite
> still holds; only the credential mechanism changed (stored token → OIDC).

Context: `@voidfactory/harness` was version-managed by release-please but **published by hand**
(`pnpm release` from a laptop). The publish-readiness audit flagged two consequences: (1) no npm
**provenance** — an attestation that the tarball was built from a specific commit in a verifiable
CI run can only be minted from CI via OIDC, never from a laptop; for a public package installed
account-free by strangers, that is a real trust signal; (2) supply-chain surface — a long-lived
token on a dev machine and a `dist/` whose freshness rests on the maintainer remembering to rebuild.

Decision: publishing happens **only in CI**, in `.github/workflows/release.yml`'s `publish` job,
gated on `needs.release-please.outputs.release_created == 'true'` — i.e. it fires exactly when a
human merges the release-please PR. That merge is the single HITL gate; there is no separate
"publish" button and no supported manual `npm publish`. The job runs under `id-token: write`,
executes `pnpm check:publish` (fails closed if any `workspace:` specifier survived a packed
tarball), then `pnpm --filter @voidfactory/harness publish` with `NPM_CONFIG_PROVENANCE=true`.

Why this shape:
- **HITL = merging the release PR, not a second button.** The repo's doctrine is "every release is
  a deliberate human act." Merging the version-bump/changelog PR already IS that act; adding a
  separate manual publish step would be ceremony without added control. Publishing on *every* push
  would remove the gate entirely — rejected.
- **CI-only publish makes the `workspace:` footgun structurally impossible.** `pnpm publish`
  rewrites `workspace:*` to a real range; a manual `npm publish` does not and can ship a broken
  manifest. Removing the human from the publish path means the rewrite + the `check:publish` guard
  are *always* applied — the pérenne fix, not a "remember to use pnpm" convention.
- **Provenance now, Trusted Publishing later.** The first publish needs a token
  (`NPM_TOKEN`, a granular automation token scoped to the package). Once the package exists on npm,
  this can be upgraded to tokenless **Trusted Publishing** (OIDC, configured npm-side), eliminating
  the stored token. Deferred because it requires the package to already be published.

Rejected alternatives: (a) keep manual `pnpm release` — no provenance, laptop-token risk, and the
`workspace:` guard only *detects* a bad manual publish, it can't prevent one; (b) publish on every
push to main — no human gate, violates the release-is-deliberate doctrine; (c) drop
`@voidcorp/harness-graph` from devDependencies to avoid the `workspace:` rewrite entirely —
rejected: it is a build-time (tsup-inlined) dependency pnpm must link, so removing it risks
breaking the bundle build; the CI + pnpm-publish path handles the rewrite deterministically.
The manual `pnpm release` script stays only as an emergency fallback, documented as non-standard.

## 2026-07-21: enforcement is a two-tier, per-runtime capability attribute with derived inline tiers

Phase A step A2 (spec `docs/specs/2026-07-21-void-harness-public-multiruntime-os.md`, Fork 1) makes
**enforcement** a structured, per-runtime field of the capability contract rather than a single global
flag. Each capability declares:

```yaml
enforcement:
  floor: ci            # runtime-agnostic CI floor (the void-enforce Action) — every runtime inherits it
  inline:              # deep in-session enforcement, per runtime
    claude: pretooluse # blocking PreToolUse hook where the runtime supports it
    codex: pretooluse
    hermes: ci-only    # structural limit, declared not hidden
```

The credible alternative was a single boolean/enum "is this skill enforced?". Rejected: it cannot
express that the *same* capability enforces deeply in-session on Claude/Codex but only at the CI floor
on a runtime (Hermes) that has no PreToolUse equivalent. Collapsing that to one value would either
overstate Hermes' guarantees or understate Claude's. The two-tier split (floor everywhere + inline
per runtime) is the honest shape, and it lets the score reward a runtime on its own ceiling — Hermes'
`ci-only` is not a failure, so it never caps the global score (spec Fork 6).

The `inline.{claude,codex}` tier is **derived, not hand-classified**: the A2 backfill reads the
existing `enforces` edges in `model.json` (hook → skill) and assigns `pretooluse` to the 16 skills
that are the target of one, `active` to the rest. Deriving from the real hook wiring means the tier
map cannot silently drift from what the hooks actually do — the same source of truth the graph
already trusts.

Why: the promise of a portable harness is only credible if enforcement is expressed per runtime and
never masked. A capability that claims uniform enforcement across runtimes that cannot deliver it is
exactly the dishonesty the five-state model exists to prevent. Encoding enforcement as a derived,
per-runtime contract keeps the portability and enforcement score dimensions from lying about each
other (they were otherwise mutually capping — see the spec's Fork 1/Fork 6 resolution).

## 2026-07-21: `trim-large-output` PostToolUse hook -- cap oversized tool output, spill the full to disk

Context: measured, not assumed. Decomposing two real heavy feature sessions (peak
context 848k and 965k of 1M) by token category showed the driver of context growth is the
implementation loop, not code exploration: Bash/build/test output (14-27%), MCP payloads
(Linear, up to 26%), and the agent's own Write/Edit output (20-29%). File exploration is
already delegated to subagents, so a code-graph/"graph-first recall" tool (Graphify) would
reclaim only a slice of the 12-18% Read bucket (~single-digit %). The fat, reducible buckets
are verbose Bash output and large MCP results.

Decision: a single PostToolUse hook (`hooks/trim-large-output.sh`, matcher `*`) that, when a
**Bash or MCP** result exceeds a threshold (`VOID_HARNESS_TRIM_BYTES`, default 12000c), writes
the FULL output to `.void/outputs/<...>.log` and returns via `updatedToolOutput` a trimmed
view: head + tail + the error-ish lines grepped from the elided middle + a pointer to the
spill file. The mechanism is confirmed on the official hooks doc (`updatedToolOutput` replaces
the tool result before it reaches the model) and the repo already reads `.tool_response` in
`outcome-meter.sh`.

Safety by construction: never touches `Read`/`Edit`/`Write` results (the agent needs the whole
file it is about to edit -- trimming those would make it work blind); PostToolUse so execution
is never altered; fail-OPEN on any uncertainty (no jq, unparseable response, write failure ->
original passes through); full output always preserved on disk, so nothing is lost.

Rejected alternatives. (1) Blind global cap of every tool output -- unsafe, would truncate a
file the agent is mid-edit on. (2) PreToolUse command-rewrite (`updatedInput`) to self-truncate
Bash -- alters execution, breaks commands using pipes/redirects/heredocs/exit codes; safety
pillar says do not touch execution to save tokens. (3) Per-command wrappers (`void test` etc.)
-- one global hook covers Bash + MCP uniformly, no per-tool wrapper zoo. (4) "Run everything
costly in a subagent" (the user's first framing) -- a subagent still reads the full output in
its own window and costs a model call to summarize deterministic logs; a filter is strictly
cheaper for verbose non-judgment output (subagents stay the right tool for judgment-heavy MCP
reads). Not mirrored into Codex `hooks.json`: that manifest is the Codex safety floor, and
`updatedToolOutput`/`tool_response` support there is unverified. One unverified link remains --
whether the installed Claude Code version honors `updatedToolOutput` end-to-end -- to confirm
with a live smoke test before relying on it.

## 2026-07-21: the health score caps on blocker failure-predicates, not low scores; unmeasured dimensions are pending, not zero

Phase B step B2 scores `ProjectState` into eight dimensions (spec §6, Fork 6). Three non-obvious calls:

**Blocker cap fires on a red *predicate*, not a low score.** A dimension is a `blocker` (installation,
enforcement, governance) or a `gauge` (portability, activation, efficacy, performance, dx). A blocker
caps the global at 69 **only when its `red` failure-predicate is true** — a genuine defect (e.g. a
capability with no owner) — never merely because its score is low. This is what lets Hermes' `ci-only`
enforcement score ~60 without capping the project: a structural ceiling is not a failure. The credible
alternative (cap when any blocker dimension scores below a threshold) was rejected: it would punish the
harness for a runtime's structural limits and conflate "new/limited" with "broken". Gauges are maturity
gradients — they lower the mean proportionally and can never cap, so a fresh install reads as new, not
broken.

**Unmeasured dimensions are pending (excluded), not invented.** A dimension with no honest local
signal — no data yet (installation's transactional signal lands with `void init` in Phase C; dx has no
deterministic local measure) or nothing to measure (an empty project, denominator 0) — carries an
explicit pending marker and is **excluded from the global mean**, not scored 0. The alternative
(defaulting to 0 or a plausible placeholder like the spec mockup's 74) was rejected: a false 0 makes a
brand-new project read identically to a failing one, and an invented number erodes the credibility the
five-state model rests on. This is the same "0 effective is the truth" stance as the certification
manifest — the score reports only what it can honestly measure, and the confidence band carries the
rest. Confidence requires a real sample floor (not a single capability hammered N times) before it
rises above `low`.

**Next actions derive from the measured gauges, not a hand-list.** The impact-ranked action list is
computed from gauge dimensions below 100 (a red blocker already surfaces via `blockers`; a pending
dimension has no measurable gap), so a future measurable gauge joins the list without a code change —
no maintenance trap.

Why: a score that can be gamed by a flattering average, or that invents numbers for what it cannot
measure, is worse than no score. Capping on real defects, excluding the unmeasured, and deriving
actions from real gaps keeps the top-5% bar honest — the score never masks a blocker and never claims
proof it lacks.

## 2026-07-21: void-harness is public MIT, npx-primary — supersedes marketplace-only (2026-07-09)

**Supersedes `2026-07-09-distribution-is-marketplace-only-the-cli-is-maintainer-tooli`.** void-harness
is published to npm as `@voidcorp/harness` (MIT, `publishConfig.access: public`) and installed via
`npx @voidcorp/harness init`; a signed standalone binary on GitHub Releases complements npx for
machines without Node. The Claude Code marketplace is demoted to a **secondary, optional** channel for
Claude-Code users who prefer it — no longer the required path.

The 2026-07-09 entry made distribution marketplace-only on the premise that *"consumers need the
plugin, which the marketplace delivers; the CLI they do not need"*. That premise **changed** with the
public multi-runtime redirection (spec `2026-07-21-void-harness-public-multiruntime-os`, Fork 2): the
CLI and `void status` **become the product** — the legible-state surface a developer runs — and the
redirection's non-negotiable is an **account-free** install (no Claude account, no subscription, no
API key to install/audit/visualize). The marketplace cannot satisfy account-free install: it requires
Claude Code. So the earlier decision is not merely revised, its premise no longer holds.

The credible alternative — stay marketplace-only, keep the doctrine private — was rejected (Fork 2
analysis): void-harness is engine + generic craftsman doctrine already ~90% distilled from public
sources (superpowers, TigerStyle, citypaul), and its LICENSE is already MIT. Secrecy of derived prose
buys almost nothing; the moat is the **integration + enforcement + eval-proven evolution**, which
lives in the **private sibling repos** (forge tuning, DECLIK/business packs) and the **telemetry
flywheel**, never in this repo. Publishing the engine is near-pure upside: recognition, adoption, and
the credibility of an open, privacy-first, offline-first harness — which is itself the point.

Telemetry stays opt-in and tiered (see the 2026-07-21 telemetry decision): tier-1 is a maintainer
*pull* of public npm + GitHub stats (zero phone-home); nothing on a user's machine is ever required to
call a VoidCorp service, preserving the offline + no-mandatory-service non-negotiables.

Why: assuming a single, account-free, public channel and making every surface tell that one story is
what makes the "install a top-5% doctrine on any project in under two minutes, free" promise real.
Versions stay release-please-owned; the actual `npm publish` and the signed-binary pipeline are
deliberate release-ops acts, not automated from a working session.

## 2026-07-21: the credential-file NAME heuristic exempts markdown docs

Context: migrating the decision log to per-file markdown (same day) created files whose slugs carry
the decision's words — including one ending `-byo-credentials.md`. The server-side floor
(`checks_sensitive_path` in `_checks.sh`, shared by the protect-sensitive-files hook and the CI
`void-enforce` action) flags any basename containing the words `secret`/`credential` as a
"credential file", so that decision note failed the `enforce` gate on PR #106. (The live hook then
also blocked authoring this very note until its slug dropped the trigger word — the false positive,
demonstrated twice.)

Decision: exempt `.md` files from the loose name match. A real credential file is never markdown, and
content-based secret scanning (`checks_secret_content`, gitleaks) still runs on `.md`, so this
removes a false-positive class without weakening protection. The precise rules (`.env`, `.pem`/
`id_rsa`, exact `.npmrc`/`.netrc`/`.pgpass`, lockfiles, `.git/`) are unchanged and never matched
markdown anyway.

Rejected alternative: rename the offending decision slugs to dodge the trigger words. That is a
rustine — it leaves the false positive latent, so any future decision *about* this subject, written
as its own markdown file, would fail `enforce` again. Fixing the heuristic at the root is the
harness's own doctrine (systematic-debugging: fix the cause, not the symptom).

## 2026-07-21: eval targets are slug-encoded in frontmatter; success_signal is optional, not mass-backfilled

Phase A step A3 adds the last two authored fields of the capability contract. Two non-obvious calls:

**Eval targets are slug-encoded, not nested maps.** The model shape (spec §2) is a list of
`{ runtime, provider, tier }` cells. The credible alternative was to author them that way in
frontmatter — a YAML list of inline maps (`- { runtime: claude, provider: anthropic, tier: opus }`).
Rejected: parsing a list-of-maps with the repo's hand-rolled, regex-based frontmatter reader is
exactly the fragile surface the A2 review already flagged (silent "absent vs unrecognized-shape"
collapse). Instead the frontmatter authors one slug per cell — `eval_targets: [claude/anthropic/opus]`
— parsed by the **shared `parseList` helper** (the same one `runtimes:` uses) and split on `/` into
the structured `EvalTarget`. The model exposes the identical `{ runtime, provider, tier }` shape; only
the authoring surface is compact. A slug that is not exactly three non-empty parts is dropped
(tolerant), consistent with every other frontmatter parser here.

**`success_signal` is optional and not mass-backfilled.** Unlike `owner: folpe` (uniformly *true* —
one maintainer owns everything today), a uniform `success_signal` across 64 skills would be a
dishonest placeholder: the "what good looks like" signal is genuinely per-skill content. So the field
is optional, absent until authored per capability, and never governance-gated. `eval_targets` is
backfilled uniformly to the primary `claude/anthropic/opus` cell (the tier the skills are authored
for — a real declaration of intent), while codex/other cells are added only when a capability actually
declares support for evaluation there.

Also folded in: the A1 review nit — with `success_signal` as the third scalar frontmatter field, the
`parseScalar(block, key)` helper was extracted and `owner`/`success_signal` now share it (three was
the stated YAGNI line for de-duplicating the copy-paste, not two).

Why: keeping the authoring surface parseable by the existing tolerant reader (no new YAML dependency,
no list-of-maps regex) preserves the "frontmatter is the one source of truth" decision while avoiding
the fragile-parser trap; and refusing to fake `success_signal` keeps the capability contract honest —
a populated field must mean something, or the five-state model's credibility erodes.

## 2026-07-21: docs/DECISIONS.md becomes a generated index over one-file-per-decision

Context: the shared-append tail of `docs/DECISIONS.md` was a recurring conflict in parallel
work — a batch of tickets each appending to the same file collide on the same tail, and the
`backlog-autopilot` skill only mitigated it by protocol (each worker appends its own block, the
reconciliation subagent concatenates). The skill itself named the durable fix ("a per-decision-file
layout, one file + a generated index, like ADRs") but deferred it as an interim.

Decision: split the 74 dated entries into `docs/decisions-log/<YYYY-MM-DD>-<slug>.md` (one file per
decision, each carrying `date`/`title` frontmatter + the verbatim `## DATE: title` body) and make
`docs/DECISIONS.md` a **generated index** rebuilt by `scripts/build-decisions-index.mjs`
(`pnpm decisions:build`), gated against drift by `pnpm decisions:check` in CI. A new decision is a
new file; nothing ever appends to the index, so parallel workers cannot race it. The index sorts
newest-date-first, tiebreak by filename DESC — deterministic and coordination-free (no shared
counter, unlike ADR numbers).

Rejected alternatives. (1) Literal port into `decisions/NNNN-slug.md` (the ADR dir): conflates the
harness's dated dev-log with architecture ADRs, buries the two real ADRs (0001/0002) under 74
entries, forces a global renumber, and rewrites the ~40 files (including a test and the
CLAUDE.md/AGENTS.md meta-rules) that reference `docs/DECISIONS.md` plus every by-date cross-reference.
(2) Do nothing: the concatenation protocol works, but leaves the interim standing. This option keeps
`docs/DECISIONS.md` existing as the generated index, so **all ~40 references stay valid** and by-date
cross-refs resolve unchanged — the migration is invisible to everything downstream. Round-trip
verified: splitting then regenerating preserves every decision line byte-for-byte (only intra-date
order and the added "generated" banner differ). The `adr-workflow` ADRs under `decisions/` are a
separate genre and are untouched.

## 2026-07-21: the certification manifest is a frozen committed artifact with an honesty invariant; bundle-bake and eval JSON emission deferred

Phase A step A4 produces `packages/harness-graph/certification.json` — the per-release, frozen join of
the capability contract (graph model) with the eval-harness reports. It is the repo-authored half of
the five-state model that `ProjectState` (Phase B) reads and **never recomputes on a consumer
machine** (spec Fork 5). `buildCertification(model, reports, harnessVersion)` is pure and
unit-tested; `certification.json` is a committed artifact regenerated by `pnpm certification:build`
and drift-gated in CI by `pnpm certification:check` (mirroring `decisions:check` / `graph:check`).

**Honesty invariant (the load-bearing decision).** A capability is marked `proof.effective` only when
a real eval report for it exists, its verdict is `skill-helps`, and it declares an eval target cell to
place the delta on. `proof.verified` is purely structural (owner + runtimes declared). The credible
alternative — seeding plausible `effective` values, or defaulting `effective` to the declared target —
was rejected: it would make the five-state model's terminal state a lie, which is the exact failure
the model exists to prevent. Consequence: today, with no eval JSON reports on disk, the manifest ships
**64 capabilities, 0 effective**. That is the honest current state, not a gap to paper over.

**Known limitation — single-cell attribution (flagged, not a dodge).** `EvalReportLite` (skill,
delta, verdict) carries no `(runtime, provider, tier)` cell identity, so the builder cannot know which
declared cell a report proves. Rather than blindly stamping the delta on the first declared target
(which would certify cell B's proof as cell A's on any multi-target capability), the join marks
`effective` **only when the capability declares exactly one eval target** — then the attribution is
unambiguous. A multi-target capability stays un-`effective` until eval reports carry cell identity,
which is a Phase E addition (when reports are actually emitted). `proof.effective.cells` stays a plural
array for that forward compatibility, but the join emits at most one cell today. Effective also
requires a *finite* delta (an upstream NaN serializes to a JSON nil) and structural `verified` first
(effective implies verified) — both enforced in the pure builder and tested.

**Two deliberate deferrals (YAGNI).**

1. *Baking the manifest into the consumer `void-graph` bundle* — deferred to Phase B. Nothing reads
   the certification until ProjectState exists; baking an unconsumed 64-capability blob into the
   1.9 MB artifact now is speculative, and the freshness gate already protects the committed file.
2. *The eval-harness JSON emission that populates `effective`* — deferred to Phase E. Emitting
   `apps/eval-harness/reports/<skill>.json` only matters once the paid evals actually run, which is
   Phase E's work (evals as a capability gate), not A4's. A4 builds the manifest *structure* and the
   join logic; the builder already reads any JSON reports that exist, so Phase E is a one-line emit
   plus a real eval run, no manifest change.

Why: freezing the proof into a committed, drift-gated artifact keeps ProjectState deterministic and
offline (it reads a file, runs no eval, calls no model), while the honesty invariant + the "0
effective is the truth" stance protect the credibility the whole product rests on. Deferring the two
downstream integrations keeps A4 self-contained and honest rather than shipping speculative wiring.

## 2026-07-21: the capability contract is authored as SKILL.md frontmatter; owner is the first governance gate

Phase A of the public multi-runtime harness OS (spec
`docs/specs/2026-07-21-void-harness-public-multiruntime-os.md`) needs a structured **capability
contract** per skill: identity, declared runtimes, per-runtime enforcement tier, owner, eval targets.
The contract is authored **as SKILL.md frontmatter fields**, extending the existing
`description`/`activation`/`triggers` block, rather than as a sibling `capability.yaml` per skill.

The credible alternative was a dedicated `capability.yaml` next to each `SKILL.md`. Rejected: the
graph kernel already parses frontmatter (`packages/harness-graph/src/derive/read-frontmatter.ts`) and
threads it onto `GraphNode`; a second file would add discovery, a second parser, and a drift surface
for zero gain. Frontmatter keeps one source of truth per capability and reuses the proven
`parseActivation`/`parseTriggers` seam.

The first field shipped is `owner:` (accountable maintainer), and it is **governance, fail-closed**: a
new `missing-owner` detector (`analyze/missing-owner.ts`, wired into `DETECTORS`) emits a blocking
`error` for any skill node without an owner, so `graph check` and the CI "Graph integrity" gate fail.
The rule is scoped to skills — hooks/commands/packs/agents are not capabilities. All 64 skills were
backfilled `owner: folpe` (single maintainer today; per-domain granularity deferred until a second
owner exists).

Why: the five-state capability model (`available → installed → verified → used → effective`) is only
honest if every capability has an accountable owner and a proof status. Making ownership a fail-closed
gate from the first field means no capability can ever ship ownerless, and the same frontmatter seam
carries `runtimes`, `enforcement`, `evals.targets`, and `success_signal` in the following Phase A
steps without new machinery.

## 2026-07-10: vendor the 4 gstack plan-reviews + autoplan as ONE plan-review skill with four lenses (DEV-385)

De-gstackification Vague 1 (epic DEV-383). The teardown removes `/plan-ceo-review`, `/plan-eng-review`,
`/plan-design-review`, `/plan-devex-review`, and their orchestrator `/autoplan` (~7000 LOC of source). Their
methodology — the gates that catch a scope/architecture/edge-case/DX flaw in a *written plan* before it
becomes code — is load-bearing and must survive.

Decision (confirmed with Folpe): a single `harness:plan-review` skill with four lenses (CEO / Eng / Design /
DevEx) + an `all` orchestrated mode, NOT 4-5 dedicated skills and NOT a section inside `writing-plans`.

Load-bearing choices:
- **One skill = one subject.** The subject is "critique a written plan before execution"; the four lenses are
  dimensions of it — exactly the shape of `void-code-review` (six dimensions, one skill). Four dedicated skills
  would be anti-bloat, fragment the subject, and force per-pair overlap policing. A `writing-plans` section
  was rejected: authoring a plan and adversarially critiquing it from four personas are different subjects, and
  folding would create the >30% overlap the ticket warned against. Boundary: `writing-plans` authors and owns
  plan structure/registries; `void-plan-review` critiques and proposes findings; the author disposes.
- **autoplan dissolves into the `all` mode**, not a separate skill (YAGNI): once the lenses are one skill, "run
  the four and auto-decide" is a mode. Its real value survives — the decision taxonomy (auto-decide Mechanical
  only; Taste + User-challenge escalate), the 6 decision principles, cross-lens theme synthesis, single gate.
- **Overlap management.** The gstack lenses overlap heavily (CEO's rubric nearly contained Eng's). The shared
  substrate (scope gate, one-finding-one-question, task list, verdict, second-opinion) is factored ONCE; each
  lens is cut to its irreducible core (CEO premise/ambition/trajectory; Eng test-coverage trace + failure
  modes; Design perceived pixels/states/slop; DevEx TTHW/journey/benchmark) to stay under the 30% cap.
- **`activation: on-demand`** — invoked deliberately on an artifact, like `void-security-audit`. Distilled 5 sources
  (~7000 LOC) into 129 LOC. Rejected: all gstack runtime, and the named-founder "how great X think" rosters
  (highest copy-risk, least load-bearing — the value is the checks, not the name-dropping).

Why: the plan-review gates are ~an order of magnitude cheaper than finding the same flaw in code review; losing
them at teardown would be a real regression. One consolidated skill keeps the methodology, respects anti-bloat,
and gives the CEO lens's scope-EXPANSION mode a home (the plan-level continuation of brainstorming's 10x move).

## 2026-07-10: vendor gstack /retro as harness:retrospective — signal methodology kept, gamification dropped (DEV-396)

De-gstackification Vague 1 tail (epic DEV-383), spun out of DEV-386. Ships the decision already logged in the
DEV-386 entry: a light dedicated `harness:retrospective` (72 LOC, `on-demand`), NOT a fold into
`learning-capture` (its mapped target `compounding` no longer exists, and a periodic window review is a distinct
subject from a point capture).

Load-bearing choices:
- **Kept the git-history signal methodology**: window gathering from git log / PRs (`gh`) / `.void/usage.log`,
  producing signals (commit-type mix, hotspots, recurring-fix files, test-to-prod ratio, PR size, regressions)
  that end in concrete improvement decisions.
- **Dropped the gamification** (focus score, ship-of-the-week, streaks, week-over-week leaderboard): quantified-
  self productivity theatre, not craftsman doctrine — it optimizes a number, not the code.
- **No gstack data dependency**: reads git log / PRs / `.void/` only, never `~/.gstack/` (which disappears at
  teardown).
- **Feeds `learning-capture`**: the retro discovers window patterns; learning-capture captures the durable ones
  (HITL). The retro writes nothing into doctrine itself. < 30% overlap (window review vs point capture).

Why: the history is already telling you where the debt and the recurring pain are; the retro is the discipline
of listening on a cadence. Losing that at teardown would drop a real quality signal — but the gamification it
was wrapped in was never the value.

## 2026-07-10: the server-side floor allows a lockfile change accompanied by a manifest change (DEV-393 follow-up)

Building `apps/make-pdf` surfaced a real gap in the DEV-393 server-side floor (`ci-enforce.sh`): it blocked
**every** lockfile diff fail-closed, so the harness monorepo could never add a dependency — a legitimate
`pnpm add` (which moves `package.json` AND `pnpm-lock.yaml` together) was rejected exactly like a hand-edit.
The local PreToolUse hook was already correct (it blocks a direct `Edit`/`Write` to a lockfile; `pnpm add`
runs via Bash and is allowed), but the server replay was stricter than the local floor — an inconsistency.

Decision: `ci-enforce.sh` allows a lockfile change **only when a package manifest changed in the same diff**
(`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Gemfile`, `composer.json`, `pubspec.yaml`). A
lockfile changed **alone** — no manifest — stays blocked (the hand-edit / tamper case the floor exists to
catch). This is the standard shape of a dependency PR: the reviewer sees the new dependency in the manifest,
which is the human check the lockfile-tamper block was standing in for.

Load-bearing choices:
- **Manifest+lockfile is reviewer-visible; lockfile-alone is not.** The floor's job is to stop sneaky edits a
  review would miss (lockfile-only tampering, secret injection), not to forbid all dependency additions —
  which would make the monorepo unusable. Gating on manifest-accompaniment restores that intent.
- **Fail-closed preserved**: a `git diff` failure in the manifest pre-pass treats the manifest as absent, so
  the lockfile stays blocked. No new fail-open path.
- **Local hook unchanged**: hand-editing a lockfile via `Edit`/`Write` is still blocked; only the server replay
  learned the manifest-accompaniment rule, closing the local/server inconsistency.
- Tested: `ci-enforce.test.ts` gains "allows lockfile + manifest" (green, logged) and "blocks lockfile alone"
  (red) cases; the existing lockfile-alone-blocked test still holds.

Why: a floor that forbids ever adding a dependency is not a floor, it is a wall. The rule is the same one every
dependency PR already follows — the change makes the automated gate agree with how dependencies legitimately
land, without opening a tamper path.

## 2026-07-10: the live DX audit is a dedicated `void-devex-audit` skill, not an extension (DEV-398)

De-gstackification: the gstack coverage audit found `devex-review` (gstack's "Live Developer Experience Audit")
to be the one real coverage gap after waves 1-3. The DX *methodology* was already vendored, but only its
plan-time half — `plan-devex-review` → the DevEx lens of `void-plan-review` (TTHW target, journey, error paths,
docs, upgrade, as *plan requirements*). What was missing is the live application of that method to an existing,
deployed surface, exactly as `void-ui-review` audits a shipped UI versus `void-plan-review`'s Design lens judging the plan.

The ticket posed three options. Decision:

- **Option 1 — extend `void-ui-review` to also cover dev surfaces: REJECTED.** Two subjects in one skill (visual/
  interaction UI craft AND the developer journey: naming, errors, docs, upgrade). Violates anti-bloat rule 2
  (one skill = one subject) and rule 3 (> 30% overlap). Different audience, different evidence.
- **Option 3 — a "live" mode inside `void-plan-review`: REJECTED.** `void-plan-review` judges *written plans* before code;
  its own anti-rules forbid reviewing shipped code. A live audit is a different artifact at a different stage.
- **Option 2 — a dedicated `harness:devex-audit` (`on-demand`, floor/ceiling pattern): CHOSEN.** It mirrors the
  precedent already set by `void-ui-review`, which positions itself as the audit ceiling versus `void-plan-review`'s Design
  lens (the plan) and `void-frontend-design` (the build floor). The triangle here is `void-plan-review` DevEx lens (plan) /
  `void-api-and-interface-design` (build the contract) / `void-devex-audit` (audit the shipped contract).

Load-bearing choices:
- **The < 30% overlap is structural, not verbal.** vs the plan-review DevEx lens: same dimension names, but that
  lens states them as plan *promises* while this skill *measures* the shipped reality with an evidence tag
  (TESTED/PARTIAL/INFERRED) and a plan-vs-reality delta — opposite lifecycle stage, opposite epistemics. vs
  `void-ui-review`: different subject (visual craft vs developer journey). vs `void-api-and-interface-design`: build floor
  (design the contract) vs audit ceiling (judge it shipped).
- **Near-mechanical, decided in-cycle.** Because the `void-ui-review` precedent already settled this exact shape, the
  choice was made during the ticket rather than surfaced as an open taste decision — the ticket's recommendation
  (option 2) and the established pattern agreed.
- **Reject the gstack runtime, defer the browser.** Only the DX method is vendored (first principles, measured-TTHW
  tiers, gap-method scoring, six evidence-tagged passes). The gstack review-log/dashboard, `gstack-*` bins,
  external hall-of-fame file, and telemetry are rejected; the live browser driver defers to Vague 4, the same
  line `void-ui-review` holds. The skill stays valuable pre-Vague-4 because CLI/README/CHANGELOG/types are bash-testable
  today; only hosted-web surfaces defer.

Why: the DX capability needed a home, and the home had to respect the one-skill-one-subject floor. Bolting it onto
`void-ui-review` or `void-plan-review` would have blurred two audiences into one skill; a dedicated audit-ceiling skill keeps
each boundary sharp and reuses a pattern the codebase already proved with `void-ui-review`.

## 2026-07-10: split design craft into frontend-design (build) + ui-review (audit); internalise impeccable (DEV-389)

De-gstackification Vague 3 (epic DEV-383), plus a Folpe directive: put UI craft fully in the harness — the
external standalone `impeccable` skill is to be internalised ("si impeccable est intégrable dans un ou plusieurs
skills custom, on le fait"), so the harness does not depend on an outside skill. This vendors the durable design
methodology from four sources — gstack `/design-review`, `/design-consultation`, `/design-shotgun`, and the
standalone `impeccable` — and splits it by lifecycle.

Decision: **`void-frontend-design` (build-time floor) + a new `harness:ui-review` (audit-time ceiling)**, mirroring
`void-security-guidance`/`void-security-audit` and `writing-plans`/`void-plan-review`. NOT one mega-skill, NOT a dependency on
external impeccable.

- **frontend-design** gains impeccable's build-time craft: the current-AI-tell absolute bans (side-stripe,
  gradient-text, glassmorphism, hero-metric, eyebrow/numbered-markers, cream/sand body, text-overflow), the
  color-strategy commitment axis, the type/layout/motion/interaction specifics, the `system-ui`-font ban, and
  the Krug reading model (219 → 266 LOC).
- **ui-review** (new, `on-demand`) vendors the audit/critique/refine methodology: the AI-slop two-altitude
  category-reflex test, the register split (brand vs product), the designer's-eye QA (first-impression, squint
  test, interaction-state coverage), the technical audit (contrast/a11y/responsive/perf), and the refine-mode
  menu. One subject (audit an existing UI); < 30% overlap with frontend-design (it assumes and checks against
  the build rules, does not restate them).
- **forge** (voidcorp plugin) owns market recon, the scored 12-dimension critique, the slop registry, and the
  multi-variant design prompts — bridged by the `docs/specs/` `source: forge` artifact contract. Four forge
  issues are drafted (specs in `plans/skill-audits/ui-review.md`) but NOT yet filed — creation on the external
  `voidcorp-core/forge` repo was blocked by the permission classifier; a tracked follow-up for Folpe.
  **DESIGN.md** stays the design-system contract (produced by `impeccable document`/`init` or by hand).
- **Deferred to Vague 4** (claude-in-chrome MCP): every live-browser piece — screenshots, `live`/variant
  iteration, the comparison board, the atomic-fix loop. Rejected: all gstack + impeccable runtime.

The full section-by-section distribution matrix is in `plans/skill-audits/ui-review.md`. Routing repointed
across skills, agents, CLAUDE.md/AGENTS.md, PHILOSOPHY, and the decision matrix.

Why: UI craft is core value; depending on an external `impeccable` skill (which itself dies with a future
gstack-style teardown, and isn't harness-governed) contradicts "tout dans le harnais". The floor/ceiling split
keeps each skill lean and one-subject, and makes the harness self-contained on both building and auditing UI.

## 2026-07-10: rebuild make-pdf on marked + puppeteer-core (system Chrome, page numbers), not a band-aid (DEV-391)

De-gstackification Vague 4 (epic DEV-383), REBUILD. gstack `/void-make-pdf` produces the PDFs DECLIK signed
deliverables depend on, via the browse daemon. A first pass rebuilt it with a hand-rolled markdown parser + the
raw `chrome --headless --print-to-pdf` flag to avoid a dependency; Folpe rejected that as a band-aid ("pas de
rustine, état de l'art"). Rebuilt on the researched state-of-the-art path instead.

- **`marked` + `puppeteer-core`** (the standard md->PDF pipeline, e.g. `md-to-pdf`): `marked` for robust
  parsing; `puppeteer-core` drives the **system** Chrome (no bundled Chromium download) and prints via
  `page.pdf()`, which — unlike the CLI flag — gives **page-number footers** (`pageNumber`/`totalPages`),
  `printBackground`, and precise margins. Source-driven against the Puppeteer PDFOptions docs.
- **Engine `apps/make-pdf/`**: pure `render` (marked + the kept HTML sanitizer — marked passes raw HTML through,
  a real trust boundary) + `print-css`, an impure `pdf` module (injectable `findChrome`), an async CLI. 13 unit
  tests + a dogfood PDF (observed: 67 KB, `1/1` footer, French accents, table with €, code).
- **Enabled by the floor fix above**: the two deps change the lockfile; rather than hand-roll around the floor
  (band-aid) or permanently allowlist the lockfile (removes protection), the floor learned the
  manifest-accompaniment rule. Principled unblock.
- **Chrome absent -> explicit non-zero exit**, never silent (AC).

Why: make-pdf is load-bearing for revenue deliverables; it must be état-de-l'art, not a stopgap. `marked` +
Puppeteer is the standard, it restores page numbers the CLI flag could not do, and `puppeteer-core` keeps CI
light (no Chromium download).

## 2026-07-10: QA browser methodology re-pointed onto claude-in-chrome, not a daemon port (DEV-390)

De-gstackification Vague 4 (REBUILD). gstack's QA methodology (`/void-qa`, `/qa-only`, the live half of `/design-review`)
is valuable, but it drives the gstack `browse` daemon — ~190 CDP/Chromium files. A full port is weeks; Claude Code
already ships the `claude-in-chrome` MCP. Decision: **re-point the QA prose onto the claude-in-chrome MCP** as a new
`harness:qa` skill, and do not port the daemon.

Load-bearing choices:
- **One skill, one subject.** `harness:qa` = "live browser QA of a running web app." `/qa-only` folds in as a
  `--report-only` mode (report-only is a mode, not a subject). The live visual QA from `/design-review` folds in as
  a "visual pass" that **composes `void-ui-review`** (which already owns the visual-craft methodology) rather than
  restating it. The regression test in the fix loop composes `void-tdd`/`void-testing`. < 30% overlap is structural: this
  drives the browser + functional/fix loop; ui-review judges visuals; devex-audit audits dev surfaces; tdd/testing
  author suites.
- **Reject the runtime AND the test-framework bootstrap.** The gstack runtime (browse binary, gbrain/learnings,
  telemetry, `~/.gstack` artifacts, cookie-profile import) is rejected as operational surface. Separately, gstack
  `/void-qa`'s Test-Framework-Bootstrap block (detect runtime → install a framework → write TESTING.md) is rejected as
  scope creep — standing up a framework is `void-tdd`/`void-testing`, and a QA skill that also bootstraps one is two subjects.
- **Cookie import is moot.** claude-in-chrome drives the user's real, logged-in Chrome, so `~/.gstack/chromium-profile`
  cookie import has no purpose — documented as a rejection per the ticket.
- **Assumed limitation, stated not faked.** claude-in-chrome needs an interactive Chrome; headless cloud/cron QA is
  out of scope (the browse daemon had it, this does not). The skill says so rather than inventing a result. A
  headless driver, if ever needed, is a separate initiative.
- **Companion global-config change (Folpe's call).** `~/.claude/CLAUDE.md` (Folpe's personal, cross-project config)
  carried "Always use /browse … Never use claude-in-chrome", which predates the claude-in-chrome adoption and made
  the skill unusable. Because it is his personal file affecting every project, the exact edit was confirmed with him
  (not applied silently): the blanket ban is **replaced by a scoped rule** — claude-in-chrome is the browser layer
  for `harness:qa`/`void-ui-review` live audits, `/browse` stays available until the Vague 6 teardown. (Alternatives
  offered: flip the default globally, or delete the rule outright; Folpe chose the scoped replacement.)

Why: the QA methodology is the durable value; the daemon is not. Re-pointing keeps the prose and drops ~190 files
of transport, at the cost of an interactive-browser assumption the harness can live with. The teardown (DEV-395)
removes the daemon; this ticket makes its removal safe by giving QA a new home first.

## 2026-07-10: per-worker model tier in backlog-autopilot, driven by ticket stakes (DEV-404)

Follow-up to DEV-403 (the D+E lever). The backlog-autopilot Workflow spawned every worker on the inherited
session model. Now each **worker** is tiered by the ticket's stakes: a **light** ticket (low-risk,
high-confidence, non-sensitive footprint) runs its whole ticket-runner cycle on a cheaper model at medium
effort; anything high-stakes **or unknown** keeps the full-strength session model at high effort. The launcher
attaches the tier from its footprint estimate; the Workflow's `workerTier()` applies it.

Load-bearing choices:
- **Default is top-tier.** Absence of a tier signal → full strength, matching the existing "unknown footprint →
  conservative" routing. A bug in `workerTier` can only make a ticket *more* expensive, never cheaper — it fails
  in the safe direction, so there is no quality-loss path.
- **The predicate drives the tier.** The same footprint estimate that routes parallel-vs-sequential sets the
  tier, so a judgment-heavy ticket is never cheapened; sensitive areas (auth/security/migration/payment) force
  top-tier regardless of the other signals.
- **The reconcile subagent is never tiered down** — it merges branches, runs the full suite, and does the
  level-2 review (all judgment). Cheapening it would risk exactly the integration quality this skill exists for.
- **ticket-runner documents the pass→tier matrix** (mechanical = cheap, judgment = top-tier) and notes that
  interactively the cycle runs on the session model; the tiering is realized at the worker level.
- **No unit test for `workerTier`.** The Workflow scripts run in the Workflow runtime with injected globals
  (`agent`, `parallel`, `args`) and top-level side effects — they are not an importable, unit-tested boundary in
  this repo (no workflow has a test). The function is a small pure helper with a safe default; extracting it into
  a tested CLI lib the runtime cannot import would be over-engineering. The deterministic CLI core (partition,
  plan) stays the unit-tested boundary; this is orchestration prose-with-a-helper.

Why: the biggest frugality win is not spending the top model on a trivial CRUD ticket's whole cycle — but only
when "trivial" is *known*, and never for the passes or tickets where judgment is the point. Safe-by-default
tiering captures the win without a quality-loss path.

## 2026-07-10: no native ship skill — ticket-runner pass 11 + gh + release-please IS the ship path (DEV-400)

Second teardown-unblocking ticket. The routing pointed `Ship | gstack (/ship)` and `void-code-review` named `ship
(gstack)` downstream. gstack `/ship` did: run tests, bump version, write changelog, commit, push, open the PR.

Decision: **do not vendor a `harness:ship` skill.** Every step /ship performed is already owned:
- tests → `harness:verification-before-completion`;
- version + changelog → **release-please** (automated, never hand-bumped — see RELEASING.md);
- commit → `harness:commit-discipline`; PR → `ticket-runner` pass 11 (Ship) + `gh`.
A dedicated ship skill would be a thin orchestrator over skills that already compose — YAGNI. Evidence: every PR
in this de-gstack epic (#82–#96, ~15 PRs) shipped via exactly `ticket-runner` + `gh` + release-please, no `/ship`.
Removed the gstack `/ship` routing (CLAUDE.md + AGENTS.md, in parity) and the `void-code-review` downstream ref;
the "vendored from gstack /ship" **attributions** in ticket-runner / verification-before-completion stay (they
credit a vendored methodology, not a live dependency).

Same PR, a **stale-ref sweep** (DEV-390 loose ends found during the teardown inventory, too small to ticket):
`ticket-runner`'s UX pass said "QA stays gstack /void-qa until Vague 4" → now `harness:qa`; `verification`'s mobile
row said "gstack /browse" → claude-in-chrome via `harness:qa`; `void-source-driven-development` mislabelled
`/defuddle` as gstack (it is a standalone `.agents` skill) → delabelled. The decision-matrix cross-cutting rule
"work that belongs to gstack (QA, design, ship, browser)" was rewritten — those are now harness-native homes.

Remaining live gstack composition after this ticket: only `/benchmark` + `/benchmark-models` + `/claude-api`
(DEV-401). Then the teardown (DEV-395) is unblocked.

Why: the harness already ships things well without a ship skill; the only thing missing was honest routing.
Building a `harness:ship` to replace a routing line would add surface, not capability.

## 2026-07-10: iOS cluster and gbrain fate — two ADRs, accepted by Folpe (DEV-392)

De-gstackification Vague 5 (epic DEV-383). Two gstack pieces escape the vendoring and need an explicit call
rather than a default port. Both are formal ADRs (the first in this repo's new `decisions/` directory). They
were authored **proposed** — HITL absolute, NOT auto-accepted — and are now **accepted** by Folpe's explicit
go-ahead to merge (in the ADR lifecycle, merging = accepting; status flipped to `accepted` in the same act):

- **[ADR-0001](decisions-log/2026-07-10-defer-ios-cluster-port--4541614e-26fd-454a-8f73-33990aa1d945.md) — Defer porting the iOS cluster.** No current iOS
  consumer; deferral is the reversible default. Wake trigger: the first signed iOS project. Teardown coupling:
  Vague 6 must snapshot the iOS source before removing gstack, not delete it.
- **[ADR-0002](decisions-log/2026-07-10-keep-gbrain-external--0def35be-d6c0-4952-ae3f-f0dd48fe9bf6.md) — Keep gbrain external, with an exit criterion.** Its
  cross-session context handoff is a real recurring need (served today by Claude file-memory + Linear +
  DECISIONS + ADRs); dropping it before a proven replacement would strand that need. Exit criterion: both the
  handoff AND code-search are demonstrably covered by harness primitives. Out of scope for the Vague 6 teardown.

Why ADRs and not just a DECISIONS line: both are strategic keep/drop calls with reversal triggers and a lifecycle
(they may be superseded), which is exactly what the ADR format is for — distinct from this running log. This entry
is the pointer the meta-rule requires; the ADRs are the record.

## 2026-07-10: harness token frugality — the lever is model tiering, not `activation` flags (DEV-403)

Directive: minimize the harness's token footprint with zero quality loss. The audit
(`plans/2026-07-10-harness-token-frugality-audit.md`) corrected the ticket's lead assumption:
- **`activation: always` is not a content loader** — it is read only by the graph cost/behavior model
  (DECISIONS 2026-07-04). Flipping `always` → `on-demand` saves zero session tokens and would corrupt the graph
  liveness model. Rejected.
- **The static footprint is already lean**: SessionStart injects ~4 lines; the per-call meter hooks `printf` to
  log files with zero model output; the read-only agents are already partly tiered (3 sonnet, 2 opus).
- **The real cost is work** — subagent / pass model selection. Model tiering is the quality-safe lever (tier the
  mechanical, keep top-tier for every judgment pass).

Decision (Folpe picked A, C, F): **A** `type-design-analyzer` opus → sonnet (type-shape analysis is
pattern-matching; doctrine-critic already runs sonnet); **C** pin the backlog-autopilot footprint estimator to
haiku (a cheap classification; low confidence already routes safe). **B** keep `migration-planner` on opus
(high-stakes sequencing). **D+E** (per-pass model-tier mechanism in ticket-runner + autopilot workers) → its own
follow-up ticket. **F** (prose distillation) runs as a **dedicated eval-gated pass**, longest skills first, each
change verified by the behavioral eval-harness — never a blind sweep, because "distill, never amputate" is the
guard and only a per-skill eval proves zero loss.

Why: the frugality win is not in flipping flags on an already-lean static footprint — it is in not spending Opus
on pattern-matching. Tier the mechanical work down; keep every judgment at full strength; prove each downgrade
with the evals. A + C are one reversible frontmatter line each.

## 2026-07-10: fold ship / spec / investigate into existing skills — vendor the DELTA, document the rest (DEV-388)

De-gstackification Vague 2 (epic DEV-383). Three high-value gstack skills whose harness equivalents already
exist: `/ship`, `/spec` (5-phase intent→spec engine), `/investigate`. Decision: NO new skills — enrich the
existing targets with only the load-bearing delta each source adds, and document what is already covered or
rejected. This is the anti-bloat-correct move: creating ship/spec/investigate skills would duplicate
ticket-runner / brainstorming+writing-plans / systematic-debugging by 70-90%.

- **`/ship` → ticket-runner + verification-before-completion.** ticket-runner gains the cycle-level disciplines
  (Test-Failure-Ownership triage, the independent fresh-context adversarial review pass, bisectable commit
  ordering); verification-before-completion gains the Plan-Completion Audit (DONE/PARTIAL/UNVERIFIABLE + honesty
  rule + per-item confirm) and the named-excuse rationalizations. Rejected: the Review-Army roster (over-
  engineered release-gate apparatus — kept only its idea), and VERSION/CHANGELOG (release-please owns it).
- **`/spec` → brainstorming + writing-plans.** brainstorming gains the precision half (read-code-before-asking
  with `path:line`, the five "why" questions gate, quantify-everything, failure-mode axis); writing-plans gains
  the executability gate (unfamiliar implementer executes with zero follow-up) + MVP-cut-first. /spec's
  single-solution persona was NOT allowed to overwrite brainstorming's 2-3-approaches divergence.
- **`/investigate` → systematic-debugging.** ~85-90% already covered (shared superpowers lineage). A documented-
  rejection case: folded only the surgical deltas (pattern-lookup table, 3-strike rule, blast-radius gate,
  instrument-to-confirm, recurring-bug smell, red-flags); the phase skeleton + Iron Law were deliberately not
  re-vendored.

Each affected skill's audit note carries the full covered/integrated/rejected diff. No skill exceeded 400 LOC
after enrichment (largest: writing-plans 230). No new routing surface — the folds enrich, they do not move
boundaries.

Why: these three carry real methodology (a red-suite adjudication, a plan-completion honesty audit, evidence-
grounded interrogation, a diagnostic pattern table) that the harness skills lacked in specifics. Folding the
delta captures it without the 3-new-skills bloat, and keeps each skill one-subject.

## 2026-07-10: eval-harness gains an injected LLM judge (last resort) + blind head-to-head (DEV-397)

The v1 eval-harness (DEV-394) scores deterministic file/git residue — great for `void-commit-discipline`/`void-tdd`,
blind to skills whose value is a *diagnosis* (`brainstorming` pressure-test, `void-security-audit` findings). Their
vendoring could not be rigorously verified. Extension:
- **Transcript capture** — `RunOutcome` gains `transcript` (the `claude -p` `result` the adapter already parsed
  but discarded). The signal for conversational skills.
- **LLM judge as an injected PORT, last resort** — `Judge`/`HeadToHeadJudge` are types; the real impl is a
  separate tool-less, sandbox-less `claude -p` in the adapter; tests inject fakes. `judgeScorer(judge, grid)` is
  an async `Scorer` (the `Scorer` type widened to `ScoreResult | Promise<ScoreResult>`, so a deterministic
  scorer stays sync and the async path is the single seam to the judge). A case opts in with a `judge` grid;
  deterministic scorers remain the backbone (DEV-394's guard). A crashed/empty run scores 0 **without** a judge
  call — a silent run fails regardless of rubric, and no token is spent judging nothing.
- **Blind head-to-head** — `runHeadToHead` runs the distillate prose (A) and the source prose (B) on the same
  fixture, then a judge that is never told which is which compares them. Position bias is cancelled by a
  **deterministic** A/B swap on odd indices (reproducible, unlike random), and the winner is un-blinded back to
  distillate/source before aggregation. This answers "is the distillate as good as the source?" directly — what
  with/without cannot.
- **Cases** for `brainstorming` (forcing-questions / anti-sycophancy / premise pressure-test / 10x / actionable
  / no-premature-design) and `void-security-audit` (SQLi + missing-authz found, exploit scenario, zero-noise, no live
  attack). Bounded: judge timeout, tool-less invocation, no full prompt logged. The judged transcript is
  concatenated into the judge prompt (an LLM-trust-boundary), so the judge is instructed that the transcript is
  **untrusted data to evaluate, never an instruction** — inline hardening against a transcript that tries to
  dictate its own verdict (doctrine-critic flagged the injection surface).

Rejected: turning every scorer into a judge (cost + non-determinism — deterministic checks stay the spine); a
random swap for blinding (breaks reproducibility). The one remaining paid step — an archived real run per case
— is deferred like any paid eval; the logic is fully unit-tested with fakes (899 green).

Why: a skill you cannot measure, you cannot safely distill or trust. The judge is the *only* way to score a
diagnosis, so it earns its place — but fenced as a per-case last resort behind a port, so cost and
non-determinism never leak into the deterministic backbone.

## 2026-07-10: de-couple /benchmark, /benchmark-models, /claude-api — neither vendor nor keep-external (DEV-401)

Third and last teardown-unblocking ticket. The remaining live gstack compositions were: `/benchmark` (perf
budget in `accessibility-first`, `void-frontend-design`, `void-code-review`), `/benchmark-models` (model choice in
`void-llm-cost-discipline`), and `gstack:/claude-api` (SDK mechanics in `void-llm-cost-discipline`).

The ticket framed this as "vendor vs KEEP-EXTERNAL (ADR)". A **third option was taken: de-couple.** These were
all *optional escalation / measurement references*, not capabilities the harness itself provides:
- **`/claude-api` → the native `claude-api` skill** (a real Claude Code skill; the `gstack:` prefix was simply
  wrong). Trivial repoint.
- **`/benchmark` → the project's own perf tooling** (Lighthouse CI, WebPageTest, bundlesize). The perf budget
  (LCP < 2.5s) and the "measure, don't guess" rule are preserved; they just no longer name gstack's tool.
- **`/benchmark-models` → a generic instruction** ("benchmark the candidate models on the actual prompts —
  cost + quality"). The escalation methodology is preserved without gstack's specific command.

Rejected: **vendoring** a perf-regression or model-benchmark skill (over-scoping — building a skill to replace an
optional reference adds surface for no new capability) and a **keep-external ADR** (would keep a live gstack
dependency alive for no reason — the whole point is to reach zero). De-couple is the minimal correct answer:
zero capability lost, zero new surface, zero remaining gstack dependency.

**State after this ticket: the harness has ZERO live gstack compositions.** Every remaining `gstack` mention in a
core skill is historical attribution ("vendored from", "distilled from", "Supersedes") — justified by the teardown
AC, not a dependency. The teardown (DEV-395) is now unblocked; DEV-399/400/401 are all merged.

Why: a budget you measure with Lighthouse and a "which model?" you settle by running the prompt never needed a
gstack command — only a habit of naming one. Removing the names removes the last teardown blocker.

## 2026-07-10: code-review enumeration → native /void-code-review; second opinion → standalone codex CLI (DEV-399)

The gstack-teardown inventory (DEV-395) found the `void-code-review` skill still composing gstack `/void-code-review`
(enumeration) and gstack `/codex review` (second opinion) as live dependencies — the skill framework was
native, but its tools were gstack's. First of three unblocking tickets (DEV-399/400/401) before the teardown.

Decision:
- **Enumeration → Claude Code's native `/void-code-review`** (low/medium/high/max/ultra, `--comment`/`--fix`). A 1:1
  replacement that post-dates the skill's authoring; no capability lost, one fewer external dependency.
- **Second opinion → the standalone `codex` CLI** (`~/.local/bin/codex`), kept for its cross-model value.
  Rejected: dropping it (loses the different-model-family coverage that is its entire point) and substituting
  native `/void-code-review ultra` (still Claude family, not cross-model). The CLI is installed independently of
  gstack and survives the teardown, so the capability is preserved gstack-free.

Scoped tight: `/benchmark` (perf dimension) and `/ship` (downstream) stay gstack-composed here, owned by
DEV-401 and DEV-400 respectively — ticket-boundary discipline, not an oversight.

Why: the review framework never needed gstack; only its enumeration tool did, and Claude Code now ships a
native equivalent. Repointing removes a teardown blocker while keeping the cross-model second opinion that
makes the review "two thirds" rather than one model's blind spots.

## 2026-07-10: backlog-autopilot shared-append files are owned by integration, not raced by workers (DEV-402)

Direct evidence from the de-gstack epic: nearly every sequential skill ticket (#88, #93–#98) hit a merge conflict
or a forced rebuild on the *same* files — `docs/DECISIONS.md` tails, `decisions/NNNN.md` ADR numbers, and the
regenerated graph artifacts (`model.json`, the ~1.9 MB `void-graph.mjs`, the core-assets mirror). The
backlog-autopilot partition (parallel-disjoint / sequential-overlap) does **not** help here: even sequential
branches cut from the same base collide on the same appended tail or the same regenerated bytes.

Decision: define a **shared-append protocol** owned by reconciliation, not workers (encoded in the skill's
"Shared-append files" section + the spec's Réconciliation section):
- **Generated artifacts** — workers MUST NOT commit them; the reconciliation subagent rebuilds them **once** after
  merging every branch (`graph build` + `build:void-graph` + `copy-core-assets`), gated by `graph:check` +
  `graph:check-bundle`. This removes the single largest conflict surface deterministically (N regenerations → 1).
- **ADR numbers** — reserved per ticket at plan time (max on base + per-ticket index); fallback is deterministic
  renumbering in topological order at reconciliation. Never two workers grabbing "the next integer".
- **DECISIONS.md** — each worker appends only its own block; the reconciliation subagent **concatenates** in
  topological order (append-vs-append is a false conflict, never 3-way-merged). Durable end state: one file per
  decision + a generated index (like ADRs); concatenation is the migration-free interim.
- **Registries** (coverage/decision matrix, routing) — distinct rows per worker; re-derive on a real same-row
  conflict; `sync-agent-docs` parity gates CLAUDE.md/AGENTS.md.

Scope of this ticket: the **protocol** (skill + spec + plan). The one deterministic **code** piece — reserving the
ADR number in the CLI `backlog-autopilot plan` output — is scoped as a follow-up increment (Step 15 in the plan),
kept out of this PR so the protocol lands first and the CLI change carries its own strict-TDD tests.

Why: partition solves *worktree-level* collisions; it cannot solve *content-level* append races on files every
ticket touches. Those belong to the one place that sees all branches at once — integration. Making that explicit
turns a recurring manual conflict-resolution into a deterministic rebuild-and-concatenate.

## 2026-07-10: a ticket applies its migration to dev/local before the tests; prod migrations are CI-only

`ticket-runner`'s Migration-safety pass (step 3) covered how to *design* a safe schema change (two-phase,
batched backfill, locking) but was silent on *applying* it. That silence had a concrete cost: the downstream
TDD and E2E passes query the real database, and Drizzle infers its types from the schema, so a migration
that was generated but not applied leaves the dev DB stale — the tests then fail spuriously or, worse, pass
against the wrong shape. The cycle needed an explicit apply step, and an explicit boundary on *where* it may
apply.

Decision: once a migration is generated and safety-reviewed, the cycle **applies it to dev/local before the
test passes run**; and the cycle **only ever applies to dev/local — production migrations run through CI /
GitHub Actions on merge, never from a worker or session**. The generic ordering principle lives in
`ticket-runner` step 3; the concrete Drizzle/Neon "who runs `migrate`, and where" (local Postgres / pglite /
ephemeral Neon dev branch for dev, a human-gated `pnpm db:migrate` GH Actions step for prod) lives in the
`harness-server:drizzle-migration-safe` pack. The generic doctrine in `migrations-safety` is untouched.

Load-bearing choices:
- **Auto-apply to dev/local, never prod.** The credible alternatives were rejected: (a) also auto-applying to
  prod turns a coding-cycle side effect into an unreviewed deploy — it collides head-on with the existing
  `migrations-safety` anti-rule "MUST NOT auto-apply migrations on push to main"; (b) requiring a human to
  apply even the *dev* migration defeats a ticket cycle whose own tests need the real schema to mean anything.
  The split (agent owns dev, CI+human owns prod) is the only one that keeps both the tests honest and prod safe.
- **Ordering, not just existence.** The apply happens *before* TDD/E2E specifically, because those are the
  passes that read the schema. Applying "sometime during the ticket" is not enough — it has to precede the
  tests it unblocks.
- **Principle vs concretization split.** Ordering (env-agnostic) in the core skill; the Drizzle/Neon commands
  and the GH Actions excerpt in the pack. Keeps the core generic and the pack the single place the concrete
  "how" lives, consistent with the pack/core boundary elsewhere in the harness.

Why: a migration the agent designs but never applies is a schema the tests never actually exercise — the
safety pass would sign off on DDL the suite ran green *around*, not *against*. Making the apply an ordered
step closes that gap; fencing prod behind CI keeps the convenience from ever becoming an unreviewed
production deploy.

## 2026-07-09: vendor gstack /office-hours INTO brainstorming; retro splits to its own ticket (DEV-386)

De-gstackification Vague 1 (epic DEV-383). DEV-386 was scoped to fold both `retro` and `office-hours` into
existing skills. On execution the two halves diverged, so the ticket was split.

**office-hours → brainstorming (this PR).** The YC product diagnostic is vendored as an upstream
"Pressure-testing a raw idea" mode: the six forcing questions (demand reality, status quo, desperate
specificity, narrowest wedge, observation & surprise, future-fit) with stage routing, the anti-sycophancy
posture, and — per an explicit ask — the **10x ambition move** (drop self-imposed constraints, carry an
ideal + creative-lateral path into the approaches; YAGNI prunes down from an ambitious set, never starts
timid). Folded rather than kept as a separate skill because the input ("I have an idea") and the outcome (an
approved design spec) are one continuous flow; brainstorming already delegated upstream to office-hours, so
absorbing it removes a soon-dead hop. Rejected: builder-mode visual/design-discovery (forge/design waves),
cross-model Codex second opinion (separate /challenge initiative), gstack runtime plumbing. The adversarial
posture is scoped to the upstream mode; the normal design flow keeps its collaborative voice (198 → 217 LOC).

**retro → its own ticket, NOT folded.** The ticket mapped retro → `compounding`, but `compounding` no longer
exists (fused into `learning-capture`, issue #75), and retro (a periodic *window* review) is a different
subject from learning-capture (a *point* capture of one lesson) — folding would violate one-skill-one-subject
and overflow the 400-line cap. Decision (Folpe): a light dedicated `harness:retrospective` skill, dropping
gstack's quantified-self gamification (focus score, ship of the week, streaks) and reading git log / PRs /
`.void/usage.log` instead of `~/.gstack/`, feeding `learning-capture` for the durable patterns. Tracked
separately so the clean office-hours half is not blocked behind the retro scope call.

Why: office-hours' idea-pressure-test is durable craftsman value that belongs at the front of the design flow;
retro's durable kernel is real but distinct and partly gamification, so it earns its own skill and its own
scoping decision rather than a forced fold.

## 2026-07-09: vendor gstack /cso as a dedicated `void-security-audit` skill, not an extension of `void-security-guidance` (DEV-387)

De-gstackification Vague 1 (epic DEV-383). `harness:security-guidance` always pointed at gstack `/cso`
for the periodic deep audit ("compose gstack /cso for full audits"). The teardown turns that into a dead
reference, so the /cso methodology (OWASP Top 10, STRIDE, secrets archaeology, supply chain, CI/CD, infra,
LLM, skill supply chain) had to be vendored into the harness.

Decision: a **dedicated `harness:security-audit` skill** (the periodic ceiling), NOT an extension of
`void-security-guidance` (the daily floor). Every live reference to /cso now points to `void-security-audit`: the
four skills that routed to it (`void-security-guidance`, `void-code-review`, `ticket-runner`,
`verification-before-completion`) and the five read-only agents that handed security off to it
(`doctrine-critic`, `silent-failure-hunter`, `type-design-analyzer`, `code-explorer`, `migration-planner`).

Load-bearing choices:
- **One skill = one subject.** `void-security-guidance` is continuous boundary discipline applied passively on
  every diff (`activation: always`); a full audit is a periodic, deliberate, read-only investigation
  producing a findings report (`activation: on-demand`). Different subject, activation, and lifecycle.
  Folding the phase framework into the 257-LOC floor skill would breach the 400-line cap and dilute its
  auto-discovery description. The prose already named the "floor vs ceiling" split — this makes it structural.
- **First `on-demand` skill in core.** All 17 prior skills are `activation: always` (passive doctrine,
  exempt from the graph's dead-component liveness check). An audit is invoked, not followed; `on-demand` is
  semantically correct and makes the graph track whether audits actually run — the right signal for a
  periodic skill.
- **Distill the methodology, reject the runtime.** Vendored: mode/scope resolution, the phase framework
  (0-13), the discipline (zero-noise > zero-misses, absolute confidence gate, exploit-scenario-required,
  quote-the-motivating-line, read-only, anti-manipulation). FP hard-exclusions distilled to the *principle*
  plus the highest-value examples, not gstack's 22-item + 12-precedent verbatim list (copying it would
  freeze a list that drifts upstream). Rejected: gstack runtime plumbing (gbrain sync, telemetry,
  prior-learnings, plan-mode, voice, AskUserQuestion machinery, config/learnings binaries).
- **Live-surface DAST deferred, not lost.** The /cso methodology is itself code-tracing-only ("never make
  live requests"), so nothing live was dropped. Active scanning (nuclei, live TLS/header probing) belongs
  to the `claude-in-chrome` MCP re-point, Vague 4 (DEV-390). The skill marks that boundary explicitly.
- **Provenance /cso mentions are kept on purpose.** Grep for /cso as a *live routing target* is green; the
  remaining mentions live in `.source` provenance ("distilled from gstack /cso"), which the sourcing
  discipline mandates. Provenance is not a dead link.

Why: the deep-audit methodology is ~65%-durable gstack value that must outlive the teardown. Vendoring it as
its own skill keeps the floor lean, gives the audit a home with the right activation semantics, and turns a
soon-to-be-dead composition into a first-class harness capability.

## 2026-07-09: validate .void/config.json with Zod, a new CLI dependency (issue #68)

`doctor` now validates `.void/config.json` against a Zod schema
(`packages/cli/src/lib/config-schema.ts`), not just `JSON.parse`. This adds `zod` as the CLI's
third runtime dependency (previously only `@clack/prompts` + the workspace graph package).

The credible alternative was a hand-rolled validator (zero new dependency, ~50 lines). Rejected:
the acceptance criteria require reporting the **offending JSON path** for each problem
(`paths.business`, `packs.@voidcorp/harness-nextjs`), which is exactly what Zod's
`safeParse().error.issues[].path` yields for free; reimplementing path-precise error reporting is
the kind of wheel-reinvention the sourcing discipline warns against, and the harness doctrine
itself mandates Zod at every input boundary (`void-security-guidance`). The dependency weight is not a
concern here: the CLI is distributed via the marketplace (git), not an npm install, and it is
bundled with esbuild/tsup so Zod is tree-shaken into the output.

Why: an invalid config (a mistyped `paths.*`, a non-semver pin) parses fine as JSON but breaks a
hook later, silently. Schema validation at `doctor` time turns that into an actionable, located
error. The schema is the single source of truth for the config shape and is deliberately tolerant
(every field optional, unknown keys ignored) so legacy and forward-compatible configs pass.

## 2026-07-09: fuse compounding + capture-rule + harness-evolution into learning-capture (issue #75)

The three skills (563 lines) were three doors to one intent — *capture a lesson* — separated by ~200
lines of mutual boundary-policing: each spent prose defending its edge against the other two, and
auto-discovery had to pick one of three descriptions for the same trigger family (exactly the
ambiguity that yields the wrong pick). Folpe's decision: fuse into a single `learning-capture` whose
first step is the routing decision, with the three behaviors preserved verbatim and each keeping its
own HITL gate — a project rule → `.void/PROJECT-DOCTRINE.md`, a harness gap → a direct GitHub issue,
an end-of-cycle pattern → named and routed to one of those or dropped.

The credible alternative was to keep three skills and sharpen their descriptions. Rejected: the
overlap is structural, not cosmetic — the disambiguating prose *is* the bloat, and it only exists
because the three are separate. One skill has no boundary to police.

Auto-trigger is by broad frontmatter description + an explicit signal list (Step 0), not a hook. A
Stop nudge to remind at cycle close was evaluated and rejected: the Stop payload carries no
session-start reference or merge signal, so "a cycle closed" is not reliably detectable, and a
misfiring nudge trains the user to ignore it. See `plans/skill-audits/learning-capture.md`.

Why: fewer, sharper skills route better than many overlapping ones. The load-bearing principle —
never auto-write doctrine, HITL on every capture — is unchanged; only the number of doors dropped
from three to one, taking the skill count from 31 to 29.

## 2026-07-09: forge → harness is an artifact contract on a core-hub, not a plugin dependency (issue #76)

Forge (ideation) previously dangled its downstream handoff at gstack `/ticket-craft` — a dead pointer
once gstack is being removed. Folpe's inter-plugin decision: the **core plugin is always installed
and is the hub**; forge routes into the core's execution skills (`brainstorming`, `writing-plans`,
`ticket-writer`, `void-tdd`, ...). The interface is a **versioned markdown artifact contract** the harness
owns the format of (`docs/specs/*.md`, frontmatter `source: forge` + the 18 recon variables + winning
design + critique verdict), so each plugin still stands alone: forge degrades to emitting a standalone
spec, core works from a hand-written one. `brainstorming` / `writing-plans` / `ticket-writer` ingest a
`source: forge` spec instead of re-asking; partial or older-version specs are tolerated (fill the gaps,
list what is missing).

The credible alternative was a hard plugin dependency (forge `requires` core). Rejected: it breaks
forge's standalone value and couples release cadences; a contract on a file gives the same nominal
routing without the coupling. Re-splitting core into `core` + `dev` (execution) sub-plugins is
explicitly **deferred (YAGNI)** — one core-hub is enough until a second consumer of the execution half
exists.

Why: the artifact contract is the loosest coupling that still lets forge hand real work to the core
without re-deriving it, and keeps the "each plugin makes sense alone" property that the marketplace
model depends on. The forge side lives in `voidcorp-core/forge` (forge#4).

## 2026-07-09: enforce the floor server-side via a shared-logic GitHub Action (DEV-393)

The void-harness floor (no editing secrets/keys/lockfiles, no forbidden `@repo/*` imports, no leaked
tokens, no destructive shell) was enforced only by LOCAL PreToolUse hooks — a cloud agent, a
`--dangerously-skip-permissions` run, or any non-Claude author bypassed it. Decision: a **GitHub
Action replays the same floor on every PR**, so it is incontournable regardless of author. It
complements the server-side branch protection `backlog-autopilot` already requires.

Load-bearing choice: **one body of detection logic, two callers.** The predicates were extracted from
the four floor hooks into a sourced bash library `core/hooks/_checks.sh` (path- and content-based,
no runtime coupling). The hooks became thin wrappers over it; a new diff driver `core/enforce/
ci-enforce.sh` consumes the identical functions over a PR diff. The hooks and the Action can never
diverge on *what* the floor is — the AC's zero-duplication requirement is structural, not a promise.

Alternatives rejected: (a) **port the checks to TypeScript** for a shared module — rejected, the
hooks are bash invoked as bash by Claude Code, so a TS port adds a node startup per edit and a large
rewrite for no gain; bash-sourced sharing is the idiomatic fit. (b) **Re-implement the checks in the
Action** — rejected outright, it is exactly the two-sources-of-truth the ticket forbids.

Sub-decisions: the driver lives under `enforce/` not `hooks/` (it is a CI tool, not a Claude-runtime
hook — keeps the `hooks/ = runtime` boundary honest and out of the 100-LOC hook cap). Distribution is
a **composite action** + a **reusable workflow** (`enforce.yml`) so a consumer adopts in ≤5 lines;
`doctor` reports adoption **advisory-only** (never blocks). The internal composite ref is pinned to
`main` in v1 (a floating major tag is deferred until marketplace tags stabilize). v1 scope is the
path/secret/boundary/destructive-shell checks; the project **test gate stays the consumer's own CI**
— this Action enforces the doctrine floor, not general quality, and must not double the existing CI.

**Fail-closed is the invariant** (the #62-64 class it must not reproduce): a missing prerequisite,
an unresolvable base ref, **no merge-base** (shallow/disjoint history), or any git-diff error is an
explicit red check, never a silent green. The diff enumeration uses `-z` + `core.quotepath=false` so
non-ASCII / spaced / tabbed filenames arrive raw — under the default quotepath a secret in an accented
filename (`café.ts`) would have skipped every content check and passed green (caught in security
review, now regression-tested). v1 replays three checks: sensitive-path, secret-content,
boundary-direction. **Destructive-shell is intentionally NOT replayed on the diff** — a catastrophic
pattern committed into a file is a weak signal that self-matches the harness's own detector
(`_checks.sh` literally contains the force-push regex), security docs, and test fixtures; the false
positives make it net-negative for a floor check. It remains a *local runtime* Bash guard
(block-dangerous-bash), and a diff variant is deferred to a follow-up with a per-line allow tag.
Escape hatch: the local hooks take a per-run env override (`VOID_HARNESS_ALLOW_SECRET_EDIT`); the
Action's committed equivalent is `.github/void-enforce-allow` — path globs (one per line) skipped
entirely, with each skip LOGGED (never silent). It exists because the sensitive-path check
deliberately flags any file NAMED for secrets/credentials (the `Credentials.ts` rule, enforced by
test), which correctly but inconveniently flags the harness's OWN `secret-in-content.sh`; the
allowlist is how the dogfood — and any consumer maintaining a legitimately secret-named file — opts a
reviewed path out. An allowlisted path is not scanned at all, so it is security-sensitive by
definition. Self-dogfood
caveat: void-harness runs the *local* composite on its own PRs, so a PR editing `_checks.sh` /
`enforce/**` / the action can neuter its own check — a reviewer treats those paths as
security-sensitive; consumers are unexposed (the reusable workflow pins the check code at `@main`).

Why: the floor is only a floor if it cannot be walked around. Local-only enforcement was a floor with
a side door; the same logic run server-side on the diff closes it without a second, driftable copy.

## 2026-07-09: doc truth pass — living docs match the decision log; CONTRIBUTING created (issue #74)

The docs had drifted from the decision log: `PHILOSOPHY.md` stated the em-dash/emoji rule as
absolute and claimed a `no-emdash-no-emoji-in-commit-msg` hook that does not exist (the 2026-06-01
entry already made it a soft taste rule, not a CI gate); it still promised the `learnings/proposed/`
queue + `voidcorp:learnings-promote` skill that were never built; the design plan's §0bis.4 and
§0bis.8 described removed mechanisms with no "superseded" marker; and `README.md` referenced a
`docs/CONTRIBUTING.md` that did not exist.

All corrected to match the log: the em-dash rule now reads soft in both `PHILOSOPHY.md` and
`CLAUDE.md`, the compound-engineering section points at `harness:compounding` + `capture-rule` +
direct issues, and the two dead design-plan sections carry a dated "Superseded" banner (the plan is
historical — banners, not rewrites).

CONTRIBUTING: chose to **create a minimal `docs/CONTRIBUTING.md`** (a short index pointing at
CLAUDE.md, PHILOSOPHY, the gates, and the issue-filing flow) rather than delete the reference. The
repo is meant to open to outside eyes; a one-screen contributor entry point that defers to the real
source-of-truth docs is more welcoming than a dangling link, and cheap to keep honest.

## 2026-07-09: distribution is marketplace-only; the CLI is maintainer tooling (issue #69)

The harness ships **only** through the Claude Code marketplace
(`voidcorp-core/void-plugins`, pinned by commit sha). The `@voidcorp/harness` npm package is
deliberately **not** published, and `void-harness init/add/doctor/...` is maintainer tooling run
from a checkout of this repo, not a consumer-facing binary. Docs, `help.ts`, and the `/void-*`
command bodies were pointing consumers at `npx @voidcorp/harness`, which 404s (the package is
unpublished and `npx` does not resolve a pnpm global link) — a broken first impression. They now
lead with the marketplace flow and, where the CLI is genuinely needed, mark it as maintainer-only
(a missing `void-harness` binary reports "maintainer CLI not installed", never an npm fetch).

The credible alternative was to publish `@voidcorp/harness` to npm so `npx` works everywhere
(friction 2026-06-18, option 1). Rejected: the marketplace already distributes the load-bearing
surface (skills, hooks, agents, commands) via git with zero npm, the packs and forge ride the same
channel, and an npm publish adds an org, release automation, and a second drifting distribution
path for a CLI that consumers do not actually need — they need the plugin, which the marketplace
delivers. The per-project config wiring the CLI does is a maintainer/scaffolding concern, not a
runtime dependency of a consumer that has installed the plugin.

Why: assuming one distribution channel and making every surface tell the same story removes the
single worst onboarding failure (install the plugin, run `/void-doctor`, get a 404). It also
matches the already-recorded stance of the #68 entry above ("the CLI is distributed via the
marketplace (git), not an npm install"). This entry makes that stance explicit and repo-wide, and
resolves friction `2026-06-18-cli-not-distributed-to-consumers`.

## 2026-07-09: cross-project telemetry rollup via a self-registering index; opt-in issue push (issue #72)

Per-project telemetry is structurally too thin to trust — a skill fires a handful of times in one
repo, never clearing the cost/behavior gates (>=20 events / >=3 sessions). The audit decision was
to aggregate across projects locally and push only *findings* (never raw data) as GitHub issues,
opt-in and HITL.

**Project discovery — the `activation-meter` self-registers, telemetry-driven.** Rejected a
separate registry written by `init` (misses projects wired before the feature, needs an extra
step, drifts if a project is re-init'd) and a filesystem scan for `.void/` dirs (fragile, assumes
a common parent). Instead the meter — which already runs in every project and knows the root —
drops an idempotent pointer file `~/.void/projects/<cksum>.path` holding the project root, once per
project (a local `.void/.registered` marker avoids re-hashing every tool call). Any project that
runs the harness announces itself; the index self-heals (roots whose dir is gone are dropped on
read); nothing leaves the machine. This is the loomcraft-style self-registration the maintainer
asked for.

**Issue format and dedup.** One issue per `(type, component)` with a deterministic title
`[harness-audit] <type>: <component>` and the `harness-feedback` label, so a re-run edits/leaves
the same issue instead of duplicating (dedup by title via `gh issue list`, GitHub-side dedup across
machines). The body carries component names and aggregate counts/windows ONLY — never a project
path, file content, or session id. `void-harness audit --push` is dry-run by default (prints the
create/update plan and stops) and a real push additionally requires an interactive confirmation; a
missing/unauthenticated `gh` fails loud, never a silent no-op.

Why: the loop was a cost accountant with no revenue side and no cross-project view. Telemetry-driven
registration means aggregation "just works" as projects are used, and the strict privacy scope +
double gate (flag + confirm) keeps the outbound path safe enough to leave on. The cost/behavior
findings (`expensive`, `should-have-fired`) surface through `void-graph --all-projects`; the audit
command owns the skill-usage findings (`never`, `stale`).

## 2026-07-09: behavioral skill evals — measure the prose's EFFECT, not just its form (DEV-394)

Audit top-5% lever #2. The `test/` suite proves a skill's FORM (frontmatter, size, structure) but
nothing about its EFFECT: no test showed that a skill's prose changes the agent's behavior in the
intended direction. Decision: a behavioral eval harness runs a fixture task with the skill's
`SKILL.md` body injected into the system prompt and without it, N times each, and scores the delta. This
makes every prose edit testable and the gstack vendoring (DEV-385..389) verifiable — is the distillate
as good as the source? First real run (commit-discipline, N=5, model haiku): with-skill mean 100% vs
without-skill 67%, delta +33%, ~$0.26 — a clear, measured signal, not a hope.

Load-bearing choices:
- **Inject the prose via `--append-system-prompt`, don't install the plugin.** The eval tests whether
  the PROSE is effective when present, which is the thing prose edits change. Auto-discovery/description
  routing is a separate axis, deferred. Injection is also what makes the A/B hermetic and cheap.
- **Inject the SKILL.md BODY, not the whole file.** A loaded skill contributes its instructions, and the
  frontmatter `description` frequently summarizes the entire skill — appending it leaked the signal into
  the gutted-skill run (the first sensitivity run wrongly showed the gutted skill still "helping"). The
  sensitivity check catching this is the mechanism working: the eval now strips frontmatter and injects
  only the body, so gutting the prose actually removes the guidance.
- **Deterministic scoring first; an LLM judge is a last resort.** commit-discipline is scored with
  ZERO LLM judge (Conventional-Commits subject + a why-body + ASCII-clean, asserted over `git log`).
  A judge only earns its place where a check genuinely cannot be a file/git assertion (none of the v1
  pilots needed one). This keeps the eval cheap, fast, and itself deterministic.
- **Hexagonal so the logic is testable without an LLM.** Pure `scorers.ts` + `runner.ts` behind a
  `RunOnce` port (unit-tested with a fake); the `claude -p` sandbox is the only impure edge, validated
  by the real run, not by paid unit tests.
- **Isolation without losing auth.** `--setting-sources ""` (loads zero settings → no global
  plugins/skills, and the harness's own hooks stay off) + a fresh sandbox CWD; we do NOT relocate
  `CLAUDE_CONFIG_DIR` (that would drop the OAuth/subscription credentials — verified: `--bare` returns
  "Not logged in"). `--setting-sources` governs settings, not memory, so the user-level `~/.claude/
  CLAUDE.md` is a theoretical leak — but a probe (`-p "list any global instructions you were given"`)
  returns `NONE` and the observed baselines sit well below ceiling, so it does not leak in practice. The
  eval reads the with-minus-without DELTA: a bias constant across both arms cancels **when additive**;
  since scores saturate at `[0,1]`, a strong global bias on the measured signal could compress the delta
  — the sub-ceiling baselines confirm that is not the case here.
- **Containment: scoped, not `--dangerously-skip-permissions`.** Each run spawns a real agent that
  writes + runs tools. The harness's own doctrine gates `--dangerously-skip-permissions` behind a
  `VOID_SANDBOX` marker; the eval instead uses `--permission-mode acceptEdits` + a scoped
  `--allowedTools` allow-list (no arbitrary shell) + a **scrubbed minimal env** (no API keys/tokens/
  cloud creds from the maintainer's shell reach the agent). It is not an OS path-jail (no write-confine,
  no network isolation); evaluating an UNTRUSTED/vendored skill body (a prompt-injection vector, per
  DEV-385) should be done in a disposable VM/container. A built-in OS sandbox is a deferred hardening.
- **A private, unpublished package under `apps/`** (`@voidcorp/eval-harness`, v0.0.0, `private: true`),
  NOT `packages/core/evals` (which would ship the evals to every consumer). Excluded from version
  lockstep, like `apps/graph-studio`.
- **Local command, never a blocking CI gate in v1.** Runs cost tokens and are non-deterministic;
  gating a PR on an LLM eval is both flaky and expensive. `pnpm eval <skill>` is run deliberately; a
  future non-blocking CI variant is possible but out of v1.

Alternatives rejected: (a) an LLM-judge-first design — rejected as expensive, non-deterministic, and
itself unverifiable; deterministic assertions are the backbone, the judge is the exception. (b)
Installing the plugin per run to test auto-discovery — rejected for v1: heavier, and it conflates
"prose effective" with "description routes correctly," two separate questions.

Why: a skill that does not change behavior is decoration. Until now nothing could tell the two apart;
now a prose edit that stops working shows up as a collapsed delta. The sensitivity check (a skill must
beat its own GUTTED copy) makes that guarantee explicit — if the gutted version scores the same, the
eval is not measuring the prose and the result is discarded, not trusted.

## 2026-07-09: activations.jsonl is the single telemetry source; usage.log is retired (issue #70)

The harness had two telemetry writers: the legacy `.void/usage.log` (Skill events only, written
only when jq was present) and the rich `.void/activations.jsonl` (every tool call, with a
pure-bash fallback). `void-harness audit` and `void-graph`'s orphan note read the *poorer* file,
so a project could show skills as "never fired" that had fired plenty. The activation-meter now
writes **only** `activations.jsonl`, and both readers go through one loader
(`graph-io.loadSkillUsage`) that derives skill usage from the jsonl.

The credible alternative was to keep both writers and just have readers merge them. Rejected as
the steady state: two writers is two things that can drift (retention, semantics, the jq-present
gate), which is exactly the bug. Instead the loader merges any *pre-existing* `usage.log` as
read-only transition history (so a consumer's "stale" stats are not reset on upgrade), while new
firings only ever land in the jsonl. Once consumers have rolled a version, `usage.log` decays to
nothing on its own.

Why: one writer + one reader path means the audit and the graph can never disagree about whether a
skill fired. The format itself did not change (the jsonl schema is unchanged); only the number of
sources did, from two to one.

## 2026-07-06: behavior `telemetry-gap` finding -- collapse a whole unrecorded firing kind, don't cry N dead-nodes

Context: three telemetry blind spots in a row (doctrine `activation`, workflow `scriptPath`,
`Agent` vs `Task`) were the same shape -- the recorder and the graph node derive their join
key independently and nothing checks they agree. Finding the fourth by accident is not a
strategy. The `Agent` bug in particular surfaced as five separate `dead-node` findings (one
per agent), which is exactly how it got misread as "these agents are under-used".

Decision: a compounding guard in the behavior kernel. When a whole `ActivationKind` has >= 2
firing-capable, non-`always` nodes but zero recorded activations, emit one `telemetry-gap`
finding (listing those nodes, pointing at the recorder) and suppress their `dead-node`
findings. A whole kind at zero is far more likely a join-key break than every component of
that type being independently dead.

Two design points. (1) Threshold >= 2: with a single node, "kind unrecorded" is
indistinguishable from a genuinely dead component, so a one-node kind stays a `dead-node`
(this is why the workflow kind, one node today, is not gap-covered -- acceptable, it gains
coverage the day a second workflow-def exists). (2) `always` nodes are excluded from the
count: they are exempt from dead regardless, so they are no evidence of a recorder break.
Rejected alternative: emit the gap *in addition to* the per-node dead-nodes -- that keeps the
noise the guard exists to remove. The guard self-extinguishes: once the recorder is fixed and
the kind records activations, the gap disappears and normal per-node analysis resumes.

## 2026-07-06: activation-meter counts `Agent` spawns, not just `Task` (third telemetry blind spot)

Context: the activation-meter classified an agent spawn only when `tool_name == "Task"`,
the stock Claude Code name. This harness exposes the spawn tool as `Agent`, so every agent
launch fell through to `kind: tool, name: "Agent"` and no `kind: agent` event was ever
recorded. Consequence: every `agent:*` node was permanently `dead` in behavior/cost, not
because the agents are unused but because the meter never saw them fire (13 `Agent` tool
events sat mislabeled in one local log while all five agent nodes read dead).

Decision: accept both names (`$tool == "Task" or "Agent"`, `Task|Agent)` in the jq-less
path). No credible alternative -- this is a join-key bug of the same family as the workflow
`scriptPath` fix (2026-07-04, Decision 2), logged here only because it materially corrects an
earlier read: the consumer report's "specialized agents never spawned" signal
(code-explorer, doctrine-critic, migration-planner, silent-failure-hunter,
type-design-analyzer) was a measurement artifact, not real under-use. Do not conclude "these
agents are dead / should be trimmed" from pre-fix telemetry.

## 2026-07-04: graph cost/behavior liveness -- `activation` frontmatter over enforces-edge inference; two telemetry blind spots closed

Context: the consumer cost report flagged doctrine skills (`void-tdd`, `void-security-guidance`,
`void-commit-discipline`, ...) as `dead` / `low-yield`. Root cause: the activation-meter is a
PreToolUse hook, so it only records a `skill` event when a skill is invoked through the
Skill tool. Doctrine skills are never invoked that way -- their rule is carried passively
via `@.void/PHILOSOPHY.md` + enforcing hooks -- so `invocations` is permanently 0 and
`staticTokens` (the full SKILL.md size) is charged as if paid every session, which it is
not (only PHILOSOPHY's summary is resident; the SKILL.md loads only on invocation). A
second blind spot: a workflow launched by `scriptPath` recorded `name: "inline"`, never
matching the filename-derived `workflow-def` node, so it read as `dead` regardless of runs.

Decision 1 -- a node declares its activation mode in frontmatter: `activation: always`
(doctrine followed passively) vs the default `on-demand` (a workflow triggered actively).
A node marked `always` is exempt from `dead` / `underused` / `low-yield` and carries a
positive `always` flag instead; it stays eligible for `expensive` (a real-cost fact). Same
reasoning the cost kernel already applied to hooks, whose liveness is structural, not
invocational.

The tag is granted only on **auditable structural backing**, not on a subjective "feels like
doctrine". A skill is `always` iff its rule genuinely operates without a Skill-tool invocation,
which requires one of two verifiable proofs: (a) it is the target of an `enforces` edge (a hook
runs it mechanically every commit), or (b) its principle is stated explicitly in
`PHILOSOPHY.md` (resident in the system prompt). This yields **16 always / 15 on-demand**:
- 14 backed by an `enforces` edge: accessibility-first, code-review, commit-discipline,
  domain-driven-design, frontend-design, functional, hexagonal-architecture, llm-cost-discipline,
  migrations-safety, observability, refactoring, security-guidance, testing, typescript-strict.
- `void-tdd` -- backed by the `tdd-guard` hook; this change adds the missing
  `enforces: tdd-guard -> tdd` edge so the backing is declared, not implicit.
- `void-source-driven-development` -- backed by the PHILOSOPHY hard rule "Read the official
  documentation of any third-party tool BEFORE writing its config".

An earlier, broader cut (21) also tagged async-safety, api-and-interface-design,
context-management, systematic-debugging, verification-before-completion. Rejected on review:
those five have neither an `enforces` edge nor a PHILOSOPHY line, and their own descriptions are
conditional ("Use for async/webhook/job/cron code"). Tagging them `always` would stamp a
genuinely unused, unenforced skill as healthy forever -- the exact blind spot this change fixes,
inverted. They stay `on-demand`; any of them earns `always` only once given a real backing (a
hook or a PHILOSOPHY line), never before.

Alternative rejected -- infer "always-loaded" from the existing `enforces` edges (a skill
that a hook enforces). Rejected: it is a proxy for a different property ("enforced by a
hook"), not "followed passively as doctrine". They correlate today but decouple tomorrow
(a hook enforcing a non-PHILOSOPHY skill, or the reverse), and it structurally misses `void-tdd`
(no declared `enforces` edge) and any doctrine skill without a hook. Encoding the mode
explicitly on the node is the honest fix; deducing it from a proxy re-introduces the same
class of lie. `backlog-autopilot` is enforced yet stays `on-demand`, confirming the proxy
would misclassify.

Decision 2 -- the activation-meter derives a scriptPath-launched workflow's name from the
script basename (strip `.workflow.js`), matching the `workflow-def` node id, before falling
back to `inline`. The fix is prospective (past log lines keep their recorded name).

Why: a telemetry signal that mislabels doctrine as dead would, via `void-audit`, propose
deprecating load-bearing skills -- the blind spot was not cosmetic, it was a trap that could
drive a wrong cut. The whole A->B->C self-optimization loop depends on the measurement
telling the truth about what the harness actually runs.

## 2026-07-01: ship the consumer graph tooling as a committed bundle, gated on the embedded model (sub-project B)

Context: the graph tooling (kernel, `graph` CLI, studio) ran only in the monorepo.
Consumers of the harness get their assets from the marketplace (`voidcorp-core/void-plugins`),
which pins a repo SHA and fetches `packages/core` directly — there is no npm publish
(deliberate) and no out-of-repo asset channel. To let a consumer run `graph cost`/`live`
against their own project, the tooling has to reach them through the plugin assets.

Decision: build one self-contained `packages/core/graph/void-graph.mjs` (esbuild bundles the
kernel + CLI, the model.json is baked via a `__VOID_BUNDLED_MODEL__` define, the single-file
vite studio is inlined via `__VOID_BUNDLED_STUDIO__`) and **commit it** so the marketplace ships
it. On the consumer it runs 100% local (served on `localhost`, offline), filtered to the packs
enabled in `.claude/settings.json`. It is invoked by the `/void-graph` command.

Two credible alternatives were rejected. (1) Publish the CLI to npm — rejected: the zero-npm
policy stands, and it would not reach marketplace-only consumers anyway. (2) Host the studio at a
public URL and ship only a data server — rejected: it adds a network dependency and a
mixed-content (https page → http localhost) problem, breaking the offline guarantee.

The freshness gate is the **embedded model**, not the whole artifact. `graph check-bundle`
compares the sha256 of the model baked into the committed `.mjs` (self-reported by
`graph model-hash`) against the committed `model.json`. Byte-comparing the full vite/esbuild
output was rejected as the gate: its determinism across environments (rollup chunking, bundler
versions) is not guaranteed, so it would flap; the model is the part that actually drifts when
skills/hooks/commands change. The artifact is excluded from the npm CLI's `core-assets` mirror
(consumers get it via the marketplace, not the unpublished tarball) to avoid doubling the blob.

Why: committing a ~1.9MB build artifact into git is a real cost (blob growth per release), taken
knowingly because it is the only path compatible with zero-npm + marketplace-ships-repo. The
cost is bounded by refreshing the artifact only when `model.json` changes (a skill/hook/command
add or remove), enforced by the per-PR `graph:check-bundle` gate — the same "regenerate the
derived asset, fail on drift" pattern the repo already uses for `core-assets` and `model.json`.

## 2026-06-29: harness-graph joins the version lockstep

Context: the `@voidcorp/harness-graph` kernel (merged in #41) shipped with a real
version (0.12.1) but was wired into neither the release-please `extra-files` nor
`scripts/check-version-lockstep.mjs` (`NPM_PACKAGES`). It would have stayed at
0.12.1 while everything else bumped to 0.13.0 -- a silent drift, uncaught because
it was also excluded from the drift check.

Decision: add `packages/harness-graph/package.json` to BOTH the release-please
extra-files and `version:check`, so the kernel bumps in lockstep with the rest.
This matches the CLAUDE.md doctrine ("release-please bumps every manifest in
lockstep") and the kernel already sat at the lockstep version. Alternative
rejected: version the kernel independently (own publish cadence, like the
deliberately-excluded `apps/graph-studio`). Rejected because nothing indicated an
independent cadence -- the omission was forgotten wiring at #41, not a policy.

## 2026-06-29: graph-studio is orchestrator-centric with progressive disclosure, not a flat force-cloud

Context: the first graph-studio build rendered all 102 nodes as a single
3d-force-graph force-directed cloud (spec §7's literal "clusters spatiaux par pack").
In use this was beautiful but illegible: it answered "what exists / where is it
dense" but not "how does the harness articulate" -- the edges (the actual relations)
were drowned, and a force layout encodes neither hierarchy nor flow. Dogfooding
feedback: "c'est compliqué de comprendre comment tout s'articule."

Decision: re-centre the view on the orchestrator (CLAUDE.md / the routing doctrine)
and use progressive disclosure instead of showing everything at once. The
orchestrator sits at the centre; group hubs (core + each pack) orbit it in a 3D
volume; components are collapsed by default (overview = ~8 labelled hubs with count
badges); clicking a hub expands its components; clicking a component isolates its
ego-network (focused node + its semantic neighbours + directional arrows, rest
hidden). This is the agent-flow "few nodes at a time, drill down" model. The
holographic aesthetic (bloom, fog, reticle, gravitation spin) is retained but tuned
down for legibility.

Alternative rejected: keep the flat force-cloud and only tune bloom / add focus.
Tried; the all-102-at-once layout stays cluttered because `core` alone has ~68
components. Progressive disclosure is the only way to have both the full graph and
legibility. The pure articulation overlay (`src/scene/articulation.ts`: orchestrator
+ hubs + containment + 3D orbital layout + ego-network) is unit-tested; spec §7's
pack-cluster wording is superseded by this entry.

## 2026-06-29: graph live (P2) -- meter records `kind=tool`, SSE is data-only, one `frameAt` for live+replay

Context: P2 "live" (the `is` layer) needed three coupled decisions, each with a
credible alternative. Spec: `docs/specs/2026-06-29-graph-live-p2.md`.

Decision 1 -- the activation meter records `kind: skill|agent|workflow|tool`, NOT the
`skill|agent|hook|workflow` the parent spec (§8) listed. A universal `PreToolUse *`
hook observes tools, never hooks; logging "which hook fired" would force every hook
to self-log (fragile meta-logging, N files). Instead it records situations
(`kind=tool` + `trigger.fileGlobs/ext`); "should this hook have fired" is derived in
M8 by matching situations against declared triggers. The single `activation-meter.sh`
absorbs the old `skill-usage-meter.sh` and keeps writing `usage.log` for skills
(audit + studio halos unchanged).

Decision 2 -- `graph live` serves data only (`/model.json`, `/history`, `/events`
SSE); it does NOT bundle the studio `dist`. The studio stays a separate app and
connects via `VITE_LIVE_URL`. The HTTP contract is a strict superset of the future
all-in-one server, which only adds `GET / -> dist` later -- a non-breaking addition.
Alternative rejected: bundle the studio dist into the CLI now. That forces a
cross-package build + asset-mirror gate for zero behavioural gain at this stage;
deferred to a dedicated packaging increment once the behaviour is locked.

Decision 3 -- live and replay share one pure function `frameAt(events, cursor,
window)`. Live pins the cursor to now (fed by the SSE stream); replay detaches it to
the scrubber position over `/history`. One calculation, two pilots -- no duplicated
intensity logic. Alternative rejected: a separate live pulser + replay renderer; it
duplicates the decay math and drifts.

Also: `null` was avoided throughout (harness:functional) -- parse/lookup return
`undefined`.

## 2026-06-29: graph behavior (M8) -- declared triggers, behavior separate from analyze, advisory only

Context: M8 turns the accumulated activation log (M6) into "which components never
fire" (dead-node) and "which skills should have fired but did not"
(should-have-fired). Spec: `docs/specs/2026-06-29-graph-behavior-m8.md`.

Decision 1 -- skills declare machine-readable `triggers` (`globs` / `extensions` /
`tools`) in their SKILL.md frontmatter; matching is mechanical and deterministic.
Alternatives rejected: lexical keyword heuristic over the NL `description` (noisy,
non-deterministic relevance) and an LLM/embeddings judge (cost, non-determinism,
off-CI). Declared triggers are opt-in and incremental -- a skill without triggers is
simply excluded from should-have-fired (zero false positives), and the NL-matching
problem becomes a mechanical one.

Decision 2 -- `analyzeBehavior` is a separate pure module (`behavior/`), not another
`analyze` detector. The behavioral data is temporal (per session), unlike the static
model `analyze` consumes. Keeping it separate avoids threading session state through
the static detectors and keeps `graph check`'s CI gate purely structural.

Decision 3 -- advisory only (`severity: info`, never joins `blockingFindings`), with a
volume guard (~3 sessions / ~20 events) so a sparse log does not read as "everything
is dead". dead-hook (wiring vs situations from plugin.json matchers) and semantic
matching are deferred. Matches the spec's "analysis is a signal (HITL); only
broken-route blocks CI".

## 2026-06-26: "secrets via env" carves out customer-provided (BYO) credentials

Context: an ADR audit of a consumer project (sesame, multi-tenant) surfaced a case
the doctrine handled wrong (issue #34). `PHILOSOPHY.md` and `void-security-guidance`
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
in `PHILOSOPHY.md` (the hard rule), the `void-security-guidance` skill (a Secrets
subsection), and the skill audit.

Alternatives rejected: (a) leave the rule absolute — keeps it wrong for a real,
recurring multi-tenant case; (b) a dedicated "secret storage" skill — anti-bloat
overkill for a one-clause carve-out that belongs next to the rule it qualifies.

Why: a rule stated more absolutely than it is true trains developers to either
break it or mis-apply it; the carve-out is sourced from a validated PROJECT-DOCTRINE
rule (sesame ADR 57), so it is doctrine earning its way up, not speculation.

## 2026-06-26: prior art reviewed: patoles/agent-flow (mined for P2, not P1)

**Decision:** agent-flow (live runtime agent visualizer, React/Next + 2D canvas +
SSE hook server) was reviewed. Borrowed for Plan B: its render decomposition into
small focused draw-modules and isolated camera/interaction/particles concerns.
Deferred to P2 as reference: its JSONL event schema (parentId/runtime/sessionId ->
our `activations.jsonl`), its HTTP-hook -> SSE transport (-> `graph live`), and its
timeline/scrubber (-> replay). Its 2D-canvas/React stack and run-physics data model
were not adopted (we are locked on 3D / 3d-force-graph and a structural model).

## 2026-06-26: graph-studio consumes the kernel via a static prebuild, not a runtime import

**Decision:** `apps/graph-studio` does not import `@voidcorp/harness-graph` into
the browser bundle. A Node prebuild (`scripts/prepare-data.ts`, run by tsx) reads
`model.json` + `.void/usage.log`, runs the kernel's `analyze()`, and writes four
static JSON blobs the browser renders.

**Why:** keeps `node:fs` (the kernel's `derive/` adapter) out of the bundle, keeps
analysis single-sourced in the kernel (no duplicated detector logic), and requires
zero edits to the already-merged kernel package (no browser-safe subpath export).
The cost -- findings are computed at build time, not live -- is acceptable for the
P1 static maintainer view; the live consumer surface is P2.

**Alternative rejected:** a browser-safe `@voidcorp/harness-graph/analyze` subpath
export imported at runtime. Cleaner data freshness, but edits a merged package and
risks bundling the fs adapter.

## 2026-06-26: file harness feedback directly as issues, drop the in-project `proposed/` queue (issue #35)

Context: `harness-evolution` (feedback mode) captured a perceived harness gap to
`.void/harness-feedback/proposed/YYYY-MM-DD-N.md` **inside the consumer project
repo**, then required a second step (`void-harness feedback push`, shipped
2026-06-19, cluster C) to walk the queue and file each note as a GitHub issue on
this repo. This put harness concerns in the wrong repo's git history and
duplicated a triage system that already exists: the GitHub issue tracker. A
per-repo markdown queue is a strictly worse reimplementation of an issue tracker
(no labels, no cross-project visibility, buried in each consumer's `.void/`).

Decision: replace the queue with **direct issue creation** on
`voidcorp-core/void-harness`.
- The skill / `/void-feedback` command drafts an issue, confirms it with the
  user, then opens it with `gh issue create` (label `enhancement`), carrying
  source-project context (repo, SHA, file path, motivation).
- The tracker is the triage zone: taking the issue promotes it, closing it
  declines it. No `proposed/` / `promoted/` / `discarded/` / `deferred/`
  bookkeeping, no `feedback push` step.
- Removed: the `feedback` CLI command (`packages/cli/src/commands/feedback.ts`),
  its pure builders (`lib/feedback.ts` + test), the `HARNESS_REPO` const (its
  only consumer), the help entry, and the `.void/harness-feedback/proposed/`
  convention from the skill and docs.

Why this preserves HITL: an issue is a proposal, not a doctrine write. HITL is
about not auto-MERGING a PR, not about not opening an issue, so creating the
issue directly does not weaken the gate. This reverses the 2026-06-19 decision to
*implement* `feedback push`: that command made the then-documented two-step real,
but the two-step itself was the misplaced ceremony.

The one caveat (deliberate discipline shift): the queue's only real value was a
pre-filter against noise in this tracker. Going direct moves that filter from
"before the issue exists" to "triage by close". Cheap for a single-maintainer
repo, but it makes the agent's **filing bar load-bearing**: file only when the
item is both *agnostic* (helps any consumer) and *harness-worthy* (changes a
skill / hook / pack / CLI / doctrine line); project-specific rules go to
`.void/PROJECT-DOCTRINE.md` via `capture-rule`. The reference bar is the #34 ADR
sweep, which rejected everything except one narrow correction. The skill codifies
this bar so the tracker does not fill with project-flavored noise.

Source: maintainer direction while auditing a consumer project (sesame).

## 2026-06-26: backlog-autopilot `verifyCmd` must mirror CI, not a test + type-check subset (issue #28)

Context: a real batch run drained 4 tickets into one integration PR on a Next.js 16
/ Turborepo / Bun monorepo with `verifyCmd = test + type-check`. The batch went
green, then CI / Vercel surfaced three integration defects the gate could not see:
a `'use client'` barrel dragging a `server-only` service into the client graph
(caught only by `build`), two tickets creating clashing dynamic route slugs at one
path position (production build tolerated it, `next dev` / the Playwright webServer
crashed on boot), and an e2e job that migrated but never seeded the mono-tenant org
(first authed write FK-violated). "The full suite is the judge" ran a strict subset
of CI, so a green batch produced a red CI.

Decision: `verifyCmd` is doctrine-bound to mirror the project's CI gate. For an app
workspace (Next.js especially) that means including `build` and the e2e/integration
suite when one exists, not just unit `test` + `type-check`. The launcher (Layer 1)
defaults `verifyCmd` to the full gate for apps or prompts the human to set it; the
**same** command gates the per-ticket worker and reconciliation (Layer 2), so a
green batch equals a green CI by construction. A credible alternative — keep the
subset default and only warn — was rejected: the divergence is silent and only
surfaces post-merge, which is exactly when it is most expensive.

Why: build- and run-time integration failures (client/server boundaries, route
trees, migrations/seed) are invisible to `test` + `type-check`; aligning the judge
to CI is the cheapest place to catch them. Guidance change only (skill + workflow
prompt text); no new CLI surface.

## 2026-06-26: backlog-autopilot auto-merge method configurable, default merge commit

Context: the risk-gated `--auto-merge` path hardcoded `gh pr merge --auto
--squash` (issue #31). A squash collapses an integration PR that bundles N
tickets — each with its own `test:`/`fix:` commits and "why" bodies — into a
single commit, against `void-commit-discipline`'s "the git log is documentation", and
it silently overrides a downstream repo whose convention is merge commits.

Decision: make the strategy a validated enum, `--auto-merge-method=merge|squash|
rebase` (env `AUTO_MERGE_METHOD`, file `autoMergeMethod`, same flags > env > file
> default precedence as the rest of `BacklogConfig`), **default `void-merge`**.
`mergeArgs(branch, method)` builds `--<method>`; an unrecognized value narrows to
undefined and falls through to the next source, so a typo never silently arms an
unexpected strategy.

Alternatives rejected:
- **Minimal: hardcode `--merge`.** Fixes the per-ticket-history loss but still
  imposes one strategy on every consumer; a repo standardized on squash would be
  forced off-convention, the symmetric version of the bug being fixed.
- **Auto-detect the repo's allowed/conventional method.** Requires a `gh`/API
  probe of branch settings at plan time (I/O in the pure config layer) for a
  guess that can still be wrong; an explicit flag with a safe default is simpler
  and deterministic. Deferred as YAGNI until a consumer asks.

Context: `autonomous-backlog-loop` covers the sequential walk-away case; it does
not cover "drain a few independent tickets in parallel, attended, without
breaking anything". Spec/plan:
`docs/specs/2026-06-18-backlog-batch-parallel.md`,
`plans/2026-06-18-backlog-batch-parallel-plan.md`.

Decision: ship a **sister** skill `backlog-batch` (not a mode of the loop). A
two-layer design: an **in-session launcher** selects an independent eligible
batch (Linear MCP), estimates each ticket's file footprint (a lightweight
estimator subagent), partitions **parallel (low overlap) vs sequential (overlap
/ lockfile / migrations)**, and — after **human confirmation** — invokes a
deterministic **Workflow** that fans out one **worktree-isolated subagent** per
ticket, then a **reconciliation subagent** merges the green branches into **one
integration PR gated by the full suite**. The deterministic core (selection,
partition, plan) lives in the CLI (`void-harness backlog-batch plan`,
vitest-tested); the MCP gathering, estimation, and fan-out are in-session /
Workflow. Subagents inherit the parent auth → subscription billing.

Alternatives rejected:
- **A mode of `autonomous-backlog-loop`.** Different orchestration (Workflow
  subagent vs CLI process), risk model (parallel vs sequential), and output
  (integration PR vs PR/ticket). Sister skill keeps each single-subject
  (anti-bloat rule 2); shared selection/worker vocabulary, < 30 % overlap.
- **An LLM session as orchestrator.** A long parent that fans out + reconciles
  accumulates context (rot) and drives the loop non-deterministically. The
  Workflow tool gives deterministic JS orchestration of subagents.
- **Process-parallelism (`claude -p` in worktrees) instead of subagents.** Loses
  tool/MCP inheritance, native observability, and inherited subscription billing
  — the reasons to prefer subagents for an *attended* burst.
- **Blind parallelism / clever overlap graph-coloring.** Naive parallel corrupts
  one shared tree; graph-coloring is YAGNI. Conservative "parallel only if
  isolated", with the reconciliation subagent + full suite as backstop.
- **Live multi-agent smoke on void-harness.** Worktree isolation targets the
  current repo, so a real run here would create worktrees/an integration branch/a
  PR on the harness itself. The live smoke is a consumer-project dogfood; the
  deterministic CLI layers carry the unit-tested confidence.

## 2026-06-21: consolidate backlog skills into `backlog-autopilot` (in session)

Context: `backlog-batch` (attended, parallel, independent tickets) and
`autonomous-backlog-loop` (sequential, walk-away, one `claude -p` process per
ticket) overlapped, and neither served the real goal — drain a Linear pool over
hours, in session, grouping tickets into logical clusters, one clean PR per
cluster, optionally auto-merged. The loop's out-of-session `claude -p` lost the
in-session MCP / connector / subscription inheritance.

Decision: consolidate both into one in-session skill, `backlog-autopilot`, and
**delete** `autonomous-backlog-loop` (skill + `/void-backlog-loop` command + the
`claude -p` orchestrator, stream-json parser and embedded worker prompt) with no
deprecated alias. The machine-readable worker-event protocol (`VOID_EVENT`) is
preserved (extracted to `events.ts`) as the future worker-output contract. A
future **headless backend** (walk-away / cron) is reserved and deferred, not the
deleted loop.

- **Orchestrator** — hybrid: a thin in-session LLM launcher pilots the cluster
  queue (durable `.void/autopilot` state + compaction between clusters), and a
  deterministic Workflow fans out disposable worktree subagents per cluster. This
  is "the LLM orchestrator done right": the pilot never reads implementation
  files, so it does not rot over a multi-hour run, while keeping MCP and
  subscription inheritance the out-of-session loop lacked.
- **Mode auto-detection** — given a pool (Linear project / milestone / parent
  graph / label / manual IDs), detect logical clusters (>= 2 linked tickets, with
  a **file-footprint overlap** corroborating the graph edge); otherwise drain a
  **batch of 4** independent tickets. Default batch size aligned to 4.
- **Opus everywhere** — deliberate derogation from `void-llm-cost-discipline` (Sonnet
  default): the run is subscription-billed, not API-metered, and the top-5 %
  quality bar wants constant judgment. Overridable by flag.

Why: keeps the user-facing capability one skill (anti-bloat rule 3, no residual
overlap), in session (MCP/subscription alive), without the context rot a single
long LLM orchestrator would suffer. See `docs/specs/2026-06-21-backlog-autopilot.md`
and `plans/2026-06-21-backlog-autopilot-plan.md`.

## 2026-06-21: auto-merge is risk-gated and sequential, not a "deterministic conflict-free cascade"

Context: the first design promised auto-merge with a "deterministic conflict-free
cascade" across stacked PRs. An `/autoplan` review (CEO + Eng + DX, dual Claude +
Codex voices) found this infeasible: `gh pr merge --squash` rewrites the parent
SHA, so a child rebased onto it conflicts whenever the parent touched shared
lines; GitHub does not auto-retarget a child unless the base branch is deleted;
and the existing `reconcile` is an LLM subagent, not deterministic.

Decision (binding, supersedes the cascade promise in the original spec):
- **No "guarantee conflict-free".** Stacked merges run **strictly sequentially**:
  wait for the parent to fully merge, rebase the single next child, **human gate
  on conflict** (never silent LLM resolution). A state machine **classifies**
  (conflict / stale / protection / CI / merge-queue) and **blocks safely** with an
  actionable report; tested against an ephemeral git remote, not arg snapshots.
- **Risk-gated auto-merge.** `--auto-merge` to `develop`/`main` arms only for a
  **low-risk** cluster (small diff, non-UI/security/migration, owned paths, not a
  stack root); risky clusters and stack roots get a PR for a human to merge.
- **Unknown branch protection is fatal** under `--auto-merge` (was a warning).
- **Worktree always** — one cluster worktree even for sequential work, per-ticket
  in parallel (crash / dirty-state safety); the earlier "worktree only when
  parallel" regressed safety.
- **Crash-resume reconciles remote state** (`gh pr list`, SHA, base, checks) with
  atomic writes, instead of replaying a local cursor.

Why: branch protection proves the tests passed, not that the change is right; the
review made the auto-merge blast radius explicit and replaced an impossible
mechanism with a safe, testable one. The operator's choices at the review gate:
keep the clean deletion (no alias), reserve a future headless backend, restrict
auto-merge to low-risk clusters, and always use a worktree.

## 2026-06-19: the autonomous loop's push boundary is server-side, not a hook (issue #17 cluster A)

Context: the autonomous backlog-loop (`autonomous-backlog-loop`) let each worker
push its branch and open its PR, with a planned `git push` PreToolUse hook as the
guard against a push to a protected branch. The autoplan (3 Claude voices + Codex
gpt-5.5 xhigh) found the guard is at the wrong layer: the worker also holds
`Bash(node:*)`/`Bash(npm:*)`/`Bash(npx:*)`, so `node -e "execSync('git push
origin HEAD:main')"` makes PreToolUse see `node`, not `git push` — a
string-matching hook guarding an agent with arbitrary code execution is
bypassable by construction.

Decision: move the boundary off the hook.
- **Server-side branch protection** on the base (`main`/`master`) is the durable
  boundary — the remote refuses a non-PR push regardless of what the worker runs.
  The orchestrator probes it at preflight (`gh api .../branches/<base>/protection`)
  and hard-refuses a confirmed-unprotected base.
- **The worker is commit-only.** `git push` and `gh pr` are removed from its
  allowlist; the trusted orchestrator pushes (explicit refspec, no force) and
  opens the PR. The capability is removed, not gated.
- **Per-ticket worktree isolation** so a worker's branch never moves the main
  HEAD; run-scoped, pruned at start, removed in a finally.
- `block-protected-push` stays as a **secondary net**, not the boundary.
- A4: the git allowlist is trimmed to the non-destructive subset (`cherry-pick`,
  `rebase --onto`); `git apply` was dropped (arbitrary write past the Edit/Write
  protect-sensitive-files gate). Command-execution rebase flags (`--exec`,
  `--rebase-merges`, `--strategy-option`, `--unsafe-paths`) are blocked in
  `block-dangerous-bash`, because Claude permission patterns are prefix-only and
  cannot catch a mid-command flag.
- A3: `void-source-driven-development` gains an offline branch (inject the doc as a
  port, validate with Zod) and a blocking `source-debt` (label + PR checkbox);
  the loop withholds auto-merge while a source-debt is open. Egress stays at zero.

Alternatives considered:
- Keep enforcement in the hook (original plan): rejected — bypassable by code
  execution, as above. The hook is demoted to a secondary net.
- Give the orchestrator a Linear GraphQL client so it (not the worker) moves the
  ticket: rejected as bloat — Linear is not the protected boundary; the git remote
  is. The worker keeps its scoped Linear MCP access; the orchestrator owns only
  the remote write (push + PR).

Framing: these changes reduce *false blocks* (the worker no longer trips a guard
mid-task), not the *blast radius*. Rollback tripwire: another direct-push-to-base
incident → unattended mode requires `VOID_SANDBOX` until the gap is closed.

Known pre-existing gap (logged separately, not closed here): `cat > .env` and
`node -e "fs.writeFileSync('.env', ...)"` bypass `protect-sensitive-files`, which
is wired to `Edit|Write` only, not `Bash`. Tracked in
`.void/harness-feedback/proposed/`.

## 2026-06-19: issue #17 cluster B resolved as guidance, not harness code

Context: cluster B (B1 fail-soft outbound HTTP, B2 `defineFormAction` drops
multi-value FormData, B3 `server-only` untestable under Vitest) read like code
bugs, but the harness is a meta-repo of skills + CLI + thin pack runtimes — it
has no `defineFormAction` and no Next.js app. The bugs were observed in a
consumer project; the harness's job is to teach the correct pattern so the
consumer's agent does it right.

Decision: fix each as guidance in the skill that owns the subject.
- B1 → a "Fail-soft outbound HTTP" section in core `void-async-safety` (the mirror of
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

## 2026-06-19: implement the promised `audit` + `feedback push` CLI commands (issue #17 cluster C)

Context: `harness-evolution`'s SKILL.md and PHILOSOPHY.md presented
`void-harness audit` and `void-harness feedback push` as if they existed, and
two shipped slash-commands depended on them — `/void-audit` literally runs
`void-harness audit`, and `/void-feedback` defers promotion to
`void-harness feedback push`. Neither CLI command existed, so `/void-audit` was
broken on invocation and the inbound→issue loop had no automation. (Issue #17
cluster C / C1.)

Decision: implement both, rather than rewrite the skills to a manual gesture.
- `void-harness audit` (MVP, usage-log only): reads `.void/usage.log` (written by
  the `skill-usage-meter` hook, `<timestamp>\t<skill>` per line) and classifies
  each harness skill as active / stale (`--stale-days`, default 30) / never. The
  stale + never lists are the deprecation candidates. Report-only (HITL).
- `void-harness feedback push`: reads `.void/harness-feedback/proposed/*.md`,
  previews by default (no side effects), and with `--open` files each note as a
  GitHub issue on `voidcorp-core/void-harness` (label `harness-feedback`) and
  moves it to `pushed/`. Preview-by-default keeps promotion deliberate.

Why implement, not doc-fix: the skills already wrap these commands by design
(the skill is the interactive HITL surface; the CLI is the deterministic,
testable engine). Implementing makes the skills work and the docs true; a
doc-fix would have left `/void-audit` a no-op.

Scope held to the usage-log MVP for `audit`: upstream-source deprecation and
decision-matrix-conflict detection need data sources beyond the usage log and
are a documented follow-up — not built here. The pure cores
(`lib/audit.ts`, `lib/feedback.ts`) are unit-tested; the commands are thin
readers/renderers over them.

Alternative considered: a fictional `audit propose-pr <item>` helper (referenced
in an old SKILL line) — dropped. `audit` reports; deprecation PRs stay
hand-authored, consistent with "HITL is absolute, never auto-write doctrine."

## 2026-06-18: backlog-loop worker reaches Linear via project .mcp.json only

Context: the loop's worker prompt (Step 1) tells each `claude -p` session to use
the Linear MCP to pick a ticket, but the generated `--settings` allowlist
(`AUTONOMOUS_SETTINGS.permissions.allow`) granted no `mcp__*` tool at all. Since
`--permission-mode acceptEdits` auto-approves only file edits and common
filesystem Bash (not MCP), every pick phase was denied unattended (headless
cannot prompt), so the loop could never select a ticket. The only Linear server
present was the developer's interactive claude.ai connector, which a headless
worker cannot authenticate against.

Decision: the worker reaches Linear exclusively through a project-level
`.mcp.json` server keyed `linear`, token-authenticated from the environment.
Three coupled changes:
- `AUTONOMOUS_SETTINGS.permissions.allow` gains exactly `mcp__linear__*` (not
  `mcp__*`): the unattended worker may call the Linear server and nothing else.
- `buildClaudeArgs` passes `--mcp-config <root>/.mcp.json --strict-mcp-config`,
  so the worker sees only the project's declared servers, never the developer's
  interactive connectors (claude.ai, Gmail, Drive, ...). This both fixes the
  observed failure (the worker fixating on the unreachable connector) and
  tightens the unattended-access boundary.
- Preflight fails loud (`hasLinearMcpServer`) when `.mcp.json` lacks a `linear`
  server, rather than spawning a worker that can never pick a ticket.

The loop is thus explicitly coupled to Linear-via-`.mcp.json`; the worker prompt
was already Linear-specific, so the coupling is named rather than hidden. `linear`
is a fixed convention (not configurable) to keep the allowlist a literal and the
surface minimal (Wing Chun economy of means).

Alternatives considered:
- Allow `mcp__*` broadly: one line, but hands an unattended worker every
  connected server (deploys, mailboxes). Rejected — violates deny-by-default.
- Configurable server name (`linearMcpServer` field): more flexible, but adds
  config surface and a derived (non-literal) allow rule for a name that has no
  reason to vary. Rejected as premature.
- Keep relying on the claude.ai connector + add an allow rule for it: the
  connector is absent in headless `claude -p`, so this cannot work regardless.

## 2026-06-18: backlog-loop orchestrator moves from bash to the TS CLI

Context: the `autonomous-backlog-loop` was launched via a hardcoded plugin-cache
path (`bash .../scripts/autonomous-backlog.sh`) with env-var config, and was a
black box — each `claude -p` worker's output went only to a log file, the terminal
showed `[HH:MM:SS] iteration N/M`, and the decisions workers took were never
surfaced at the HITL boundary (PR merge). Spec/plan:
`docs/specs/2026-06-18-backlog-loop-observability.md`,
`plans/2026-06-18-backlog-loop-observability-plan.md`.

Decision: rewrite the orchestrator in TypeScript under
`packages/cli/src/lib/backlog/`, exposed as `void-harness backlog-loop` (flags,
`--dry-run`, `--help`, first-run wizard) and the `/void-backlog-loop` command.
Each worker is spawned with `--output-format stream-json`, parsed into domain
events that drive a live **append-only** flux and a dense final summary
(tickets, decisions/ADRs, PRs to merge, blockers). Token usage is forced onto the
Claude **subscription**: the worker env is stripped of `ANTHROPIC_API_KEY` /
`ANTHROPIC_AUTH_TOKEN`, and a cloud-provider routing var aborts the run unless
`--allow-api` is an explicit opt-in. The worker prompt and the security allowlist
(`AUTONOMOUS_SETTINGS`) are embedded in the CLI so the orchestrator is
self-contained. The bash script, `iteration-prompt.md`, and
`settings.autonomous.json` are deleted (no other user — no compat shim);
`stop-verification-gate.sh` stays as the opt-in Stop hook.

Alternatives rejected:
- **Keep the bash orchestrator, add jq-based stream-json parsing.** Parsing a JSON
  event stream and rendering a live tree + accumulating a summary is beyond
  comfortable bash; the repo is already TS with a render layer. Bash would be
  fragile and untestable.
- **Drive workers via the Agent tool instead of fresh `claude -p` processes.** That
  shares one process and defeats the per-ticket context reset (the core anti-rot
  property). Fresh OS process per ticket is kept.
- **Ship a bash shim that execs the CLI.** No other user exists; a shim is dead
  weight. Removed outright.

## 2026-06-05: fix release-please PR title pattern (first 0.6.1 release recovered by hand)

Context: the first automated release PR (#7) was titled `chore: release main` —
no version. On merge, release-please logged `pullRequestTitlePattern miss the
part of '${version}'` then `untagged, merged release PRs outstanding - aborting`,
so it created no `v0.6.1` tag and would block all future releases. Root cause: a
`component` set without an explicit title pattern produced a versionless title.

Decision: set `"pull-request-title-pattern": "chore: release ${version}"` and drop
the `component` (a single root package does not need one), so release PRs carry the
version and release-please can tag them on merge. Recovered the stuck 0.6.1 by
hand: tagged `v0.6.1` on the release commit, created the GitHub release, and
relabeled PR #7 `autorelease: tagged` so release-please stops aborting. This commit
is `ci:` so it does not itself trigger a new release.

Alternatives rejected:
- Squash-merge release PRs to force a conventional title: the title-pattern fix is
  the actual cause; merge method is orthogonal.

## 2026-06-04: two security hooks shipped default-on (protect-sensitive-files, block-dangerous-bash)

Context: the harness shipped quality hooks but no safety floor for destructive
actions, and nothing protecting secrets/lockfiles from accidental edits. This is
the prerequisite for any unattended run and a general improvement.

Decision: add `protect-sensitive-files` (PreToolUse Edit|Write — blocks `.env*`
secrets, private keys, credential files, lockfiles, `.git/` internals) and
`block-dangerous-bash` (PreToolUse Bash — blocks recursive root delete, fork bomb,
raw-device writes, force-push without `--force-with-lease`, destructive SQL). Each
has a single deliberate-override env var (`VOID_HARNESS_ALLOW_SECRET_EDIT`,
`VOID_HARNESS_ALLOW_DANGEROUS`) so legitimate cases are unblocked explicitly while
the default is safe. Wired into the core plugin PreToolUse (now 10 hooks).

Alternatives rejected:
- Warning-only (non-blocking): a destructive command warned-but-allowed is not a
  floor. These are irreversible; they block.
- No override: would force users to disable the hook entirely for a one-off
  legitimate edit. A scoped env override is safer than an all-or-nothing toggle.

## 2026-06-04: skill name == folder + naming gate added to anti-bloat-check

Context: the Agent Skills spec requires `name` to equal the parent directory and to
match `^[a-z0-9]+(-[a-z0-9]+)*$`; a mismatch breaks auto-discovery silently. The
harness promised "skill tests pass in CI" but had no structural validation.

Decision: extend `scripts/anti-bloat-check.sh` (the single source of truth, already
run in CI) with a name==folder + naming-convention check across core and pack
skills. Cheap, deterministic, closes the structural half of the CI promise.

Alternatives rejected:
- A separate `skills-ref validate` dependency: adds an external tool for a check
  that is a few lines of shell. Kept it inline in the existing script.

## 2026-06-04: review fixes round 3 + honest reframe of the "safety floor"

Context: a multi-agent review of the PR found real holes, three of which were the
same systemic defect: a control duplicated across two representations where one
copy was updated and the mirror forgotten.

Confirmed-live fixes:
- **block-dangerous-bash** missed capital `-R` (`rm -Rf /`, `rm -R ~`) because the
  recursive clause matched lowercase `r` only while chmod used `[rR]`. Now `[rR]`.
- **protect-sensitive-files** let Codex's `shell` argv-array payload through (only
  a string command was handled, though its sibling block-dangerous-bash already
  handled arrays). Now joins arrays before scanning, and matches filenames
  case-insensitively (`.ENV`, `Credentials`, `.KEY` on a case-insensitive FS).
- **install --global** built the global manifest from a hardcoded 9-hook map that
  had drifted from plugin.json (shipping a global install with none of the new
  hooks). Now derives the hook wiring verbatim from the committed plugin.json
  (commands already use ${CLAUDE_PLUGIN_ROOT}), so it can never lag again.
- **autonomous-backlog render_prompt** used `sed s|...|$VALUE|`, which a `|`/`&`
  in a free-text config value (LINEAR_SCOPE) would corrupt, silently
  circuit-breaking the loop. Switched to bash parameter-expansion replacement
  (values treated literally).
- **doctor** now checks AGENTS.md, not only CLAUDE.md (the PR made AGENTS.md a
  maintained sister doc).

Design reframe (the important one):
- **block-dangerous-bash is reframed from "non-skippable safety floor" to a
  best-effort guardrail.** A regex blocklist of catastrophe shapes will never be
  complete (three review rounds found $HOME, -R, find -delete, git push +) and
  gives false confidence. The real deny-by-default floor for unattended runs is
  the scoped allowlist + sandbox (settings.autonomous.json). The hook is the
  secondary tripwire. docs/CODEX.md and the autonomous skill now say so.

Removed as inert:
- **precompact-doctrine hook deleted.** PreCompact has no decision control and
  cannot inject additionalContext (per the hooks docs), so the re-injection never
  happened. SessionStart fires with source `compact` after a compaction and DOES
  support additionalContext, so sessionstart-context already covers it. Shipping
  an inert hook is the same "documented fiction" anti-pattern we keep removing.

Alternatives rejected:
- Extend install.ts's hardcoded hook map instead of deriving from plugin.json:
  keeps the duplication that caused the drift. Derive from the single source.
- Keep block-dangerous-bash labeled a "floor": dishonest about a leaky blocklist;
  trains operators to keep the all-or-nothing override on.

## 2026-06-04: review fixes round 2 — $HOME rm/chmod, add/remove parity, doc honesty

Context: a second self-review found more real defects.

Decisions:
- **block-dangerous-bash** missed home-rooted targets. Factored shared target
  patterns: HOME_ROOT `(/ ~ $HOME ${HOME})` each with an optional trailing `/`
  and/or `*`, so `$HOME/`, `${HOME}/`, `~/*`, `$HOME/*` and the chmod/chown
  equivalents now block, while `$HOME/projects`, `~/.cache/x`, `/tmp/x`, `build/*`
  still pass. Tests added for each; the chmod check now requires a recursive flag
  AND a home/root target.
- **add / remove** patched only CLAUDE.md, leaving AGENTS.md stale and breaking
  the sister-doc parity rule. Both now call patchAgentsMd too. Regression test
  added (`test/cli/add-remove-parity.test.ts`).
- **ARCHITECTURE.md** overclaimed that `init` wires the sync pre-commit hook into
  consumer projects (it does not). Reworded: the parity gate is a harness-repo
  concern (`.githooks/` + CI); `init`/`add`/`remove` keep the two consumer docs in
  parity, and a consumer opts into the hook by pointing `core.hooksPath` at the
  shipped `.githooks/`.
- **capture-rule** shipped without an audit note (violating "one audit note per
  skill"); backfilled `plans/skill-audits/capture-rule.md` and added its
  decision-matrix row.

Known debt (NOT fixed this round, tracked): 27 pack skills lack a co-located
`.source` file. Their sourcing is recorded in their `plans/skill-audits/*.md`
notes. Resolution pending a deliberate choice: backfill each `.source` from its
audit note, or amend the sourcing rule to make `.source` mandatory for core
skills + agents and satisfied-by-audit-note for pack skills. Not auto-generated to
avoid fabricated attributions.

## 2026-06-04: review fixes — Codex shell gating, rm variants, anti-bloat scope, agent .source

Context: a self-review found real defects in the round-2 work.

Decisions:
- **block-dangerous-bash** now gates Codex's `shell` tool (was `Bash`-only, so the
  Codex hooks.json routing was inert) and reads an argv-array command. Its rm
  detection was rewritten to a (recursive-flag AND catastrophic-target) pair on a
  quote-stripped command, covering `rm -rf -- /`, `rm -rf "$HOME"`, `${HOME}`,
  `.`, `./`, `./*`, `*`, `~`/`~/` — while still allowing `./dist`, `build/*`,
  `~/.cache/x`, `/tmp/x`. Tests added for each.
- **anti-bloat-check** now scans pack skills/hooks too (was core-only), matching
  what ARCHITECTURE.md already claimed ("any SKILL.md / any hooks/*.sh"). This
  immediately caught 8 pack skill descriptions over the 200-char cap; trimmed.
- **Sourcing discipline applies to agents, not just skills.** doctrine-critic
  already carried a `.source`; the four new agents now do too. The CLAUDE.md
  sourcing rule is read as covering any authored doctrine artifact (skill or
  agent), since both are distilled from external sources.
- Refreshed the marketplace manifest (`.claude-plugin/marketplace.json`): the
  `harness` plugin now lists the five agents + lifecycle hooks; harness-monorepo drops
  the "ADR workflow" line (adr-workflow was promoted to core).

Alternatives rejected:
- A full shell-AST parse for rm safety: too heavy for a <100-line hook. The
  quote-strip + anchored-target regex covers the catastrophic forms deterministically;
  the override env var handles the rare legitimate case.

## 2026-06-04: resolve the pack .source debt (backfill all + gate it)

Context: 27 pack skills lacked a co-located `.source`, leaving the "one .source
per skill" rule violated and unenforced — the same rules-rot pattern as the
sync-agent-docs fiction.

Decision: chose backfill-all over exempting packs. The load-bearing reason: a
`.source` ships with the skill (it lives under packages/**/skills/<name>/ and is
distributed via the marketplace), whereas the audit note in plans/ does not. So
`.source` is the *provenance that travels to consumers* — pack skills ship too,
so exempting them would ship skills without provenance. A uniform rule also
avoids an asterisk in the doctrine.

- Backfilled all 27 pack `.source` files, derived strictly from each skill's
  existing audit note (no fabricated URLs). Finding: most pack audits, unlike
  core, have no "Sources audited" table — those skills are genuinely `native`
  concretizations of a pack module, recorded honestly as such.
- Added an anti-bloat gate: every skill (core + packs) must have a co-located
  `.source` AND a plans/skill-audits/<name>.md note. Verified fail-closed.

Alternatives rejected:
- Exempt pack skills from `.source` (audit-note-only): ships pack skills without
  travelling provenance, and adds a special-case to the rule.
- Auto-generate `.source` without reading the audits: risks fabricated
  attributions. Derived from the real audit content instead.

Follow-up (optional): pack audit notes lack the "Sources audited" table the core
notes use; backfilling those tables with real upstream doc URLs would enrich the
provenance further. Not blocking.

## 2026-06-04: opt-in autonomous-backlog-loop (Ralph distilled, HITL at the boundaries)

Context: the harness wanted a way to drain a curated Linear backlog unattended,
with full craftsman discipline, without adopting the unsupervised Ralph loop
(`while :; do cat PROMPT | claude --dangerously-skip-permissions; done`) which is
the antithesis of the harness's HITL-absolute principle.

Decision: ship `autonomous-backlog-loop` as an explicitly-launched skill (core,
never a default). One FRESH `claude -p` process per ticket (true context reset),
state in Linear + on-disk plan files. The human gates move to the boundaries —
backlog curation (acceptance criteria = approved spec) and PR merge — instead of a
per-action prompt. Default `AUTO_MERGE=0` (PRs, human merges). Full-auto
(`--dangerously-skip-permissions`) is gated behind `UNSAFE_FULL_AUTO=1` + a required
`VOID_SANDBOX` marker. The security hooks stay live; the orchestrator refuses to
start with `VOID_HARNESS_ALLOW_*` set or on a dirty tree.

Alternatives rejected:
- Unsupervised Ralph loop as default: no review, no floor, no sandbox. Rejected;
  offered only as an explicit sandboxed opt-in.
- Auto-merge by default: review is where correctness is owned. Default to PRs.
- Self-judged completion: the test suite is the gate, not the model's self-report.
- A `/clear`-only loop (single long session): context rot degrades quality silently;
  a fresh process per ticket is the stronger anti-context-rot.

## 2026-06-04: lifecycle hooks beyond PreToolUse + plugin slash commands

Context: the plugin wired only PreToolUse hooks and shipped zero slash commands,
leaving the rest of the lifecycle (and in-session ergonomics) unused.

Decision: add `auto-format` (PostToolUse, non-blocking Biome format — repairs
instead of refusing, fails open if Biome absent), `precompact-doctrine`
(PreCompact — re-injects the non-negotiable floor before context loss),
`sessionstart-context` (SessionStart — per-session floor reminder + version), and
`skill-usage-meter` (PreToolUse on Skill — appends to `.void/usage.log` so the
outbound `audit` has real data). Ship `/void-feedback`, `/void-doctor`,
`/void-audit` slash commands so the self-evolution loop is invocable in-session.

Alternatives rejected:
- A UserPromptSubmit hook: overlaps skill auto-discovery and risks noise.
- Making auto-format blocking: formatting must never block a turn; PostToolUse
  non-blocking is the right shape.

## 2026-06-04: four new core skills + the Rationalizations/Verification section standard

Context: research across anthropics/skills, the Claude Code creators' interviews, and
the best-practice corpus surfaced gaps not yet covered by the 22 core skills.

Decision: add `void-source-driven-development` (read official docs for the installed
version before writing config; cite the source), `context-management` (the window is
the core constraint: clear, compact, two-correction reset, fresh-context subagents,
state on disk), `compounding` (end-of-cycle ritual: name the reusable pattern and
route it via capture-rule / harness-evolution), and `void-api-and-interface-design`
(contract-first public interfaces, minimal surface, versioning). New skills adopt a
`## Rationalizations` table (pre-empts the model's excuses to skip the skill) and a
`## Verification` proof-gate as the standard anatomy.

Alternatives rejected:
- Retrofit the Rationalizations/Verification sections into all 22 existing skills
  now: large diff, rewrites authored voice broadly. Set the standard in new skills;
  backfill opportunistically.
- A full `writing-skills`/skill-creator port (to replace the superpowers pointer):
  high value but a larger effort; deferred as a tracked follow-up.

## 2026-06-04: Codex parity — real doctrine + safety floor, honest about what is pending

Context: the doctrine layer (AGENTS.md) was a real mirror, but the mechanical
layer was Claude-only: `init` never emitted AGENTS.md, and the hooks were Claude
PreToolUse format. A consumer running `init` got a Claude-only harness.

Decision: (1) `init` now patches both CLAUDE.md and AGENTS.md from one runtime-aware
`harnessBlock` (Claude uses `@imports`, Codex lists files to read — Codex has no
`@import`). (2) `protect-sensitive-files` is runtime-aware: it reads
`.tool_input.file_path` (Claude) and scans `apply_patch` envelope headers (Codex),
unit-tested. (3) Ship `packages/core/codex/hooks.json` + `docs/CODEX.md` documenting
the opt-in Codex wiring; `block-dangerous-bash` matches Codex's `shell` tool 1:1.

Honest status logged in docs/CODEX.md: verified = sync gate, AGENTS.md emission,
hook payload parsing. Pending a real-Codex run = end-to-end `.codex/hooks.json`
firing, and a `RUNTIME=codex` (`codex exec`) backend for autonomous-backlog-loop.

Alternatives rejected:
- Auto-write `.codex/hooks.json` + copy hook scripts into every consumer now:
  duplicates the marketplace delivery model and the firing path is unverified
  without a real Codex run. Ship the template + doc; wire deliberately.

## 2026-06-04: claude-md-authoring skill, four scoped agents, no-ai-design-slop, doctrine edits

Context: a deeper pass over the best-practice corpus surfaced gaps not covered by
the existing skills/agents.

Decision: add the `claude-md-authoring` skill (the harness produces CLAUDE.md
files; this governs writing them: length budget, no style rules -> linters,
`file:line` over snippets, progressive disclosure). Add four read-only,
model-tiered, narrow-scope agents — `silent-failure-hunter` (sonnet),
`type-design-analyzer` (opus), `code-explorer` (sonnet), `migration-planner`
(opus) — each routing out of scope, none overlapping doctrine-critic or gstack.
Add the `no-ai-design-slop` PreToolUse hook (deterministic regex for AI visual
tells; static gate, complements frontend-design without touching /design-review).
Distil doctrine into existing skills: vertical-slice planning (writing-plans),
frequent-intentional-compaction + leverage hierarchy (context-management,
code-review), and the agent model-tier convention (ARCHITECTURE.md).

Alternatives rejected:
- Stack-specific reviewer agents (per ECC/wshobson): those are pack concerns, not
  core; rejected to hold the anti-bloat line.
- Cryptographic review-surface receipts (wshobson governance): over-engineered;
  the HITL gate is the load-bearing part, not signed receipts.

## 2026-06-04: CLAUDE.md <-> AGENTS.md parity gate made real (was documented fiction)

Context: CLAUDE.md, AGENTS.md, ARCHITECTURE.md and the design plan all cited
`scripts/sync-agent-docs.sh` as a live pre-commit gate enforcing sister-doc
parity. The file did not exist, and there was no git-hook tooling at all
(no husky/lefthook/prepare). The parity claim was unenforced.

Decision: write `scripts/sync-agent-docs.sh` with two modes — `--staged`
(pre-commit XOR: a change touching one sister doc must touch the other) and the
default structure mode (section-heading parity after normalizing the known
terminology variants, stateless so it runs in CI). Wire it via `.githooks/pre-commit`
(opt-in `git config core.hooksPath .githooks`) and a CI step (`pnpm sync:docs`).
Tested in `test/sync-agent-docs/`.

Alternatives rejected:
- A full semantic doctrine-diff: the routing tables legitimately differ in
  content (not just terminology), so a content diff would false-positive.
  Heading parity + the both-or-neither rule is what the headers actually promise.
- Deleting the claim from the docs instead of implementing it: cheaper, but the
  parity rule is worth keeping; make it true rather than drop it.

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

## 2026-06-04: automate releases (release-please) + a lockstep version guard

Context: the 0.6.0 bump was manual (`pnpm bump` + asking). Hand-bumping a version
is a process smell and an obvious drift source — exactly the rules-rot pattern
this repo keeps eliminating.

Decision: adopt **release-please**, driven by the Conventional Commits the repo
already enforces. A workflow maintains a single release PR that bumps the
canonical version across every manifest (via `extra-files` — the same file list
as `bump-version.mjs`, plus the core-assets mirror) and writes CHANGELOG.md;
merging the release PR tags `vX.Y.Z` and cuts a GitHub release. The version is
computed automatically; the merge is the only human gate (HITL preserved). Pre-1.0
policy: feat → minor, fix → patch, breaking → minor (`bump-minor-pre-major`). npm
publish is deliberately not wired yet (the package is unpublished).

Added a belt-and-suspenders **lockstep guard** (`scripts/check-version-lockstep.mjs`,
`pnpm version:check`, wired into CI): it fails the build if any version-carrying
file diverges from the canonical marketplace version — so a miss by release-please
(e.g. a bad jsonpath), the manual bumper, or a hand-edit is caught before it ships.
`bump-version.mjs` stays as the manual/offline fallback.

Alternatives rejected:
- **changesets**: per-package independent versions + per-package changelogs
  contradict the single-number lockstep; release-please fits Conventional Commits
  and lockstep better. (Same reason it was dropped in 0.5.4.)
- **Auto-tag/commit on every merge to main**: needs a privileged token to push to
  protected main and bot-commits per merge; the release-PR model is cleaner and
  keeps the human gate.
- **Bespoke release workflow around `bump-version.mjs`**: reimplements the
  release-PR + tag orchestration release-please already does robustly. Kept the
  script only as a fallback; the guard makes either path safe.

Caveat: the release workflow itself can only be validated on its first real run
(GitHub Actions). The load-bearing pieces are tested/guarded: the lockstep check
(unit-tested) and the bumper.

## 2026-06-04: adr-workflow promoted from pack-monorepo to core

Context: `adr-workflow` lived in pack-monorepo, but ADRs are a universal craftsman
concern and the repo meta-rule already mandates logging non-obvious decisions.

Decision: move the skill to `packages/core/skills/adr-workflow`, generalize the
"monorepo" wording to "codebase", add the missing `.source`, and drop "ADR workflow"
from the pack-monorepo manifest description. Audit note updated (pack → core).

Alternatives rejected:
- Leave it in pack-monorepo: consumers without the monorepo pack would lack a
  universal discipline the meta-rules assume exists.

## 2026-06-01: .void/config.json pins marketplace plugins, not npm packages

Context: the `packs` field in `.void/config.json` is written by `init` as
`@voidcorp/<plugin-name>` (e.g. `@voidcorp/harness-nextjs`) and read back by
`doctor` in the same shape. The docs example instead showed `@voidcorp/pack-nextjs`
(the npm package name), mixing two vocabularies for the same field.

Decision: the field pins marketplace plugins (what `doctor` compares against the
marketplace HEAD), keyed `@voidcorp/<plugin-name>`. Docs were aligned to the
runtime; the schema was left unchanged to avoid breaking existing consumer
configs. The npm package names (`@voidcorp/pack-<stack>`) are a separate concern
(runtime `import`s), documented as such.

Alternative rejected: rekey the field to npm package names. That would require
changing init + doctor in lockstep and would break any `.void/config.json`
already written in consumer projects, for no functional gain (doctor needs the
plugin identity, not the npm name).

## 2026-06-01: test key/token fixtures are generated at runtime, gitleaks stays as-is

Context: same field feedback. The repo's gitleaks `generic-api-key` rule (NOT a
void-harness hook) flagged a hardcoded base64 `encryptionKey` test fixture and
blocked the commit — gitleaks decodes base64 and scores its entropy.

Decision: do NOT add a `*.test.ts` allowlist to `.gitleaks.toml`. A blanket
path allowlist is a security hole (real leaked secrets in a test file would pass
unscanned). The convention instead: test fixtures for keys/tokens are generated
at runtime (`crypto.randomBytes`) or use low-entropy placeholders — never a
hardcoded high-entropy base64 literal. This keeps the scan at full strength and
removes the false positive at the source.

Scope note: this is a convention for harness-consuming projects, not a code
change in this repo. Logged here because it is a deliberate "don't weaken the
gate" decision with a credible (and rejected) alternative.

## 2026-06-01: one `doctrine-critic` agent, not the three originally planned

Context: the design doc Section 8 and DEV-363 planned three review agents
(`senior-reviewer`, `security-reviewer`, `architect-critic`). An agent-layer
audit (DEV-363, pre-implementation) measured each against what the harness and
the global layer already ship and found heavy responsibility overlap, in tension
with anti-bloat rules 3 (overlap > 30 %) and 6 (no spillover into gstack):

- `senior-reviewer` ≈ global `pr-reviewer` agent + `tdd-guardian` + `ts-enforcer`,
  gstack `/review`, built-in `/void-code-review` (incl. `ultra`), harness `void-code-review`
  skill. ~75 % overlap.
- `security-reviewer` ≈ gstack `/cso` (OWASP/STRIDE/secrets/supply-chain, the exact
  scope), built-in `/security-review`, harness `void-security-guidance` skill (which
  already delegates to `/cso`). ~85 % overlap.
- `architect-critic` ≈ gstack `/plan-eng-review`, harness `void-hexagonal-architecture` +
  `void-domain-driven-design` skills + pack `void-dependency-direction`, and the deterministic
  `boundary-direction-check.sh` hook. ~70 % overlap.

The principle: an agent only earns its place when it adds something a skill or a
hook cannot. The one gap nothing else fills is a **context-isolated, read-only
judgment of conformance to VoidCorp doctrine**. The 8 PreToolUse hooks enforce the
*mechanical* floor (no-any, boundary direction, …) at Edit/Write time; generic
reviewers (`pr-reviewer`, `/review`) check generic quality. Neither judges the
*non-mechanical* doctrine calls — over-abstraction, tests that assert nothing, the
strict-TDD Iron Law and its `.void/config` modes, a boundary respected by the
letter but not the spirit, the seven anti-bloat rules on skills/hooks themselves.

Decision: ship a single `doctrine-critic` agent (read-only, isolated context). It
judges doctrine conformance and **routes** rather than re-implements: it flags
trust-boundary code and hands off to `/cso`, and hands line-level bug hunting to
`/void-code-review`. Spec: `plans/2026-06-01-doctrine-critic-agent.md`. DEV-363 is
rescoped 3 → 1; the `security-reviewer` and `architect-critic` slots are dropped
(their value already lives in `/cso`, the boundary hook, and the hexagonal/DDD
skills). Manifests move from "3 agents on the roadmap" to "1 shipped".

Naming: "critic", not "reviewer", to avoid routing ambiguity with `pr-reviewer`,
gstack `/review`, and built-in `/void-code-review` — three review tools already in a
consumer session. "doctrine", not "harness" (which reads as the install itself,
colliding with `doctor`/`audit`) and not "craftsman"/"conformance" (vaguer / more
process-flavoured). It inherits the "critic" of the dropped `architect-critic`.

Alternatives rejected:
- Build all three as planned: triples the maintenance surface and injects
  routing non-determinism (three thin wrappers competing with the global agents
  already present) for near-zero marginal value. Disqualifying for a harness whose
  edge is determinism.
- Ship zero agents (purist anti-bloat): defensible, but leaves the doctrine
  judgment layer uncovered — the hooks catch only the mechanical violations.

## 2026-06-01: no-null-grep matches on a comment/string-stripped view (heuristic, not AST)

Context: field feedback from a consumer monorepo — `no-null-grep.sh` blocked a
commit because a comment literally said "pas null". The hook matched `\bnull\b`
against the raw line, so the substring `null` inside a `//` comment, a `/* */`
block, or a quoted string was flagged as the `null` literal.

Decision: before matching, strip string literals (`"…"`, `'…'`, single-line
`` `…` ``), inline `/* */` blocks, and `//` line comments per line via sed, then
match `\bnull\b` on the residue. The `// allow-null:` override is checked on the
RAW line first (stripping would erase the tag). Tests in
`test/no-null-grep/no-null-grep.test.ts`.

Alternatives rejected:
- A real AST/TS-aware parse: correct but turns a 56-line shell PreToolUse hook
  into a tsc/tree-sitter dependency, violating "hooks ≤ 100 lines, no framework".
- Comment-stripping only (the minimum the reporter suggested): leaves string
  literals like `"value is null"` flagged. Strings are a legitimate source of the
  same false positive, so they are stripped too.

Known limit (documented in the hook): line-oriented, so a `null` inside a
multi-line block comment or template literal split across the edit chunk may
still be reported. The `// allow-null: <reason>` tag is the escape hatch.

## 2026-06-01: keep `workspace:^` for internal deps, guard the packed tarball in CI

Context: `pack-nextjs` peer-depends on `pack-monorepo`. The risk flagged by audit:
`npm pack`/`npm publish` do not understand the workspace protocol, so `workspace:^`
would leak verbatim into a tarball published with npm.

Attempt rejected: switch to an explicit `^<version>` range so the source is
npm-safe. Verified empirically that this BREAKS: `pack-monorepo` is not published
to npm, and pnpm 9 defaults to `link-workspace-packages=false`, so a plain range
resolves against the registry and `pnpm install --frozen-lockfile` fails with
`ERR_PNPM_OUTDATED_LOCKFILE` / unresolved package. The workspace: protocol is
therefore REQUIRED for unpublished internal deps; the earlier "use a literal
range" idea (and a bump-version range-rewriter) was reverted.

Decision: keep `workspace:^` in source. pnpm pack/publish rewrites it to
`^<version>` (verified: the packed tarball carries `^0.5.4`). A CI + release gate
(`scripts/check-publish-safety.mjs`) packs each npm package with pnpm and fails
if a `workspace:` specifier survives into the tarball. This verifies the artifact
we actually ship and catches a conversion regression (bad `.npmrc`, pnpm change).
It does NOT, and cannot, stop a manual `npm publish` that bypasses our tooling:
RELEASING.md mandates `pnpm -r publish`, and that process rule is the boundary of
what an in-repo check can enforce.

## 2026-06-01: jq is a hard runtime dependency, surfaced by doctor

Context: 15 of the 20 hooks parse the Claude Code tool-call JSON from stdin with
jq. On a machine without jq the hooks fail open and silently stop enforcing.

Decision: `void-harness doctor` now checks for jq alongside gh, with an install
hint. jq stays an external dependency (not bundled): it is ubiquitous and
bundling a binary per platform is not worth the weight.

## 2026-06-01: em dash / emoji rule softened (no purge, no gate)

Context: the hard rule "No em dashes, no emojis in code/docs/commits" was
contradicted by the corpus itself: 254 tracked files contain em dashes, mostly
deliberate typographic separators in skill prose, and the render layer uses an
em dash glyph as data. CLAUDE.md and AGENTS.md violated their own rule.

Decision: soften the rule to target intent (no AI-slop filler) while allowing
em dashes and emojis where they carry meaning. No repo-wide purge, no CI gate.

Alternatives rejected:
- Purge all 254 files and add a global grep gate: enormous diff, rewrites the
  authored style of every skill, and would still need an allowlist for the
  render glyph. Cost far exceeds the benefit.
- Drop the rule entirely: loses the original intent (keeping AI-slop out of
  newly written prose and commits).

## 2026-06-01: Biome as the linter (over ESLint)

Context: the root `lint` script fanned out to per-package `lint` scripts that
did not exist, so `pnpm lint` printed "None of the selected packages has a lint
script" and exited 0. A quality harness shipped with a gate that gated nothing.

Decision: adopt Biome (`@biomejs/biome`) as the single linter. Root `lint`
script is `biome lint`; config lives in `biome.json`, scoped to first-party
TypeScript (`packages/**/src`, config files, `test/`) and excluding `dist`,
`node_modules`, `templates`, and `*.d.ts`. A CI step runs `pnpm lint`.

Alternatives considered:
- ESLint + typescript-eslint: more rules and plugins, but heavier install,
  slower, and needs a flat-config plus parser wiring. Overkill for a small CLI.
- Keep the fan-out and add per-package ESLint: more moving parts, same result.

Why Biome won: single binary, near-zero config, fast, and the hooks already
treat both `biome` and `eslint.config` as known toolchain markers. The formatter
is left disabled in the gate (`biome lint`, not `biome check`) so the gate
enforces correctness without forcing a repo-wide reformat.
