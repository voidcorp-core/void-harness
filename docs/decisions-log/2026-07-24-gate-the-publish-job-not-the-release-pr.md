---
date: 2026-07-24
title: "The release gate lives in the publish job, not on the release PR"
---

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
