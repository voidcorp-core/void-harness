---
schemaVersion: 1
id: "adr:370ba479-1091-4eaf-9b17-65d3afef6a50"
createdAt: "2026-09-01T19:51:31.496Z"
title: "The pipe is filled from the same table the router refuses names from"
status: proposed
deciders: []
supersedes: []
---

# The pipe is filled from the same table the router refuses names from

## Context

`void-harness autopilot` routes eighteen subcommands. Sixteen of them parse an observation off
stdin. The imperative shell that actually reads the pipe decided whether to do so from a literal
written next to it:

```ts
const wantsStdin = argv.some((arg) => ['plan', 'chain', 'start', 'status', 'resume'].includes(arg))
```

Eleven subcommands were missing from that list: `orchestrate`, `reconcile`, `verify`, `gate`,
`publish`, `progress`, `grant`, `reserve`, `base`, `observe`, `lifecycle`. Every one of them calls
`parseStdin` on the first line of its handler, and every one of them was handed the empty string.
Piping valid JSON into `autopilot reconcile` returned "the reconcile observation on stdin is not
valid JSON".

`reconcile` is the one that matters here, because it is where the footprint audit runs. That audit
is the whole subject of this branch, and through the CLI it had never executed once. It fails
closed, so nothing contaminated ever merged through it; it also refused the only legitimate use,
which is the definition of a gate that lies. Three artefacts of this same branch assert behaviour
that line made false: an `INPUT_SHAPES.reconcile` and a `scaffold reconcile` publishing a contract
for a payload that was discarded, a sentence in the skill placing `reconcile` on that list, and a
decision file arguing from "`npx voidharness autopilot reconcile` is a public command".

The line also matched anywhere in argv rather than at the subcommand, so `abort --run plan` read a
pipe `abort` never looks at.

It survived because every proof calls `runAutopilotCommand(argv, stdin)` with the payload already
in hand. The pure surface was covered to the millimetre; the four lines above it, where `stdin`
comes into existence, were covered by nothing. The conformance script that runs the installed
binary exercises `plan` alone -- and nothing in CI runs that script at all.

## Decision

One frozen `SUBCOMMANDS` table declares every subcommand and whether it reads stdin; the router
refuses a name the table does not hold and the shell fills the pipe for exactly the names it marks
`reads-stdin`, and a process-level test pipes a real payload into a real process and asserts the
real refusal.

## Consequences

Positive:

- The forgotten entry is no longer possible in this shape: there is one list, and a subcommand
  missing from it is rejected loudly by the router instead of quietly starved by the shell.
- `reconcile`, `orchestrate`, `verify`, `gate`, `publish`, `progress`, `grant`, `reserve`, `base`,
  `observe` and `lifecycle` work through the CLI for the first time.
- The unknown-subcommand refusal now names every subcommand from the table rather than from a
  hand-written sentence that had already drifted.
- `readsStdin` resolves the subcommand, so a flag value that happens to spell a step no longer
  makes the process wait on a pipe.

Negative:

- A subcommand added to the router but not to the table is answered "no such subcommand" rather
  than running. That is fail-closed and loud, and it is a worse first-run experience for whoever
  adds the nineteenth.
- The process test spawns `tsx`, so it costs about a second per case and depends on a devDependency
  of `packages/cli` being installed.

## Alternatives considered

- **Add the eleven missing names to the existing literal.** One line, and it fixes today's defect.
  Rejected: the defect is that the answer to "does this subcommand read stdin" lived in two places,
  and adding to one of them keeps both. The nineteenth subcommand would be forgotten the same way.
- **Read stdin unconditionally when it is not a TTY.** Simpler still, and it would have prevented
  this. Rejected: `abort` and `scaffold` genuinely take no payload, and a command that drains a pipe
  it does not use is a command that blocks in a pipeline whose producer has not finished.
- **Prove it in `scripts/conformance-autopilot.mjs` instead.** That script installs the packed
  tarball and runs the real published binary, which is the strongest possible proof. Rejected as the
  primary guard: nothing in CI invokes it, so the proof would have been added to a script nobody
  runs. Recorded as an open finding rather than fixed here, because wiring it into the three-OS
  conformance matrix is a CI-cost decision of its own.
- **Spawn the built `packages/cli/bin/void-harness.mjs`.** The literal "real binary". Rejected: it
  requires `dist/` to exist and to be newer than the diff. A guard proven against a stale build is
  the same false green one notch along, and building inside a test buys that risk back as latency.
  The test runs the sources through `tsx`, in a real process, with a real pipe.

## Reversal cost

Low. The table is a constant and `readsStdin` is a pure function over argv; restoring the previous
behaviour is deleting both and reinstating the literal, at the cost of reopening the hole. No
artefact format changes and no caller outside this module reads either symbol.
