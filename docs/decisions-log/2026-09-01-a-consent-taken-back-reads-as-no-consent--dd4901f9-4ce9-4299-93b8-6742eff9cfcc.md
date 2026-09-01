---
schemaVersion: 1
id: "adr:dd4901f9-4ce9-4299-93b8-6742eff9cfcc"
createdAt: "2026-09-01T08:09:49.550Z"
title: "A consent taken back is a block that was never declared, and it says which one it was"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A consent taken back is a block that was never declared, and it says which one it was

## Context

The `CLAUDE.md` this harness injects into every consumer states:

> The file's `autopilot` block carries consent to autonomous execution and is never inferred:
> `enabled: false`, an absent block, or an unreadable one forbids autonomous selection entirely.

The `void-autopilot` skill says the same. The field was read by nobody. `parseAutopilot` never
looked at it, `preflight.ts` declared it in a type and consulted it nowhere, and
`void-harness autopilot chain` took the next unit with `enabled: false` sitting in the descriptor.

The gap was not an oversight either. A test named `ignores an "enabled" left over from a descriptor
written before this` pinned the field as a vestige, on the reasoning that declaring the block is
already the consent and that rejecting an unknown field would break every existing programme on
upgrade. Both halves of that reasoning are sound. What it missed is that the shipped prose was
still promising the field, so the repository had decided one thing and told its consumers another.

The direction of the failure is what makes it urgent. A person who reads their own doctrine, writes
`enabled: false` to stop an autopilot, and checks that the block is still valid, is not protected,
and nothing anywhere says so. Three defects of the same week share that shape, and every one of
them is about what a human believes they have reserved for themselves.

## Decision

`enabled: false` is read, and it produces exactly what an absent block produces: no autopilot
configuration at all. The reason survives beside it, on the descriptor rather than inside the
config, as `autopilotConsentWithheld`.

The shape is what carries the guarantee. A withheld consent and an undeclared block forbid the same
thing, so they are one value, and the next authorisation point cannot forget to read a flag it does
not have: there is nothing to authorise against. Only the sentence differs, and it differs because
someone who wrote `enabled: false` is looking straight at their block while being told it is
missing.

The rules that make it hold:

- **The refusal lives where the unit is taken.** `chain` refuses before deciding a next unit, not
  only in `doctor`'s report. A report is a reading; the chain is the act.
- **A value that is not a boolean refuses.** The string `"false"` read as consent is a run nobody
  authorised, and the correction costs one line.
- **An absent field still grants.** Declaring the block is the consent, and nobody writes a field to
  agree with what they already wrote. Requiring `enabled: true` would break every descriptor in
  existence for nothing.
- **A disabled block is still validated.** Present-but-wrong is an error here as everywhere else.
  Waving it through would move the failure to the day someone turns it back on, which is the worst
  moment to discover it.

## Consequences

Positive:

- The strongest safety claim the harness makes is now true wherever it is made. The prose was
  already right; the code joined it.
- A consumer can suspend autonomy without deleting a block that `base`, `mergeGate`,
  `verifyCommands` and `ownership` also live in. Removing and restoring fifteen lines by hand is
  where the next mistake was going to come from.
- The prose is held to the code by a test that exercises each way of withholding consent against the
  parser and then requires the shipped skill and the injected `CLAUDE.md` to name it. Delete the
  support and it goes red; delete the sentence and it goes red too.

Negative:

- A programme that carried `enabled: false` while believing it inert now stops. That is the point,
  and it is still a behaviour change on upgrade for anyone who wrote the field decoratively.
- `ProgramDescriptor` gained a field that exists only to carry a reason. It is one boolean, and it
  is the price of a refusal that names what the author wrote.

## Alternatives considered

- **Read `enabled` into the config and check it at each authorisation point.** Rejected: it
  reproduces the defect. The guarantee would then rest on every present and future caller
  remembering to consult a flag, which is exactly what did not happen for the whole life of the
  field.
- **Delete `enabled` from the type, the skill and the injected `CLAUDE.md`.** Credible, and it was
  the repository's implicit position. Rejected because it leaves a consumer with no way to say "not
  this project" short of deleting a block four other settings depend on, and because withdrawing a
  published safety promise is a heavier act than honouring it.
- **Return the config and let the caller see a `consentWithheld` flag on it.** Rejected on type
  design: it keeps an authorisation object alive for a programme that authorised nothing, which is
  an illegal state left representable.
- **Refuse to parse a descriptor whose autopilot block is disabled.** Rejected as hostile. A
  disabled programme is a legitimate state, and every reader of the descriptor -- `resume`,
  `projects`, `doctor` -- has business other than autopilot.

## Reversal cost

Low. One field on the descriptor, one early return in the parser, one refusal in `chain` and one in
the preflight. Reverting restores a promise the harness would then be breaking again, so the reason
would have to be better than the promise.
