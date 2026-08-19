---
schemaVersion: 1
id: "adr:8f3cf096-53b4-43e6-8aaa-a65e0866f180"
createdAt: "2026-08-19T10:05:20.995Z"
title: "The bare name is the written form of a skill reference"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The bare name is the written form of a skill reference

## Context

Every skill cited its neighbours with the plugin namespace: `harness:tdd`, and for pack skills
`harness-server:server-action`. 298 such references across 69 shipped files, 58 distinct names.

That namespace exists only under a Claude Code marketplace plugin install. Under `npx voidharness`,
declared the primary channel, `stageSkills` lands every skill flat in `.claude/skills/` and the
invocable name is `tdd`. A forced call settles it:

```
Argument sent: skill='harness:zzprobe'
Result: Unknown skill: harness:zzprobe
```

So the sixteen "compose" lines of `implement`, the chain every ticket runs through, were sixteen
calls that failed. The model then guessed the name or skipped the load and replayed the pass from
memory. Nothing reported it: `check-skill-references` validated that a cited skill existed in the
catalogue, never that its name resolved in an install.

The namespace is also runtime-specific in a way that cannot be written once. Claude Code invokes
`/name`, Codex `$name`, Kimi `/skill:name`. Any syntax baked into doctrine prose is wrong for two
of the three.

## Decision

A skill body names a neighbouring skill by its bare name; the invocation syntax belongs to the
runtime and is stated once, in the managed block of `CLAUDE.md` and `AGENTS.md`, which is rendered
from the install channel.

## Consequences

Positive:

- The written form is what the overwhelming majority of installs resolve, and the same line serves
  Claude, Codex and Kimi.
- The managed block is the single place that knows a namespace, and it already knows the channel.
- `check-skill-references` inverts into something that can actually fail: a namespace in a live
  surface is now the defect it reports.

Negative:

- The bare name is not a routing marker, so a rename can no longer be caught by scanning prose for
  a prefix. The compensating mechanism is `relations.graph.yaml`, where compositions are declared
  with evidence and validated as graph nodes.
- A marketplace install reads doctrine that names skills without its own namespace. The managed
  block states the namespace for that channel, so the reader has the rule; the prose does not
  repeat it per line.

## Alternatives considered

- **Rewrite references at install time**, expanding the bare name into the namespace when the
  channel is marketplace. It works, and it makes every installed skill differ from its source, so
  reading a skill on disk stops being a way to read the skill. Rejected for that opacity, not for
  cost.
- **Drop the marketplace channel entirely**, leaving exactly one name. Simplest of all, and it
  discards a working distribution channel to solve a problem the managed block already solves.
  Rejected as disproportionate.
- **Keep the namespace and document the local install as unsupported.** Rejected outright: the npm
  package is the primary channel, and this repository is itself a local install.

## Reversal cost

Low. The rewrite is mechanical in both directions, the gate is one script, and the channel
distinction is a single expression in `harnessBlock`. What would be expensive is discovering the
defect again from behaviour rather than from a failing check, which is what the inverted gate now
prevents.
