---
schemaVersion: 1
id: "adr:39bbdcb4-2028-4ca7-b957-4dae77f98387"
createdAt: "2026-08-28T23:37:36.039Z"
title: "Runtime adapters take each runtime's maximum, never the lowest common denominator"
status: proposed
deciders: []
supersedes: []
---

# Runtime adapters take each runtime's maximum, never the lowest common denominator

## Context

The harness authors one doctrine and compiles it to each agent runtime through an
adapter. That settles *what* is installed. It does not settle *how* a pass is
executed when the runtimes differ in what they can do, and they do differ.

For the review and verification passes, measured against the official
documentation of both:

- Claude Code exposes direct agent-to-agent messaging (`SendMessage`, a sibling
  roster naming every agent in the session) and agent teams with a shared task
  list. Its concurrent-subagent ceiling is 20. Agent teams are experimental and
  off unless `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set.
- Codex spawns subagents in parallel and consolidates their results. Its own
  documentation is explicit: "Subagents don't directly communicate with each
  other. They operate independently and return results to the parent agent." Its
  ceiling comes from `agents.max_concurrent_threads_per_session`, and is 6.

Two ways to reconcile that, and the tempting one is wrong. Designing every pass
to the intersection -- fan-out and consolidation, because that is all Codex has --
means a Claude session deliberately not using a capability it has, in a harness
whose entire value proposition is the quality of the pass. Designing to Claude
means a Codex project silently getting a weaker pass while the output claims
otherwise.

## Decision

The contract is common and the execution is not: an adapter takes the maximum its
runtime offers for a declared capability, and a runtime that lacks it degrades to
a weaker execution rather than blocking. The output contract does not vary with
the runtime, and the result names which execution actually ran.

## Consequences

Positive:

- A runtime's strengths are used instead of being levelled away. A debate between
  adversarial lenses on Claude and successive arbitrated fan-out rounds on Codex
  answer the same question with the means each has.
- A new runtime is additive. Anything unknown runs the weakest execution -- one
  lens at a time -- which is slower and still correct, so support is never a
  precondition for working at all.
- The declaration stays in the plan, not in the commands. A pass declares the
  capability it wants; no core command learns a runtime name, which is the seam
  that already holds for install, doctor and status.

Negative:

- Two executions of the same pass are not byte-comparable. Only the output
  contract is, which is why it must not vary: without it, certification could no
  longer tell a degraded run from a failed one.
- Capability has to be detected, never assumed. Agent teams are off by default,
  so a Claude session may legitimately have to fall back, and reading the runtime
  name would be exactly the wrong test.
- More surface to keep honest. Every execution path needs its own coverage, and
  the weakest one is the least exercised precisely because it is the fallback.

## Alternatives considered

- **Design every pass to the intersection.** Rejected: it caps quality at the
  weakest supported runtime forever, and each new runtime can only lower the
  ceiling further. The harness exists to raise the quality of a pass, not to
  standardise it downward.

- **Design to the strongest runtime and let the others fail the pass.** Rejected:
  it makes the harness single-runtime in practice while claiming otherwise, which
  is the specific outcome the adapter seam was built to prevent.

- **Let each adapter define its own passes.** Rejected: the passes would drift,
  two projects on two runtimes could no longer be compared, and the mission
  controller could no longer arbitrate a verdict it did not define.

## Reversal cost

Low to medium. The declaration lives in the mission plan and the executions live
behind adapters, so collapsing back to a single execution means ignoring the
declaration -- no data migrates and no contract changes. Medium rather than low
only because any pass built to exploit a capability has to be re-specified for the
weaker execution before the stronger one is removed.
