---
schemaVersion: 1
id: "adr:c109429b-480e-48a9-baba-93f644f9e9e1"
createdAt: "2026-08-18T11:32:41.000Z"
title: "A skill is named by what someone would type to find it"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# A skill is named by what someone would type to find it

## Context

The names had drifted into three grammars for one kind of thing. `writing-plans`
was a gerund in the plural, `ticket-writer` an agent-noun, `adr-workflow` and
`context-management` carried suffixes that lengthened the name without narrowing
it. Nothing in a name told a reader whether it was a thing to run, a rule that
applies on its own, or someone to delegate to, so every routing decision needed
the file open.

Names are also the routing surface. Auto-discovery matches on name and
description, so a name that reads wrong is not a matter of taste: it sends work
to the wrong place, or nowhere.

The rule had to cover the whole inventory, not the four names that irritated us.
An early attempt, "always a bare verb", collapsed on the second family:
`hexagonal-architecture` has no verb, and forcing one produces nonsense. Any rule
that fits half the surface gets worked around at the third exception.

## Decision

A skill is named by what someone would type looking for it without knowing it
exists, and its `kind` declares which grammar applies.

- `kind: action` is a thing you run: the bare verb. `plan`, `verify`, `debug`,
  `implement`.
- `kind: standard` governs how code is written: the subject it governs. `tdd`,
  `observability`, `accessibility`.
- Agents, which live apart, are people you could hire. `solution-architect`,
  `doctrine-critic`, `security-engineer`.

Refused everywhere: a gerund on an action, an agent-noun for a mechanism
(`-writer`, `-runner`), and filler suffixes (`-workflow`, `-management`,
`-first`). A qualifier is legitimate only to separate siblings, which is why
`code-review` and `plan-review` keep theirs.

The form therefore encodes the type: a verb is something to run, a subject is a
rule that already applies, a person is someone to delegate to. That is the
property worth having, and it is what the three families buy.

## Consequences

Positive:

- `kind` makes the rule checkable rather than intended. It is what lets the check
  know `testing` is a legitimate standard while `planning` would be a gerund
  dressed as an action, a distinction no pattern on the name alone can draw.
- Routing gets cheaper: the grammar answers "what do I do with this" before the
  file is opened.
- Thirteen renames became mechanical, because the reference check landed first.

Negative:

- The public names changed. A consumer who wrote `harness:ticket-runner` in their
  doctrine or their tickets points at nothing after the next release.
- The rule is enforced on names and kinds, not on judgement. Nothing stops a
  poorly chosen verb that satisfies every mechanical rule.
- Sixty-five skills now carry a field that must be set correctly when one is
  added; the check refuses its absence, not its dishonesty.

## Alternatives considered

- **A single rule, "always one bare verb".** Rejected: it does not survive the
  standards, where `hexagonal-architecture` and `typescript-strict` name a
  subject and have no verb. A rule that covers half an inventory teaches people
  to except themselves from it.
- **Keep the `ticket-writer` / `ticket-runner` symmetry.** Rejected, and it was
  argued for first: the suffixes did carry the distinction between the two. But
  they only worked inside the old scheme. Renaming both to distinct verbs,
  `ticket` and `implement`, makes the suffix unnecessary rather than losing it,
  and removes a form that announced a person while describing a mechanism.
- **Short command aliases over renaming.** Rejected as a substitute, though it
  was proposed as one: aliases would have given the short invocation without
  touching any name, but they leave the three grammars in place and the reader
  still cannot tell a standard from an action. Aliases remain available on top
  of the rule, they are not a replacement for it.
- **Leave the names alone.** Rejected: the drift was already costing routing
  clarity, and every skill added would have picked whichever grammar its author
  had last read.

## Reversal cost

Medium. The renames themselves are mechanical and guarded, since the reference
check refuses a link into a name that does not exist. What is not cheap to
reverse is what left the building: names published to consumers, cited in their
doctrine and their trackers. Reverting would break those a second time, which
argues for changing names rarely rather than for changing them back.
