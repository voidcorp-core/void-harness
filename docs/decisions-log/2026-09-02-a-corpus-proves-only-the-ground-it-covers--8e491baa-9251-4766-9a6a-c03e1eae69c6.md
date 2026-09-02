---
schemaVersion: 1
id: "adr:8e491baa-9251-4766-9a6a-c03e1eae69c6"
createdAt: "2026-09-02T00:52:10.057Z"
title: "A corpus proves an invariant only over the ground it covers"
status: accepted
deciders: []
supersedes: ["adr:6030b194-6700-42bc-8579-3612a31804c0"]
---

# A corpus proves an invariant only over the ground it covers

## Context

The chain this supersedes is right on substance and this decision restates it rather than replacing
it: a declared area has ONE reading, in `footprint-area`; the audit refuses a range for a file
**another ticket of the cluster declared**, never for a file merely nobody predicted; a carve-out
beats the area that contains it; and ordering separates two areas only when it is PROVEN that no
file can lie in both.

A seventh adversarial review left every one of those standing and broke a different sentence -- the
one from the chain's second link, restated as recently as its fourth: *the guard can no longer be
disarmed by how a human spelled a directory.*

`compileArea` compiled its matcher as `picomatch(value)`. picomatch 4.0.5 documents `dot` as
defaulting to false, and `*` as matching no hidden file or directory unless the pattern spells the
dot itself. A footprint is not a filter, so that default is a hole: an area written as a glob
claimed no file whose matched segment leads with a dot, while the DIRECTORY spelling of the same
area claimed it through the prefix branch. One area, two spellings, two answers about one file --
which is the exact invariant `normaliseArea` exists to establish.

Measured against the real sources, unmodified:

    footprints = [DEV-1: [packages/core/skills/**], DEV-2: [packages/cli/src/lib/autopilot]]
    orderWorkers => parallel [DEV-1, DEV-2], reasons {}
    audit(DEV-2, [packages/core/skills/void-tdd/.source])
        => {kind: within-scope, widened: [packages/core/skills/void-tdd/.source]}
    audit(DEV-2, [packages/core/skills/void-tdd/SKILL.md])
        => {kind: breach, claimedBy: [DEV-1]}

    same area, directory spelling [packages/core/skills]:
    audit(DEV-2, [packages/core/skills/void-tdd/.source]) => breach

`widened` is this module's own word for approval: a range carrying another ticket's file merged
unrefused and unflagged, as soon as the victim wrote a glob and the stolen file was hidden. And
sequencing was not the backstop either -- with `packages/core/**` against `packages/core/b/**` the
reaches nest, the pair IS sequenced, and the two hidden files still came back as growth while the
visible one came back a breach. 183 tracked files of this repository sit on a hidden path,
including the `.source` the sourcing discipline puts beside every skill, every
`packages/*/.claude-plugin/plugin.json`, and every `__fixtures__/.claude/` tree. Across 1974 real
paths, the two spellings of one area disagreed 770 times.

The deeper finding is not the option. It is what let six reviews pass over it. The superseded
decision rests its guarantee on two assertions over a corpus -- "bounds every file an area claims
inside that area reach" and "sequences every pair the audit is able to relate" -- and neither
corpus held a single dot-leading path. Both stayed green through the whole omission: reintroducing
the defect with the hidden paths removed from the corpus leaves both assertions passing.

## Decision

**A dot is a character, not a category.** Every matcher compiled from an operator-declared path in
the autopilot -- the area reading in `compileArea`, the single-writer ownership list in
`worker-order` -- compiles with `dot: true`, so a hidden segment is read as an ordinary segment and
one area has one answer per file whichever of its spellings was written.

**And a corpus that backs an invariant covers the awkward ground.** The two assertions carry
dot-leading entries in both the areas and the files, because an assertion is only as strong as its
corpus and this one silently was not. The equivalence the whole module rests on -- the directory
spelling and the glob spelling of one area agree on every file -- is now itself an assertion rather
than an assumption.

The option only ever adds matches, so it moves both readings in the safe direction: more claims
mean more pairs sequenced, and a carrier detected where a widening was reported. It cannot separate
a pair that overlapped, nor clear a range that breached.

## Consequences

Positive:

- The sentence about spelling is finally true. Trailing slash, leading `./` and a dot segment are
  now all spellings of the same ground rather than three ways to disarm the guard.
- A `.source`, a `plugin.json` or a `.claude/` fixture stolen from another ticket is refused. The
  files this repository's own conventions mandate stopped being the ones the guard could not see.
- A reserved single-writer path is honoured when it is hidden, which is what a reserved path in
  this repository mostly is: `.void`, `.claude`, `.github`.
- The two load-bearing assertions now cover the shape that broke them, and a third pins the
  spelling equivalence directly, so the next change to how an area compiles cannot re-open this
  quietly.

Negative:

- Marginally fewer parallel lanes and marginally more refusals, in the bounded set of pairs that
  contend over a hidden file. That is the correct direction, and the one the whole chain already
  accepted; it is named here rather than discovered later.
- The corpus is larger and slower to read. A corpus that omits the awkward ground is cheaper and
  proves less, which is the trade this decision refuses.

## Alternatives considered

- **Spell the dot in the footprints instead, and document it.** Teach ticket authors to write
  `packages/core/skills/{**,**/.*}`. Rejected: it puts the guard's correctness in the hands of the
  person being guarded, and the natural spelling stays the unsafe one. The chain already rejected
  this shape for the trailing slash.
- **Refuse an area whose glob would skip hidden files.** Fail loudly rather than widen. Rejected as
  unimplementable without answering the very question `dot: true` answers, and it would refuse
  `packages/core/**` -- the commonest footprint there is -- for a defect that has a one-word fix.
- **Fix `compileArea` and leave `worker-order`'s ownership matcher alone.** Cheaper, and the
  ownership list is a different input. Rejected because it is the same reading of the same kind of
  operator-declared path, and leaving one of two matchers on the old default is how a fixed defect
  comes back through the door nobody watched.
- **Add the option and leave the corpora as they were.** The minimal diff, and the tests would have
  gone green. Rejected as the actual lesson of this review: the option was never the hard part, and
  a corpus that cannot fail is not evidence.

## Reversal cost

Low. One option on each of two `picomatch` calls, plus corpus entries and three assertions in two
pure test files. No artefact persists a reading and no verdict is recorded anywhere, so reverting
is deleting the option and the rows that prove it.
