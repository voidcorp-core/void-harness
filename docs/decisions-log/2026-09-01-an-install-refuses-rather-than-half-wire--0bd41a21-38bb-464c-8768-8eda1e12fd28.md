---
schemaVersion: 1
id: "adr:0bd41a21-38bb-464c-8768-8eda1e12fd28"
createdAt: "2026-09-01T08:50:04.965Z"
title: "An install refuses rather than wire a runtime whose settings it cannot read"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# An install refuses rather than wire a runtime whose settings it cannot read

## Context

`readSettings` answered `{}` to a parse error. The caller merged into that empty object and wrote
the result, so a trailing comma in `.claude/settings.json` -- the most ordinary way the file breaks
-- cost the project its hooks, its permissions and its environment. No `--force` was needed, and
nothing was said before or after.

`.void/config.json`, co-owned in exactly the same way, already had the right shape: readable
merges, unreadable is left alone and named, `--force` overwrites and says so first. The obvious
move was to give `settings.json` the same treatment: leave it, report it, carry on with the rest of
the install.

The staged doctor refused that install, and it was right to. Every hook this runtime loads is
declared in `settings.json`. An install that skips the file and reports success ships a harness
with **no enforcement floor at all**: no secret guard, no `console.log` refusal, no test-name lint.
That is the failure the whole file transaction exists to prevent, arrived at through the door
marked "be gentle about it".

## Decision

An install that can neither read nor replace `.claude/settings.json` refuses, names the file and
both remedies, and lets the transaction roll back byte for byte.

The refusal lives in the runtime adapter rather than in `init`, so every caller inherits it --
`runtime add` as much as `init` -- and the rule has one home. The settings the project cannot parse
are still exactly the bytes it wrote, because nothing was published.

`--force` replaces the file and says in the same breath that its hooks, permissions and environment
went with it. It is stated before the write rather than discovered after it.

## Consequences

Positive:

- A broken settings file cannot be silently replaced, which is what the ticket asked, and cannot be
  silently skipped either, which is what the first attempt would have shipped.
- `inspectSettings` gives writers three answers where they had two. Absent and unreadable are
  different facts, and a type that conflates them is how the defect survived.
- `readSettings` stays for the six callers that only report -- doctor, runtime, remove -- so no site
  became a tree of cases, as the ticket required.

Negative:

- An install now fails on a file the project broke, where it used to complete. That is the point,
  and it is still a project that cannot install until someone fixes a comma.
- The refusal comes from the adapter, so the message reaches the operator wrapped in `init`'s
  rollback line. It reads correctly -- nothing was published -- but it is one layer of prose more
  than a dedicated up-front guard would produce.

## Alternatives considered

- **Leave the file and carry on, reporting it.** The shape `.void/config.json` uses, and it was
  written first. Rejected on evidence: the staged doctor refuses the result, because a runtime with
  no hooks is not installed. Config is configuration; this file is the wiring.
- **Merge into `{}` and keep a `.bak`.** Rejected: it still destroys the live file, and a backup
  nobody is told about is a file nobody restores.
- **Guard early in `init` instead of in the adapter.** Rejected as the only home: `runtime add`
  wires the same file through the same adapter and would have kept the defect.
- **Parse leniently, e.g. strip trailing commas.** Rejected outright. Guessing what a project meant
  in a file that governs what may execute is exactly the shortcut this doctrine forbids.

## Reversal cost

Low. One verdict function, one branch in the Claude adapter. Reverting restores an install that
replaces a file it never read, so the reason would have to be better than the loss it costs.
