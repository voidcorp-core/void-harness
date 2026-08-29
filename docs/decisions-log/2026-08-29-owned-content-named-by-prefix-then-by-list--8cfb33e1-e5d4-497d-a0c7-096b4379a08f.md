---
schemaVersion: 1
id: "adr:8cfb33e1-e5d4-497d-a0c7-096b4379a08f"
createdAt: "2026-08-29T20:05:00.000Z"
title: "the harness names what it owns by prefix where it can, by list where it cannot"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# the harness names what it owns by prefix where it can, by list where it cannot

## Context

The managed ignore block has to answer one question: which files under
`.claude/`, `.agents/` and `.codex/` belong to the harness. Those directories are
shared -- the runtime reads the project's own skills, agents and commands from
exactly the same places.

Two forms have been tried, and each sacrificed what the other protected.

The first named every generated file from the install receipt: 148 lines in this
repository to keep two files tracked. Safe, because nothing outside the receipt
could appear in it, and unreadable.

PR #250 collapsed that to thirteen rules over whole directories. Readable, and it
swallowed the thing the first form existed to protect: `.claude/skills/*` hides a
skill the project wrote, which is work rather than a regenerable file. The block
told the project to re-include each one by hand, with `doctor` reporting the
omission. That trade does not hold -- a net that assumes somebody runs `doctor`
before the clone is not a net, and the loss lands at the first clone.

Restoring the receipt-derived list would produce 127 entries here, measured. That
is the wall again, and it also carries a second flaw nobody stated: any list is
stale about a skill added after the last install, so that skill is ignored until
the next one.

## Decision

The harness names what it owns the cheapest way its own naming allows: a pattern
where its names carry one, a list where they do not.

Every skill this harness ships is `void-`prefixed -- CLAUDE.md rule 8, enforced
by `scripts/anti-bloat-check.sh`, so an invariant and not an observation. Two
pattern lines therefore replace 82 owned skill directories, and, being a pattern,
they stay right about a skill the project adds long after the last install.

Agents are named for a person you could hire (`doctrine-critic`,
`solution-architect`), so nothing separates one of ours from one the project
wrote. Those are listed from the receipt, one entry each.

Measured on this repository: 54 rules, against 148 before #250 and 13 today.
`UNIT_ROOTS` is asserted to be exactly the union of the two regimes, so a root
added later cannot fall through into neither.

## Consequences

Positive:

- A project's own skills, agents and commands are visible to git with no line to
  write by hand and no `doctor` run standing between the work and its first
  clone. Asserted end to end through a real init, a real commit and a real clone.
- The prefix regime has no stale window at all, which no list can offer.
- `doctor`'s `project skills` check becomes the net it should always have been,
  and reports the one cause that can still hide a skill: a project skill named
  with the prefix reserved for shipped ones.

Negative:

- The block grows from 13 rules to 54 on this repository. Paid where it is
  cheapest: `.git/info/exclude` is per-clone and in no diff, which is precisely
  what the ignore-rules-in-git-info-exclude decision bought.
- A project still holding skills from a pre-prefix install sees them become
  visible to git until its next install renames the directories. Accepted: the
  failure is derived content committed -- a diff in a review, reversible with
  `update --untrack-derived`, which reads the manifest and is unaffected -- where
  the failure it replaces was the project's own work leaving unnoticed.
- Without a readable receipt the harness agents are not covered. Same asymmetry,
  deliberately the same way round.

## Alternatives considered

- **Keep `.claude/skills/*` and emit one `!` exception per detected third-party
  skill** (the ticket's own lead). Rejected on the stale window: a skill written
  after the install is not in the block, so it is ignored until the next one, and
  `doctor` is again the only thing standing between the work and the clone. That
  is the trade the ticket declares untenable, reproduced smaller.
- **Derive every entry from the receipt, as before #250.** Rejected on the
  measurement: 127 entries here, the wall restored, and still stale about
  anything added later.
- **Prefix the agents too, and pattern everything.** Rejected as out of scope and
  against the naming doctrine, which gives an agent the name of a person you
  could hire. Worth revisiting only if agents ever need the collision protection
  the skill prefix exists for, which is its own question.

## Reversal cost

Low. `gitignoreBlock` takes the owned paths as an optional argument and the two
regimes are two frozen constants; reverting is deleting the pattern lines and
widening the list. The tests that would then fail are the ones stating the
defect, which is the point of writing them against real git.
