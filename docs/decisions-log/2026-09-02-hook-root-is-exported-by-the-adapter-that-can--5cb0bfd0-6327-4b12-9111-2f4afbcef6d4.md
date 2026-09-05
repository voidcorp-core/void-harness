---
schemaVersion: 1
id: "adr:5cb0bfd0-6327-4b12-9111-2f4afbcef6d4"
createdAt: "2026-09-02T21:53:16.222Z"
title: "The hook root a worker writes to is exported by the adapter that can"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The hook root a worker writes to is exported by the adapter that can

## Context

This completes one premise of the record "Runtime state from a worktree belongs to the
repository" (`adr:17317198-fbc2-4bb5-8fda-2e1e4f7ac9bb`), whose decision stands unchanged. That
record moved `.void/machine/` reads and writes to `installRoot` from a linked worktree, and named
the half it could not close in code: "Under a Claude worktree subagent `CLAUDE_PROJECT_DIR` is
the session's project, the main checkout; under Codex native subagents neither variable is set,
and that half of the telemetry lands in the worktree until the adapter exports the root."

The hooks resolve their root the same way in both shells and in the runner: `VOID_PROJECT_ROOT`,
else `CLAUDE_PROJECT_DIR`, else the git toplevel discovered from the working directory
(`packages/core/hooks/_hooklib.sh`, `activation-meter.sh`, `packages/hook-runner/src/cli.ts`,
`record.ts`). A worker runs in a linked worktree, so the discovered toplevel is the worktree, and
the reconciler removes that worktree at the end of the run. The run's hook telemetry is deleted
before anyone reads the pull request, while the same run's mission journal sits in the main
checkout: one run, two halves, one gone.

The two runtimes are not symmetrical, and that is the whole of it. Claude fans workers out through
the Workflow tool, whose `agent()` primitive takes `label`, `phase`, `schema`, `model`, `effort`,
`isolation` and `agentType`, and no environment option; the script has no filesystem or Node API
either. It also needs none: the runtime already puts the session's project, the main checkout, in
`CLAUDE_PROJECT_DIR`, and every subagent inherits it. Codex fans workers out through native
subagents, where the adapter chooses the child's environment and nothing sets either variable.

## Decision

The runtime adapter exports `VOID_PROJECT_ROOT`, set to the installation root, into the process
environment of every worker it spawns, wherever the spawning primitive accepts an environment.
That is the Codex adapter today. The Claude adapter sets nothing, because it cannot and does not
need to, and it records both halves of that sentence where the code is rather than leaving the
absence to read as an oversight.

A prompt is never the mechanism. An `export` a worker runs inside a shell call does not reach the
process the runtime launches hooks in, so the brief cannot carry this even as a fallback.

## Consequences

Positive:

- A Codex run's hook telemetry survives the teardown of the worktree it was produced in, next to
  the mission journal of the same run. The premise the earlier record could only state for one
  runtime now holds for both.
- The asymmetry is written down where each adapter is read, so a later edit that adds an
  environment option to one of them finds the reason it exists.

Negative:

- The Claude side is proven by a form test over the adapter's own text, not by a behavioural test:
  there is nothing to assert on, since the correct behaviour is that it sets nothing. The
  mechanism itself is proven behaviourally against a real linked worktree in the hook runner,
  including the failure it prevents.
- An adapter that spawns workers some third way inherits nothing from this and has to be told.

## Alternatives considered

- **Put it in the worker brief.** Rejected on the mechanism, not on taste: a brief is prompt text,
  and the shell call an agent makes is not the process that runs the hooks. It would read as fixed
  and change nothing.
- **Make the hooks prefer the main working tree over the discovered toplevel.** Rejected: it makes
  every hook ask git which tree is the main one, on every invocation, to repair one caller that
  knows the answer already; and the earlier record documents why that path is not trustworthy in
  a submodule or a `--separate-git-dir` checkout.
- **Have `git worktree add` carry the install, or link `.claude/` into each worktree.** Rejected in
  the DEV-732 ticket itself as a patch at the wrong level: it makes the install per tree, and
  `update` would then have to find every copy.
- **Accept the loss and read hook telemetry per worktree before teardown.** Rejected: it makes the
  reconciler responsible for harvesting state it does not own, on a deadline, and the evidence
  would still be split across two places while it existed.

## Reversal cost

Low. One paragraph in the Codex adapter page and one comment in the Claude workflow. Reverting
restores a Codex run whose hook telemetry is deleted with its worktree, so the reason would have
to be a better home for that telemetry, not the absence of one.
