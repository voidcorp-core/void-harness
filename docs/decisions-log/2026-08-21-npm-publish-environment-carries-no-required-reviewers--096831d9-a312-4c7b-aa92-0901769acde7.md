---
schemaVersion: 1
id: "adr:096831d9-a312-4c7b-aa92-0901769acde7"
createdAt: "2026-08-21T09:37:13.845Z"
title: "The npm-publish environment carries no required reviewers"
status: accepted
deciders: []
supersedes: []
---

# The npm-publish environment carries no required reviewers

## Context

Publishing `voidharness` to npm ran behind three human actions, in this order:
merge the promotion pull request (`develop` into `main`), merge the release pull
request that release-please opens, then approve a deployment to the `npm-publish`
GitHub environment.

The first two are buttons on a pull request page, where the person deciding is
already reading. The third is not. A pending deployment review appears only on the
run page of the `release` workflow, under a *Review deployments* banner in the
Actions tab. It is not shown in the pull request and not in Settings, which the
release documentation had to spell out under a heading reading "Where the approval
actually is, because it is not obvious and it stops the release until you find it".

That third action also asked no new question. Merging the release pull request is
where the version bump and the changelog are read; the approval arrives seconds
later and re-asks the same thing, from a page nobody is already on.

The environment itself is load-bearing for a different reason. An npm trusted
publisher matches organisation, repository, workflow filename and an optional
environment -- it has no branch or ref field. Naming `npm-publish` on the package's
trusted publisher is what stops a modified copy of `release.yml`, on another
branch, from being accepted by the registry. The environment's deployment branch
policy allowing `main` only is the matching half on GitHub's side.

Required reviewers is a separate protection rule on that environment. Removing it
leaves the environment, its name, and its branch policy exactly as they were.

## Decision

The `npm-publish` environment keeps its name and its `main`-only deployment branch
policy, and carries no required reviewers: merging the release pull request is the
single deliberate act that publishes.

## Consequences

Positive:

- The release cycle is two buttons, both on pages the decider is already reading.
  No visit to the Actions tab on the normal path.
- The workflow's own header, which claimed "exactly ONE deliberate human action:
  merging the release PR", becomes true. It was not while a second click existed.
- The gate that remains is the one carrying information: the release pull request
  shows the version bump and the changelog being shipped.

Negative:

- Write access to `main` now reaches npm without a further human. That access
  already allowed editing `release.yml`, so the reviewer bought one speed bump on
  a route that was open either way -- but the speed bump is gone.
- Nothing on GitHub now pauses a publish once a release is cut. Recovering from a
  release merged by mistake means unpublishing or superseding on npm, not
  cancelling a waiting job.

## Alternatives considered

- **Keep the reviewer and click through the notification.** GitHub emails a
  deployment review request with a direct link, mobile included. Zero change, one
  click. Rejected: it is the friction being removed, relocated to an inbox, and it
  still leaves the release stalled until the mail is read.
- **Move the gate to the Releases page** (`on: release: published`, release-please
  cutting a draft the human publishes). A button in the interface rather than the
  Actions tab, but it adds a page and a draft state to preserve a confirmation
  that already duplicates the release merge. More machinery for the same outcome.
- **A `workflow_dispatch` publish button.** Rejected outright: dispatch lives in
  the Actions tab by construction, which is the thing being avoided.
- **Remove the environment entirely.** Rejected: it would break the npm-side lock.
  The trusted publisher names `npm-publish`, and without it the registry accepts
  any run of a file with that name, from any branch.

## Reversal cost

Low. Re-adding a required reviewer is a checkbox on Settings -> Environments ->
`npm-publish`, with no code change and no npm change. The workflow and the
documentation would need their claims restored, which is a single edit each.
