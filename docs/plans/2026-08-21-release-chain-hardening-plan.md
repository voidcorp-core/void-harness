---
title: Release chain hardening with PR-native HITL
date: 2026-08-21
status: in-progress
spec: docs/specs/2026-08-21-release-chain-hardening.md
ticket:
author: Florent Pellegrin + Codex
high_risk: true
---

# Release chain hardening with PR-native HITL

## Goal

Make the release contract mechanically true: a routine release has exactly two human pull-request
merges, the Release App cannot cross `main`, required checks reject noncanonical auto-merge, and npm
receives exactly the tarball validated outside the only OIDC-capable job. The rollout must preserve
the current five required checks, account for every commit promoted from `develop`, and leave no
stored npm or administrator credential in Actions.

The binding design is
`docs/specs/2026-08-21-release-chain-hardening.md`. Its durable trust-boundary decision is
`adr:7ead6842-9674-49b5-ac85-1d182da4c5bf`.

## Scope and hard boundaries

- Never edit a secret, GitHub App private key, npm token, lockfile or versioned manifest by hand.
- Never grant the Release App `Actions`, `Administration`, `Environments`, `Secrets` or organization
  permission.
- Keep repository auto-merge enabled; permit its use only for
  `chore/back-merge-main -> develop` in this repository.
- Treat that restriction as detect-and-block on `develop`, not as a server-side App capability
  boundary. GitHub cannot scope the App's repository write permission to one PR; the human-only
  `main` boundary is the publication containment control.
- Keep zero required approving reviews and no `npm-publish` environment reviewer. The human gates
  are merges, not approve-then-merge pairs and not Actions deployment approvals.
- Do not enable repository-wide SHA pinning until every effective workflow reference is compatible.
- Do not publish a disposable production version. The next genuine release is the end-to-end proof.
- Organization 2FA, npm owner 2FA and npm token revocation are human account controls. The agent may
  audit and guide them, but does not alter credentials or account recovery material.

## Steps

### Step 1 - Enforce the human-only `main` boundary (MVP cut)

- **Goal**: Immediately remove the Release App's ability to merge either human-gated PR while
  preserving every existing branch protection.
- **Depends on**: none
- **TDD mode**: souple
- **Files**: none; this is an atomic GitHub branch-protection update.
- **Implementation**:
  1. Read `GET /repos/voidcorp-core/void-harness/branches/main/protection` and retain the complete
     pre-change observation.
  2. Reconstruct the update payload explicitly rather than forwarding response-only URL fields.
  3. Preserve strict required checks (`validate`, `enforce`, and install conformance on Ubuntu,
     macOS and Windows), required PRs with zero approvals, stale-review dismissal, admin
     enforcement, conversation resolution, and the force-push/deletion bans.
  4. Set `restrictions.users` to `['folpe']` and both `restrictions.teams` and
     `restrictions.apps` to `[]`.
  5. Read the protection back and compare all preserved fields plus the exact actor lists.
- **Verification gate**: The read-after-write response proves `folpe` is the sole push actor, no App
  or team is present, the five strict checks are unchanged, admins remain enforced, and force-push
  and deletion remain disabled. Any missing field or 4xx response stops execution before Step 2.
- **Expected commits**: none; GitHub's branch-protection state and audit log are the evidence.
- **Notes**: Updating branch protection replaces actor arrays. Never issue a partial guessed payload.
  This step is independently valuable and reversible without touching release code.

### Step 2 - Make every workflow dependency immutable

- **Goal**: Make the repository compatible with GitHub's full-SHA enforcement before that setting is
  enabled.
- **Depends on**: Step 1
- **TDD mode**: strict
- **Files**:
  - `test/workflows/workflows-parse.test.ts`
  - `packages/cli/src/lib/decision-workflow.test.ts`
  - `.github/workflows/ci.yml`
  - `.github/workflows/void-enforce.yml`
  - `.github/workflows/enforce.yml`
  - `.github/workflows/promotion.yml`
  - `.github/workflows/back-merge.yml`
  - `.github/workflows/release.yml`
- **Implementation**:
  1. Add a failing repository-wide invariant: every non-local `uses:` in `.github/**/*.yml` is a
     40-character commit SHA; local `./...` actions remain allowed.
  2. Resolve each currently declared official major tag through the provider's Git ref/commit API,
     pin the returned commit, and retain the human-readable major tag in a comment.
  3. Pin GitHub-owned actions, `pnpm/action-setup`, `googleapis/release-please-action`, and the
     artifact actions introduced later in this plan.
  4. Remove `voidcorp-core/void-harness/.github/actions/void-enforce@main` from the reusable workflow.
     In `enforce.yml`, check out the caller as today, then check out
     `${{ job.workflow_repository }}` at `${{ job.workflow_sha }}` into an isolated subdirectory and
     invoke that checked-out local composite action. These job contexts identify the called workflow,
     unlike the caller-owned `github` context.
  5. Update the decision-workflow assertion to test the immutable reference rather than `@v6`.
- **Verification gate**:
  `pnpm vitest run test/workflows/workflows-parse.test.ts packages/cli/src/lib/decision-workflow.test.ts`
  passes; a deliberate `@main` or `@v6` mutation makes it fail; YAML parsing/indentation checks stay
  green; the reusable workflow still checks the caller diff with the harness files from its own
  workflow SHA.
- **Expected commits**:
  - `test(ci): require immutable action references`
  - `fix(ci): pin every effective workflow dependency`
- **Notes**: Do not enable the GitHub setting in this step. The setting is safe only after these bytes
  reach `main`.

### Step 3 - Bound and audit promotion/back-merge automation

- **Goal**: Make one single-flight promotion PR and one single-flight canonical back-merge the only
  intended PR automation paths, reject noncanonical auto-merge through the required check, and make
  every commit entering a promotion explainable.
- **Depends on**: Step 2
- **TDD mode**: strict
- **Files**:
  - `test/workflows/workflows-parse.test.ts`
  - `test/workflows/release-authority.test.ts` (new)
  - `.github/workflows/void-enforce.yml`
  - `.github/workflows/promotion.yml`
  - `.github/workflows/back-merge.yml`
- **Implementation**:
  1. Add source invariants that reject `gh pr merge --auto`, GraphQL auto-merge mutations, or an
     auto-merge action in every workflow except the canonical back-merge command.
  2. Extend the required `enforce` workflow to run when auto-merge is enabled or disabled and inspect
     the PR's current auto-merge state. Fail when auto-merge is armed anywhere except the exact
     `chore/back-merge-main -> develop` pair in this repository.
  3. On a promotion PR, enumerate the complete `main..develop` commit set and its associated merged
     PRs, including each PR's GraphQL timeline. Reject direct/unexplained commits, wrong-base PRs and
     any `AutoMergeEnabledEvent` outside the canonical back-merge. Require `mergedBy` to be the human
     `folpe` for every other PR, so an App/API merge is also rejected. Surface the accounted commit/PR
     list, merge actors and auto-merge events in check evidence for human review.
  4. Require repository `voidcorp-core/void-harness`, exact event refs, exact base/head pairs and a
     non-fork PR before creation, update or merge operations.
  5. Give promotion and back-merge separate fixed concurrency groups; cancel superseded runs so a
     newer branch head invalidates the older writer.
  6. Scope each generated App token explicitly to the current owner/repository. Keep promotion at
     `contents: read` plus `pull-requests: write`; keep back-merge only at the contents/PR write
     permissions its bot branch requires.
  7. Keep exactly one bot branch, `chore/back-merge-main`, update it with force-with-lease only, and
     inspect the PR's repository/head/base fields immediately before arming native auto-merge.
  8. Leave content conflicts red and human-owned; never select a side or force a protected branch.
- **Verification gate**:
  `pnpm vitest run test/workflows/workflows-parse.test.ts test/workflows/release-authority.test.ts`
  passes; mutations to auto-merge state, commit/PR accounting, repository, head, base, fork check,
  concurrency or command location fail; `bash -n` passes on extracted run blocks.
- **Expected commits**:
  - `test(release): pin the only allowed auto-merge path`
  - `fix(release): bind promotion and back-merge identity`
- **Notes**: Repository auto-merge remains enabled. This step detects and blocks intended use; it
  cannot remove the Release App's generic write capability on `develop`. Step 1 prevents that
  residual authority from crossing `main`, and the promotion PR makes the complete diff human-owned.

### Step 4 - Produce one integrity-bound release artifact without OIDC

- **Goal**: Validate the exact immutable release tree and pack the final npm tarball once in a job
  that cannot request a publishing credential.
- **Depends on**: Step 3
- **TDD mode**: strict
- **Files**:
  - `scripts/release-artifact-contract.mjs` (new, pure helpers only)
  - `scripts/prepare-release-artifact.mjs` (new imperative adapter)
  - `test/workflows/release-artifact-contract.test.ts` (new)
  - `packages/cli/src/lib/release-workflow.test.ts`
  - `.github/workflows/release.yml`
- **Implementation**:
  1. Model release identity as tag, version, commit, package name, tarball name, SHA-256 and npm
     SHA-512 integrity. Reject malformed tags, names, versions, duplicate tarballs and mismatched
     manifests as errors, not booleans silently ignored.
  2. For the normal path, consume release-please's `release_created` and `tag_name` outputs. For
     recovery, require a `workflow_dispatch` input named `release_tag` matching `vX.Y.Z`; remove the
     current implicit "publish main's current version" behavior.
  3. Gate dispatches to `refs/heads/main`. Pass event/context values through fixed environment
     variables, validate the tag with a closed `v[0-9]+\.[0-9]+\.[0-9]+` grammar before use, quote
     every expansion and use option terminators where supported. Never interpolate an expression
     directly into a `run:` program.
  4. Resolve the tag to a commit, verify a matching GitHub Release exists, prove the commit is an
     ancestor of protected `main`, and check tag/package/all manifest versions agree.
  5. In `validate-release`, check out that commit, install with the frozen lockfile, run version,
     build, typecheck, test and publish-safety gates, then pack `voidharness-X.Y.Z.tgz` exactly once.
  6. Generate a JSON integrity manifest beside the tarball and upload both as one artifact with
     one-day retention and a tag/run-specific name. Expose the upload action's immutable artifact ID
     and service-computed digest as `validate-release` job outputs.
  7. Give this job only `contents: read`; assert that it has no `id-token: write`.
- **Verification gate**:
  `pnpm vitest run test/workflows/release-artifact-contract.test.ts packages/cli/src/lib/release-workflow.test.ts`
  passes, including wrong tag, moved/non-main commit, version drift, extra tarball and byte corruption
  cases. A fixture pack's recorded SHA-256 and SHA-512 match independently recomputed values.
- **Expected commits**:
  - `test(release): define the validated artifact contract`
  - `feat(release): pack the exact release tree without OIDC`
- **Notes**: The pure contract module performs no I/O. The adapter owns filesystem/process effects.
  No version or lockfile is edited.

### Step 5 - Publish minimally, then verify registry provenance without OIDC

- **Goal**: Reduce npm authority to a minimal, serialized job that can only publish the bytes from
  Step 4, then cryptographically bind the registry result to the exact release execution in a
  separate non-OIDC job.
- **Depends on**: Step 4
- **TDD mode**: strict
- **Files**:
  - `test/workflows/release-authority.test.ts`
  - `test/workflows/release-artifact-contract.test.ts`
  - `scripts/release-provenance-contract.mjs` (new, pure helpers only)
  - `test/workflows/release-provenance-contract.test.ts` (new)
  - `packages/cli/src/lib/release-workflow.test.ts`
  - `.github/workflows/release.yml`
- **Implementation**:
  1. Make `publish` the only job in all workflows with `id-token: write`; retain environment
     `npm-publish`, only `contents: read` plus `actions: read`, a GitHub-hosted runner and a non-cancelling
     `npm-voidharness-publish` concurrency group.
  2. Do not check out the repository and do not run install, build, lifecycle or repository scripts.
     Use only full-SHA GitHub actions needed to provision a compatible Node/npm runtime and download
     the validated artifact by the exact artifact ID output from Step 4.
  3. Query `GET /repos/voidcorp-core/void-harness/actions/artifacts/{artifact_id}` with the job's
     `actions: read` token. Require the immutable artifact ID, service `digest`, `workflow_run.id`,
     `workflow_run.head_sha` and non-expired state to match the upload outputs and current workflow
     run before download. The run head may differ from an older release commit during recovery; the
     inner manifest separately binds the tarball to that resolved release SHA. Treat the download
     action's built-in digest warning as defense in depth, not the fail-closed gate.
  4. Recompute SHA-256 and SHA-512, validate the artifact's own manifest, tarball filename and
     embedded `package/package.json`, and stop before npm/OIDC use on any mismatch.
  5. Query `voidharness@X.Y.Z`. If absent after bounded classification retries, run
     `npm publish ./voidharness-X.Y.Z.tgz --access public --ignore-scripts` with npm 11.5.1 or newer.
     Classify npm's captured stdout, stderr and exit status through executable fixtures: only a
     structured stderr `E404` means absent, a bounded set of transport/server errors retries, and
     malformed, authorization, conflicting-output or integrity failures stop. If present, require
     matching `dist.integrity` and an attestation endpoint, skip publication, and pass the candidate
     to the verifier below. Do not call the candidate a success yet.
  6. After a new publish, poll the registry for a bounded period and require matching integrity plus
     an attestation endpoint. Different bytes or missing attestations after the bound are critical.
  7. Keep npm authentication tokenless: no `NODE_AUTH_TOKEN`, auth-token npmrc, registry-url input or
     stored package credential.
  8. Add `verify-publication`, which always follows `publish`, has `contents: read` only and no OIDC,
     environment, App token or package credential. In a temporary project, install the exact version
     with lifecycle scripts disabled and use the exact tested npm CLI release 11.12.1
     with
     `npm audit signatures --json --include-attestations` to cryptographically verify registry
     signatures, provenance and the package subject/tarball digest.
  9. Extract only the npm-verified provenance bundle for `pkg:npm/voidharness@X.Y.Z` and pass the
     registry tarball plus bundle to `gh attestation verify`. Require exact repository
     `voidcorp-core/void-harness`, signer workflow `.github/workflows/release.yml`, source ref
     `refs/heads/main`, source and signer digest equal to the current workflow head SHA, SLSA v1
     predicate, and a GitHub-hosted runner for a new publish. For an existing version, derive the
     original producer head, run and attempt from the npm-verified statement, then pass that exact
     head to GitHub CLI's independent certificate constraints. The previously verified artifact
     manifest separately binds the signed tarball to the immutable release SHA, which may be older
     during recovery.
  10. Parse the verified JSON as untrusted input with a pure contract helper. Require one matching
      subject/digest and require workflow path, ref, workflow head commit, run ID and attempt to
      equal the canonical producer evidence. Require the current execution for a new publish, but
      the original attested execution for an existing-version retry. Reject missing, duplicate or
      conflicting attestations. The whole workflow succeeds only after this job passes.
  11. Before locking the verifier contract, run a read-only compatibility probe against the existing
      `voidharness@3.3.0` provenance bundle. Pin the observed npm and GitHub CLI verifier versions in
      workflow assertions; if GitHub CLI rejects an npm-verified Sigstore bundle format, stop and
      revise the design against the official verifier APIs rather than weakening identity checks.
- **Verification gate**:
  The targeted workflow tests prove that the OIDC job has no checkout/install/build/test/prepack
  command, npm 11.5.1+ and `--ignore-scripts` are mandatory, corruption fails before the publish command,
  E404 is distinct from transient registry failure, and the post-publication verifier has no OIDC.
  Contract fixtures for wrong subject, repository, workflow, ref, commit, run, attempt and digest all
  fail; a matching existing version becomes idempotent only after cryptographic verification. YAML
  and shell syntax pass.
- **Expected commits**:
  - `test(release): reject unverified and non-idempotent publishes`
  - `feat(release): publish the validated tarball through minimal OIDC`
  - `feat(release): verify registry provenance outside OIDC`
- **Notes**: Pinned third-party action code still executes in the OIDC job, so keep the list minimal.
  npm's local gzipped tarball package specification is the publication boundary. npm's signature
  verifier and GitHub CLI's identity constraints are both required; checking registry metadata alone
  is not accepted as provenance verification.
  Compatibility was proven on 2026-08-21 with npm 11.12.1 and GitHub CLI 2.97.0 against the public
  `voidharness@3.3.0` npm bundle. GitHub CLI must receive `--digest-alg sha512`; its SHA-256 default
  rejects npm's SHA-512 subject before certificate policy evaluation.

### Step 6 - Make the operator contract truthful and recoverable

- **Goal**: Document the exact two-button normal path, exceptional tag retry and external controls so
  an unfamiliar maintainer can operate or audit the chain without inference.
- **Depends on**: Step 5
- **TDD mode**: souple
- **Files**:
  - `docs/RELEASING.md`
  - `test/workflows/release-authority.test.ts`
  - `packages/cli/src/lib/release-workflow.test.ts`
- **Implementation**:
  1. Replace stale "one human action" and current-main re-publish claims with the two PR merges and
     required `vX.Y.Z` recovery input.
  2. Document that a normal release has no Actions approval or dispatch, while exceptional recovery
     is explicitly tag-based in Actions after a GitHub Release already exists.
  3. Record the branch restriction, App permission ceiling, Actions allowlist/SHA setting, two tag
     rulesets, immutable-release setting, environment branch policy, organization 2FA and npm
     Trusted Publisher fields.
  4. Document read-before-write/read-after-write audit commands and fail-closed outcomes without
     printing tokens, App keys or full credential material.
  5. Explain why privileged external-state checks are operator-run rather than backed by a standing
     administrator token in the publish workflow.
  6. For invalid retry tag, artifact mismatch, existing-version drift and wrong-identity provenance,
     document diagnostics that name the problem, likely cause and safe corrective action without
     exposing credentials. A provenance failure after immutable publication is an incident requiring
     investigation and a new version, never an overwrite attempt.
- **Verification gate**: Workflow behavior and documentation agree on human action count, retry
  input, environment reviewer absence and publish command; `pnpm sync:docs`,
  `pnpm decisions:check`, targeted workflow tests and `git diff --check` pass.
- **Expected commits**:
  - `docs(release): document the hardened two-merge chain`
- **Notes**: Do not turn observed live settings into a generated build input or timestamped artifact.

### Step 7 - Seal the implementation before rollout

- **Goal**: Obtain fresh, independent evidence that the code is safe before any broad GitHub policy
  is tightened or any release is cut.
- **Depends on**: Step 6
- **TDD mode**: souple
- **Files**: only fixes justified by failing gates or review findings.
- **Implementation**:
  1. Run the targeted release/workflow suites, lint, typecheck, build, publish-safety and full
     `pnpm verify` on a machine without the current severe memory pressure.
  2. Run strict code review and security review over the complete diff, with special attention to
     expression injection, shell quoting, artifact substitution, race conditions and permission
     inheritance.
  3. Regenerate only versioned derived artifacts demanded by repository gates; do not touch the
     lockfile or versions.
  4. Push the implementation branch, open/update one PR to `develop`, and wait for the five required
     checks on the current head.
- **Verification gate**: All required checks are green and current; `pnpm verify` is green with fresh
  evidence; strict review has no unresolved blocker; the PR targets `develop` and has no release or
  version edit outside release-please.
- **Expected commits**:
  - only scoped `fix:` commits for evidence-backed review findings, if any
- **Notes**: The earlier local run under 17.4 GB of swap is explicitly non-probative and cannot be
  reused as green or red evidence.

### Checkpoint A - implementation PR to `develop`

Stop after Step 7. The user reviews and merges the implementation PR into `develop`. This is a code
integration gate, not one of the two actions in a release cycle. Do not merge it on the user's behalf.

After that merge, wait for the promotion workflow to create/update `develop -> main`; verify its head
is current and its five checks are green. Read the promotion check's complete commit/PR accounting
and confirm every incoming commit is either attached to a human-merged PR targeting `develop` or the
canonical automatic back-merge; any unexplained commit, non-human merge actor or noncanonical
auto-merge event blocks the
checkpoint. The user performs **release action 1** by merging that promotion PR.

### Step 8 - Tighten live GitHub and npm controls on the promoted code

- **Goal**: Activate the external controls only after the compatible workflows are on `main`, and
  prove every setting by reading it back before the release PR may merge.
- **Depends on**: Checkpoint A and the human promotion merge
- **TDD mode**: souple
- **Files**: none unless read-after-write exposes a documentation defect.
- **Implementation**:
  1. Confirm Step 1's `main` restriction still names only `folpe`; confirm `develop` and `main` retain
     the same five strict required checks and protection flags.
  2. Set repository Actions to `allowed_actions: selected` and `sha_pinning_required: true`; allow
     GitHub-owned actions, disallow the blanket verified-publisher category, and allow only
     `pnpm/action-setup@*` plus `googleapis/release-please-action@*` as public patterns.
  3. Create one active `v*` tag ruleset with a `creation` rule and the repository Release App
     Integration as its sole `always` bypass actor. Create a second active `v*` ruleset with `update`
     (`update_allows_fetch_and_merge: false`) and `deletion` rules and no bypass actor. This lets the
     App create release tags but lets nobody move or delete them.
  4. Keep repository auto-merge enabled. Enable secret scanning, push protection and vulnerability
     alerts. Enable repository immutable releases so every future published release locks its tag and
     assets and receives a release attestation. Confirm the `npm-publish` environment accepts only
     `main`, has no reviewer and cannot be admin-bypassed.
  5. Read the installed Release App through the repository installation API and require selected-
     repository mode plus only `Contents`/`Pull requests` write permissions and implicit metadata
     read. Enumerate every installation repository with pagination and require the exact singleton
     set `{voidcorp-core/void-harness}`; `total_count: 1` without full enumeration is insufficient. A
     mismatch stops rollout and is corrected by the human App owner, never by handling its key.
  6. Through an authenticated npm surface, require Trusted Publisher organization
     `voidcorp-core`, repository `void-harness`, workflow `release.yml`, environment `npm-publish`,
     publish-only permission, and no legacy/granular publish token. Account 2FA and token removal are
     performed by the human owner.
  7. The human owner enables organization 2FA with secure methods only after confirming all members,
     outside collaborators and service accounts comply. This one-time Settings action is not an
     Actions deployment approval.
- **Verification gate**: Read-after-write API responses exactly match every GitHub control; the
  authenticated npm view matches all Trusted Publisher fields; user confirms secure 2FA/token state;
  any unavailable or partial observation blocks Checkpoint B. No production version is published.
- **Expected commits**: none; external API state, audit logs and the checkpoint report are evidence.
- **Notes**: Never relax a protection to recover from a failed write. Roll back only by restoring the
  captured prior value, and only if the new setting itself blocks safe recovery.

### Checkpoint B - release PR before publication

Stop after Step 8. The user reviews the release-please PR's version and changelog after its current
five checks pass. Confirm no workflow is waiting for an environment approval and no automatic merge
is armed on this PR.

The user performs **release action 2** by merging the release PR. That merge is the publication
authorization.

### Step 9 - Observe the production proof and automatic closure

- **Goal**: Prove the real release, npm attestation and automatic back-merge satisfy the contract
  before declaring the rollout complete.
- **Depends on**: Checkpoint B and the human release merge
- **TDD mode**: souple
- **Files**: none unless the observation exposes a defect that requires a new fix/release cycle.
- **Implementation**:
  1. Verify release-please created the expected immutable `vX.Y.Z` tag and GitHub Release at the merge
     commit, and that GitHub exposes the release as immutable with its release attestation.
  2. Verify `validate-release` completed without OIDC and `publish` consumed its artifact without
     checkout, install, build or repository scripts.
  3. Compare the workflow integrity manifest with `npm view voidharness@X.Y.Z dist --json`; require
     exact `dist.integrity`, then retain the successful `verify-publication` evidence binding the
     signed subject to the expected repository, workflow, ref, workflow head, run and attempt, while
     the artifact manifest binds the same bytes to the distinct release commit.
  4. Verify one `main -> develop` back-merge PR used the canonical bot branch, armed native
     auto-merge, received the five current checks and merged automatically only after green.
  5. Compare `main` and `develop` trees for released version/changelog content and confirm no other PR
     used auto-merge.
  6. If npm failed transiently, dispatch `release.yml` from `main` with the immutable tag. Do not move
     the tag, repair its tree, bypass a control or publish from a laptop.
- **Verification gate**: npm integrity/provenance, GitHub tag/release identity and the completed
  back-merge are all observed. Any missing evidence reports degraded/blocking status; it is never
  inferred from a green workflow summary.
- **Expected commits**: none for success; a defect starts a new TDD fix commit and new release rather
  than mutating the existing tag.
- **Notes**: Set this plan to `done` only after the production proof and back-merge both complete.

## Review checkpoints

- **Checkpoint A, after Step 7**: user reviews and merges the implementation PR, then separately
  performs release action 1 on the promotion PR.
- **Checkpoint B, after Step 8**: user reviews external-control evidence plus the version/changelog,
  then performs release action 2 on the release PR.

No normal-path checkpoint sends the user to Actions to approve a deployment.

## Verification matrix

| Invariant | Local/CI evidence | Live evidence |
|---|---|---|
| Only `folpe` crosses `main` | workflow cannot self-merge human PRs | branch restrictions users/apps/teams |
| Noncanonical auto-merge is blocked | source invariant plus required-check state test | exact PR head/base and complete promotion audit |
| External actions are immutable | full-SHA invariant | Actions `sha_pinning_required: true` |
| App scope is bounded | explicit token scope/permissions | paginated exact-singleton installation response |
| Release tree is exact | tag/ref/version tests | tag SHA, GitHub Release, main ancestry |
| Artifact is unchanged | corruption/integrity tests | exact artifact ID, service digest and npm integrity |
| Registry provenance is exact | wrong subject/source/workflow/run fixtures | npm signature plus GitHub identity verification |
| Release metadata is immutable | tag/ruleset contract | immutable flag and GitHub release attestation |
| OIDC is minimal | job permission and command tests | run job graph and environment |
| Retry is safe | missing/moved/drift cases | tag-based dispatch and registry state |
| Two human release actions | workflow/docs assertions | promotion merge plus release merge |
| `develop` returns current | back-merge identity tests | green native auto-merge and tree comparison |

## Official implementation references

- GitHub branch protection API:
  https://docs.github.com/en/rest/branches/branch-protection
- GitHub Actions permissions and SHA pinning API:
  https://docs.github.com/en/rest/actions/permissions
- GitHub job contexts for a reusable workflow's repository and SHA:
  https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- GitHub pull-request auto-merge event triggers and timeline items:
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request
  https://docs.github.com/en/graphql/reference/unions#pullrequesttimelineitems
- GitHub repository tag rulesets API:
  https://docs.github.com/en/rest/repos/rules
- GitHub immutable releases:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases
- GitHub organization 2FA requirements:
  https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
- npm Trusted Publishers:
  https://docs.npmjs.com/trusted-publishers/
- npm trusted publisher inspection:
  https://docs.npmjs.com/cli/v11/commands/npm-trust/
- npm local tarball publication and immutable versions:
  https://docs.npmjs.com/cli/v11/commands/npm-publish/
- npm lifecycle scripts and `ignore-scripts`:
  https://docs.npmjs.com/cli/v11/using-npm/scripts/
  https://docs.npmjs.com/using-npm/config/#ignore-scripts
- npm signature verification and verified bundle output:
  https://docs.npmjs.com/cli/v11/commands/npm-audit/#audit-signatures
- GitHub CLI attestation identity/source constraints:
  https://cli.github.com/manual/gh_attestation_verify

## Plan review (`all`)

### Scope gate

This plan touches more than eight files plus live GitHub/npm settings, so size is a risk signal. The
blast radius is accepted because repository-wide SHA enforcement necessarily covers every effective
workflow, while the release boundary necessarily spans branch protection, tag/release controls and
npm. It introduces no new service, dependency, credential or user interface. Version changes,
lockfile edits, secret handling and unrelated organization policy remain out of scope.

### Lens verdicts

- **CEO (`REDUCTION`)**: OK. The plan keeps the approved two-merge outcome and adds no release
  ceremony. Disabling auto-merge, retaining the environment reviewer and keeping one OIDC build job
  remain explicitly rejected alternatives.
- **Design**: skipped. No end-user visual surface changes.
- **Engineering**: CLEARED after the local and independent P1 tasks below were folded into Steps 3
  through 5. Happy, absent, corrupt, stale, concurrent and upstream-error paths have observable
  gates; the unscopable App authority on `develop` is explicit rather than overstated.
- **DevEx**: CLEARED. Step 6 makes the normal path, exceptional recovery and four critical error
  diagnostics discoverable without requiring a standing administrator credential.

### Implementation Tasks

- **P1**: Bind the cross-job artifact to GitHub's immutable artifact ID, service digest, workflow run
  and workflow head SHA before trusting its internal checksum manifest; bind the tarball's distinct
  release SHA inside that verified manifest. Folded into Steps 4 and 5.
- **P1**: Treat tag and GitHub context values as untrusted shell input; pass through environment,
  validate a closed grammar, quote expansions and use option terminators. Folded into Step 4.
- **P2**: Require npm 11.5.1+ and `--ignore-scripts` so publishing a local tarball cannot execute its
  lifecycle hooks inside the OIDC job. Folded into Step 5.
- **P2**: Enable GitHub immutable releases and verify the resulting release attestation so release
  assets, not only tags, become immutable. Folded into Steps 8 and 9.
- **P1, independent security review**: The source invariant alone could not make noncanonical
  auto-merge impossible because GitHub App repository permissions are not scoped by head/base.
  Disposition: corrected the claim; added required-check state enforcement, full promotion commit/PR
  accounting and explicit containment at the human-only `main` boundary in Step 3 and Checkpoint A.
- **P1, independent security review**: Registry integrity plus a SLSA predicate label did not bind
  the signed subject or builder identity. Disposition: added a non-OIDC verification job using npm's
  cryptographic signature verifier, GitHub CLI identity constraints and negative subject/repository/
  workflow/ref/commit/run fixtures in Step 5.
- **P2, independent security review**: Selected-repository mode did not prove the App installation
  was limited to this repository. Disposition: Step 8 now paginates the installation repository list
  and requires the exact singleton set.
- **P1, independent architecture/security/QA reviews**: recovery collapsed the immutable release
  commit, current workflow head and original publishing invocation into one identity, making both
  old-tag recovery and existing-version retries impossible. Disposition: the artifact manifest owns
  release-tree identity; new publication provenance must match the current execution; an existing
  version derives its original canonical producer from npm-verified provenance and then proves that
  same identity independently with GitHub CLI.
- **P1, independent QA review**: source-string tests did not execute registry, auto-merge, YAML or
  artifact failure paths and the OIDC uniqueness assertion covered only `release.yml` job grants.
  Disposition: added executable registry, auto-merge and exact inline artifact-verifier fixtures;
  strict YAML parsing; Bash and Node heredoc syntax checks; and a repository-wide effective-
  permissions assertion that rejects workflow-level OIDC inheritance and names `release.yml/publish`
  as the sole grant.
- **P2, independent security review**: npm's `E404` classifier read the success stream after a
  failed command, while the Release App token request inherited its installation ceiling.
  Disposition: one tested inline classifier now consumes exit status plus both captured streams and
  fails malformed/conflicting/authorization cases; every Release App token request explicitly names
  this repository and its required Contents/Pull requests permissions.
- **P2, local source-driven review**: a major-only npm guard accepted clients older than the 11.5.1
  Trusted Publishing floor. Disposition: the minimal OIDC job now compares the complete stable
  semantic version and fails before publication.

**Final verdict**: CLEARED after disposition. No P1 remains unresolved. The residual App authority
on `develop` is accepted and contained, not described as server-enforced.

## Resume point

**Next step**: Checkpoint A. Review and merge implementation PR #272 into `develop` only after its
five required checks are green on the current head. The merge remains human.

**Completed**:

- Approved spec: `docs/specs/2026-08-21-release-chain-hardening.md`
- Accepted ADR: `adr:7ead6842-9674-49b5-ac85-1d182da4c5bf`
- Steps 1 through 7, including the human-only `main` restriction, immutable workflow dependencies,
  bounded promotion/back-merge identity, no-OIDC artifact validation, minimal OIDC publication,
  producer-aware public provenance verification and the operator contract.
- Fresh complete `pnpm verify` evidence and independent architecture, security and QA reviews with
  every implementation finding disposed.
- Implementation PR #272 targets `develop`.

**Pending**:

- Checkpoint A, Step 8, Checkpoint B and Step 9 production proof.
