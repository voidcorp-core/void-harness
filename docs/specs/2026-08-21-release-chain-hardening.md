---
title: Release chain hardening with PR-native HITL
date: 2026-08-21
status: approved
author: Florent Pellegrin + Codex
ticket:
related:
  - docs/RELEASING.md
  - docs/decisions-log/2026-08-18-auto-merge-boundary-back-merge--911e4259-d82c-4039-a440-3e611d5c6f3b.md
  - docs/decisions-log/2026-08-21-npm-publish-environment-carries-no-required-reviewers--096831d9-a312-4c7b-aa92-0901769acde7.md
  - docs/decisions-log/2026-08-21-enforce-pr-native-release-authority--7ead6842-9674-49b5-ac85-1d182da4c5bf.md
---

# Release chain hardening with PR-native HITL

## Problem

The release chain has the right product boundary but does not yet enforce every part of it at the
right technical boundary.

The desired operator experience is explicit:

- a normal release requires exactly two deliberate human actions;
- both actions are pull-request merges, where the maintainer already reads the change;
- no routine approval lives in the Actions UI;
- the release-please version output returns to `develop` automatically after publication;
- no automation credential can cross the `main` release boundary by itself.

The current repository already implements promotion, release-please, OIDC publication and an
automatic back-merge. The missing hardening is that `main` currently requires zero approvals and
does not restrict its push actors, while the Release App has `Contents: write`. A GitHub App
installation token with that permission can call the pull-request merge API. Human-only release
merging is therefore a convention, not yet a server-enforced invariant.

The publication job also grants `id-token: write` to the same job that installs dependencies and
runs repository scripts. GitHub exposes OIDC request credentials to processes in that job. The
publish capability must exist only in a minimal job that consumes an already validated tarball.

## Verified current state

Observed on 2026-08-21 through the GitHub API and the repository source:

- `develop` and `main` require the same five strict checks;
- force-push and deletion are disabled on both branches;
- branch protection applies to administrators;
- `main` requires zero approving reviews and has no push-actor restriction;
- the organization has one member, `folpe`;
- repository auto-merge is enabled;
- the `npm-publish` environment allows only branch `main`, has no required reviewer and cannot be
  bypassed by administrators;
- Actions accepts all actions and does not require full-SHA pinning;
- organization-level 2FA enforcement is disabled;
- the Release App is documented as repository-scoped with `Contents` and `Pull requests` read and
  write;
- the latest `voidharness@3.3.0` release completed through the OIDC publish job and carries npm
  provenance metadata;
- the npm Trusted Publisher fields could not be read through `npm trust list` because the local npm
  CLI is not authenticated. Their exact values remain a rollout precondition, not an assumed fact.

## Decision

Keep the two-branch release model and its two PR-native human gates. Harden the identity boundary on
`main`, retain repository auto-merge for the already approved back-merge only, and split validation
from OIDC publication.

The two human decisions remain distinct:

1. merge the promotion PR to say which behavior may enter the release branch;
2. merge the release PR to approve the computed version and changelog and publish it.

The automatic back-merge is not a third decision. It carries only release output that the second
human action already approved.

After this spec is approved, the decision is recorded in a new collision-free ADR before
implementation. That ADR complements the existing back-merge and reviewer-boundary records; it does
not edit their accepted history.

## Architecture

```text
work PRs -> develop
                |
                v
      promotion PR: develop -> main
             HUMAN MERGE 1
                |
                v
      release-please computes version + changelog
                |
                v
          release PR -> main
             HUMAN MERGE 2
                |
                +--> tag + GitHub Release
                +--> validate exact release tree without OIDC
                +--> publish validated tarball with OIDC
                |
                v
        back-merge PR: main -> develop
             AUTO-MERGE AFTER CI
```

### Branch responsibilities

`develop` is the integration branch. It remains protected by the complete required-check set. The
Release App may arm native auto-merge only for the canonical back-merge PR from
`chore/back-merge-main` to `develop`. The required `enforce` check rejects an armed auto-merge on
every other head/base pair and the promotion gate rejects unexplained commits. GitHub does not scope
a repository App's `Contents: write` permission to one PR or branch, so this is a detect-and-block
control on `develop`, not a server-side actor boundary. The human promotion diff and the actor
restriction on `main` contain that residual risk before publication.

`main` is the publication boundary. Branch restrictions allow only `folpe` to push to it, including
through a PR merge. No team or GitHub App is on the allowlist. Required pull requests, strict checks,
conversation resolution, admin enforcement, and the force-push/deletion bans remain active.

Repository auto-merge stays enabled because the canonical back-merge needs it. The `main` actor
restriction prevents that repository-wide capability from giving the Release App a path across the
release boundary.

### Automation identity

The Release App remains installed on this repository only. The installation repository list, read
with pagination, must contain exactly `voidcorp-core/void-harness`. Its allowed permissions are
`Contents` and `Pull requests` read/write, plus GitHub's implicit metadata read, which release-please,
tag/release creation and the back-merge require. It receives no `Actions`, `Administration`,
`Environments`, `Secrets` or organization permission.

All external actions in promotion, release and back-merge workflows are pinned to full commit SHAs.
After every workflow on the protected branches is compatible, repository Actions policy requires
full-SHA pinning and limits allowed publishers to the explicitly used action owners.

## State flow

### Normal release

1. A work PR reaches `develop` only with every required check successful on an up-to-date base.
2. `promotion.yml` idempotently maintains one `develop` to `main` PR. It never arms auto-merge.
3. `folpe` merges the promotion PR. Promotion alone never publishes.
4. On the `main` push, release-please creates or updates one release PR using the Release App.
5. The release PR receives the same five strict checks.
6. `folpe` reads the version and changelog and merges the release PR.
7. Release-please creates immutable release metadata: `vX.Y.Z` and the GitHub Release.
8. The release workflow validates and packs the exact release commit without OIDC.
9. A minimal publish job verifies and publishes that exact tarball through npm Trusted Publishing.
10. A post-publication job without OIDC cryptographically verifies the registry provenance and
    binds it to the tarball, repository, workflow, ref, workflow head commit and workflow run. The
    verified artifact manifest separately binds the tarball to the immutable release commit.
11. `back-merge.yml` opens or updates the canonical `main` to `develop` PR and arms native
    auto-merge. Strict checks run again before GitHub merges it.

### Back-merge concurrency

Promotion merges usually leave `main` and `develop` with equal content, so the first back-merge probe
does nothing. The release PR later changes versioned files and `CHANGELOG.md`, which creates the real
back-merge.

The workflow uses one concurrency group for the canonical bot branch. A newer `main` event updates
the same PR and invalidates its previous checks. It never creates parallel back-merge PRs. A content
conflict stops the workflow for a human; automation never selects a side or force-resolves generated
files.

## Publication boundary

### Validation job: no OIDC

`validate-release` runs only for a newly created release or a validated retry target. It:

1. resolves the immutable release tag and commit;
2. checks out that exact commit;
3. verifies tag, package and manifest versions agree;
4. installs with the frozen lockfile;
5. runs build, typecheck, tests, version checks and publish-safety checks;
6. creates the final `voidharness-X.Y.Z.tgz` once;
7. records its SHA-256 and npm-style SHA-512 integrity;
8. uploads the tarball and integrity manifest with short retention, exposing the immutable artifact
   ID and GitHub-computed digest as job outputs.

This job has `contents: read` and no `id-token` permission.

### Publish job: OIDC, no repository execution

`publish` is the only job with `id-token: write`. It:

1. queries the exact artifact ID through GitHub's artifact API and requires its service digest,
   workflow run and workflow head SHA to match the current run before downloading it with SHA-pinned
   actions; the verified inner manifest separately binds the tarball to the resolved release SHA;
2. recomputes SHA-256 and SHA-512 and fails on any mismatch;
3. verifies the tarball name and embedded package name/version;
4. executes no install, build, lifecycle hook or repository script;
5. asserts npm 11.5.1 or newer, then runs
   `npm publish ./voidharness-X.Y.Z.tgz --access public --ignore-scripts`;
6. polls for the registry integrity and the presence of its attestation endpoint after publication.

The job uses GitHub-hosted runners and the `npm-publish` environment. Its GitHub token has only
`contents: read`, `actions: read` and `id-token: write`; the Release App gains no Actions permission.
npm accepts a local gzipped tarball as the package specification for `npm publish`.

### Existing-version idempotency

Before publishing, the job queries `voidharness@X.Y.Z`:

- if a structured npm `E404` is read from the captured error stream, it publishes;
- if present with the exact expected integrity and an attestation candidate, it skips publication
  and delegates the success decision to the same post-publication verifier;
- if present with different integrity or missing provenance after bounded registry retries, it stops
  with a critical integrity failure.

Malformed or conflicting stdout/stderr and authorization errors fail immediately; only an explicit
bounded set of network and registry-server errors is retried.

It never attempts to overwrite a published version, which npm does not permit.

### Post-publication provenance verification: no OIDC

`verify-publication` always runs after a new publish or an existing-version candidate. It has no
`id-token: write` and no package credential. In an isolated temporary project, with lifecycle
scripts disabled, it downloads the exact registry tarball and uses an exact, tested npm CLI release
at version 11.12.1 with
`npm audit signatures --json --include-attestations` to verify registry signatures and Sigstore
bundles. It then passes the verified provenance bundle and tarball to GitHub CLI's attestation
verifier with exact repository, signer workflow, source ref and source digest constraints.

A pure contract parser additionally requires the signed statement's subject name and digest, build
workflow path, `refs/heads/main`, workflow head commit, workflow run ID and attempt to match the
canonical producer execution. For a new publication that producer must be the current workflow
head, run and attempt. For an existing-version retry it is derived from the npm-verified statement
and then independently constrained by GitHub CLI to the same repository, workflow, `main` ref, head
and GitHub-hosted runner before the final parser accepts it. The artifact manifest independently
requires the tarball's release commit to match the immutable tag. Wrong subject, repository,
workflow, ref, workflow head, release commit or run is blocking. The workflow is successful,
including on an existing-version retry, only after this job passes. The verifier never claims that
provenance proves the package is benign; it proves which signed workflow execution produced the
observed bytes.

## Recovery

The normal path has no Actions approval or publish button.

An exceptional retry is allowed only after a tag/release exists but npm publication failed. The
manual input is a required `vX.Y.Z` tag, never an arbitrary SHA. The recovery path verifies:

- the tag exists and has not moved;
- a matching published GitHub Release exists;
- the tag commit is reachable from protected `main`;
- every versioned manifest matches `X.Y.Z`;
- npm does not already contain different bytes for that version.

It then reuses the same validation-artifact-publication pipeline. A release tree that fails its own
validation is never repaired under the existing tag; a new fix and release are required.

## Security controls

### GitHub

- `main` push actors: `folpe` only; no App or team bypass.
- `develop` and `main`: strict required checks, required PR, conversation resolution, admin
  enforcement, no force-push, no deletion.
- auto-merge remains repository-enabled; a source invariant and the required `enforce` check reject
  its use outside the exact back-merge head/base pair, while promotion audits the complete incoming
  commit/PR set, merge actors and auto-merge timelines. A compromised App still has generic write
  authority on `develop`; the `main`
  restriction and the human promotion review are the server-side publication boundary.
- `v*` tag rules prohibit update and deletion and allow creation only through the Release App's
  release path.
- GitHub immutable releases are enabled so a published release locks its tag and assets and receives
  a release attestation.
- organization 2FA is required with secure methods; recovery material stays outside the repository.
- secret scanning, push protection and Dependabot security alerts are enabled for the public repo.
- every external action is full-SHA pinned and the repository policy enforces the rule.

### npm

- Trusted Publisher matches `voidcorp-core/void-harness`, `release.yml`, environment `npm-publish`,
  and grants `npm publish` only.
- `npm-publish` accepts only `main`, has no Actions reviewer and cannot be admin-bypassed.
- the npm owner account uses 2FA;
- legacy and granular automation tokens capable of publishing are absent or revoked;
- every published version must expose registry integrity and provenance.

## Failure semantics

| Failure | Required behavior |
|---|---|
| Required check red, missing or pending | No merge and no publication |
| PR branch behind its base | Update, rerun checks, then reconsider |
| Promotion or release PR conflict | Human-owned resolution |
| Back-merge content conflict | Stop; never resolve automatically |
| Tag/version/manifest mismatch | Block before artifact upload |
| Artifact digest mismatch | Block before requesting OIDC |
| npm transient failure | Bounded retry, then explicit tag-based recovery |
| Existing version with matching integrity | Candidate; success only after provenance verification |
| Existing version with different integrity | Critical block |
| Invalid or wrong-identity provenance | Workflow fails after publication; never overwrite the version |
| Missing or stale external protection | Privileged rollout/release preflight fails closed |

## Verification strategy

Implementation uses strict TDD for workflow parsers, integrity helpers, source invariants and retry
validation. External settings use read-after-write evidence and are never assumed from a successful
workflow alone.

The normal publish job deliberately carries no repository-administration or organization credential,
so it cannot query every external control without weakening the boundary it is meant to protect. A
maintainer runs the privileged external-control preflight before rollout, before the first production
proof release, and during periodic audits. Missing access or incomplete evidence blocks rollout and
audit completion; it never causes a standing administrator token to be added to the workflow.

Required evidence:

- YAML parses and every external `uses:` reference is a full SHA;
- only the canonical back-merge source may contain native auto-merge;
- the required check rejects auto-merge on promotion and release PRs, and the promotion evidence
  contains no unexplained direct commit, non-human merge actor or noncanonical auto-merge event;
- exact head/base/source constraints hold for the back-merge;
- artifact corruption is rejected before the OIDC-capable step;
- artifact ID and GitHub service digest survive the job boundary and are verified before local
  checksums;
- retry rejects missing, moved, non-main and version-mismatched tags;
- an existing registry version succeeds only after the same cryptographic integrity/provenance
  verifier binds its bytes, identity and run;
- the complete test suite and `pnpm verify` pass;
- live branch, environment, App, Actions, tag and organization settings match this spec;
- the npm Trusted Publisher is verified through an authenticated npm surface;
- the first real release shows provenance, matching integrity and a completed automatic back-merge.

No test publishes a disposable version to the production package. The first real release is the
end-to-end production proof; any incomplete observation is reported as degraded, never green.

## Rollout order

1. Restrict `main` push actors to `folpe` before removing any other control.
2. Add failing invariant and integrity tests.
3. Pin every workflow action by full SHA.
4. Add concurrency and exact identity constraints to promotion/back-merge workflows.
5. Split release validation, artifact production and OIDC publication.
6. Promote the implementation to `main` through the existing human gates.
7. Enable the repository full-SHA policy and selected-action allowlist.
8. Enable tag rules, immutable releases, organization secure 2FA, secret scanning and push
   protection.
9. Verify the npm Trusted Publisher and remove obsolete publish tokens.
10. Observe one real release and its automatic back-merge before declaring rollout complete.

Settings only tighten automatically. A failed rollout never relaxes branch protection, grants an App
new permission or restores token-based publication as a workaround.

## Acceptance criteria

1. A routine release requires exactly two human merges, both in pull requests.
2. No routine approval or publish action occurs in the Actions UI.
3. Only `folpe` can merge into `main`; the Release App cannot.
4. Required checks reject noncanonical auto-merge and promotion evidence accounts for every incoming
   commit; `main` remains human-only even if the Release App is compromised.
5. `develop` returns automatically to the released versioned content of `main` after green checks.
6. No dependency or repository script executes in a job with `id-token: write`.
7. npm receives exactly the tarball validated by the non-OIDC job.
8. Wrong refs, stale checks, conflicts, tag drift and integrity drift fail closed.
9. A successful workflow has cryptographically verified npm provenance and integrity matching the
   exact repository, workflow, ref, workflow head, release commit and run evidence.
10. The matching GitHub Release is immutable and carries a release attestation.

## Alternatives rejected

### Disable repository auto-merge

Rejected because the back-merge is deliberate automation of already approved release output. Turning
off the repository capability would reintroduce a third human merge and let `develop` drift.

### Require an `npm-publish` environment reviewer

Rejected because it asks the same release question after the release PR merge, but hides the button
in the Actions UI. The security property moves to the `main` actor restriction, where it directly
prevents the Release App from merging.

### Auto-merge the release PR

Rejected because that PR is the final human decision over version and changelog and directly causes
publication.

### Run release-please on `develop`

Rejected because release-please would prepare release state before the promotion decision and would
blur which merge authorizes publication. The existing automatic back-merge solves version drift
without moving the release boundary.

### Keep build and publish in one OIDC-capable job

Rejected because every process in an `id-token: write` job can request an OIDC token. Validation and
dependency execution do not need publication authority.

## Official references

- GitHub branch restrictions and protected-branch merge enforcement:
  https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub native auto-merge:
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository
- GitHub App token permission for merging pull requests:
  https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request
- GitHub OIDC token access and `id-token: write`:
  https://docs.github.com/en/actions/reference/security/oidc
- GitHub artifact digest validation:
  https://docs.github.com/en/actions/tutorials/store-and-share-data#validating-artifacts
- GitHub organization secure 2FA:
  https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
- GitHub full-SHA action pinning:
  https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions
- GitHub immutable releases:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases
- npm Trusted Publishing:
  https://docs.npmjs.com/trusted-publishers/
- npm Trusted Publisher permissions:
  https://docs.npmjs.com/cli/v11/commands/npm-trust/
- npm tarball publication and immutable versions:
  https://docs.npmjs.com/cli/v11/commands/npm-publish/
- npm lifecycle scripts and the `ignore-scripts` control:
  https://docs.npmjs.com/cli/v11/using-npm/scripts/
  https://docs.npmjs.com/using-npm/config/#ignore-scripts
- npm signature and provenance bundle verification:
  https://docs.npmjs.com/cli/v11/commands/npm-audit/#audit-signatures
- GitHub CLI attestation identity and source verification:
  https://cli.github.com/manual/gh_attestation_verify
