---
schemaVersion: 1
id: "adr:6030b194-6700-42bc-8579-3612a31804c0"
createdAt: "2026-09-01T23:16:33.837Z"
title: "Ordering separates two areas only when no file can lie in both"
status: accepted
deciders: []
supersedes: ["adr:d7fff6f6-65b1-4254-8843-ec6629f5ab64"]
---

# Ordering separates two areas only when no file can lie in both

## Context

The decisions this chain supersedes are right on substance and this one restates them rather than
replacing them: a declared area has ONE reading, in `footprint-area`; the reconciliation audit
refuses a range for a file **another ticket of the cluster declared**, never for a file merely
nobody predicted; and a carve-out beats the area that contains it.

One sentence has now failed a sixth adversarial review, and it is the sentence that failed the
fourth and the fifth: the clause that lets a jointly declared file through is justified by ordering
having sequenced the pair. Twice repaired, twice still false, because both repairs fixed WHO reads
an area and neither fixed WHAT the reading asks.

`areasOverlap` asked whether one area claims the other's **name**. That is not the question of
whether their files intersect, and for a glob the two come apart, because an extension glob matches
no bare directory. Measured end to end on the built binary, with `DEV-1` declaring
`packages/**/*.test.ts` -- "add tests across the packages" -- beside `DEV-2` declaring
`packages/core/b`:

    plan        => parallel: [DEV-1, DEV-2], sequential: [], excluded: []
    orchestrate => both parallel, concurrency 2, reasons: {}
    reconcile   => integrate: [DEV-1, DEV-2], excluded: []
    auditFootprint on a DEV-1 range carrying packages/core/b/x.test.ts
                => {"kind":"within-scope","widened":[]}

Two concurrent worktrees, which is the exact precondition of the 2026-09-01 shared-stash incident,
and then a file DEV-2 declared arriving in DEV-1's range with nothing refused, nothing flagged and
nothing printed. `widened` is empty because DEV-1's own glob reaches the file, so the growth is not
even reported. That is word for word what this module condemns: invisible, not merely permitted.

The last two lines of that measurement still read the same after this decision, and are pinned as
tests. They are not the defect: a tie is the right verdict for two areas neither of which is
narrower than the other. The defect is that the first two lines let the pair reach them at once.

Neither area is a carve-out of the other -- neither is strictly narrower -- so the audit reads the
pair as a tie and both tickets as entitled. That leniency is correct exactly when ordering
sequenced them. Here it did not, on the most ordinary input shape an estimator produces.

The superseded chain's accepted **Negative** bullet on this residue was wrong twice over. It
described the blind spot as glob-versus-glob, when the shape that arrives is glob-versus-directory.
And it named the audit as the backstop, when the audit shares the blind spot by construction: it is
the step whose leniency the ordering step is supposed to earn. A backstop cannot be the thing being
backstopped.

## Decision

**Ordering separates two areas only when it is PROVEN that no file can lie in both.** Every file an
area claims lies under its **reach** -- the leading non-glob path `picomatch.scan` reports for the
pattern that compiles the matcher, and the repository root for a negated pattern, which claims
everything it does not name. Two reaches neither of which contains the other, read as paths and not
as strings, can hold no file in common; that pair, and only that pair, runs in parallel. Everything
else takes its turn, in the direction `worker-order` already claimed: conservative on purpose.

This **subsumes** the name reading rather than sitting beside it. An area whose name the other
claims lies under that other's reach, and its own reach is a prefix of its name, so the two reaches
are prefixes of one path and always nest. The guarantee that matters -- every pair the audit can
relate is a pair ordering sequences -- is asserted over a corpus of areas in the tests, rather than
restated as a branch no input can reach.

The audit's reading is untouched. `areaIsNarrower` still decides whose file a file is, and reach
decides only who runs beside whom: a glob and a directory sharing ground are a collision for
ordering and remain a tie for the audit, which is what makes the tie safe.

## Consequences

Positive:

- The clause the whole leniency rests on is finally true on the shape footprints are actually
  written in. A pair the audit will call a tie is a pair the run sequenced.
- The reach is a bound, not a heuristic. That no file escapes it is a test over hostile patterns,
  so a future change to how an area compiles cannot quietly widen what runs at once.
- The skill's own promise at the orchestration bullet -- "sequences what it cannot prove disjoint"
  -- describes the code for the first time. It was prose before.

Negative:

- Fewer parallel lanes, in a bounded and nameable set of pairs. Two areas rooted in different
  directories are untouched, which is how a cluster is normally scoped: `packages/cli/**` beside
  `packages/core/**` keeps both lanes, and so does a glob beside a directory outside its reach.
  What loses a lane is a pair whose roots nest: two globs in one subtree separated only by
  extension (`packages/core/**/*.md` beside `packages/core/src/**/*.ts`) now sequence though no
  file is really shared, and an area rooted at the repository (`**/*.ts`) sequences against
  everything. The second is honest about what a repository-wide glob claims; the first is the
  accepted false positive, and it costs wall clock on one cluster, never correctness. A cluster
  that hits it repeatedly is a cluster whose tickets should declare their subtree.
- A ticket author can no longer buy parallelism by writing a broad glob. That is intended: the
  breadth was always claimed, and only the reading of it was narrow.

## Alternatives considered

- **Sequence whenever either area carries a metacharacter.** The blunt reading of the same finding.
  It gives up every glob pair including `packages/cli/**` beside `packages/core/**`, which is the
  commonest disjoint cluster there is, and it punishes the estimator for using the notation the
  footprint format invites. Proving disjointness for the common shapes costs one field on the
  compiled area, so paying with every glob lane buys nothing.
- **Intersect the two patterns properly, by deciding whether two globs can match a common path.**
  The complete answer, and it needs a path matcher this repo would then own, maintain, and be wrong
  in. Rejected on economy of means: the reach comparison is one string test, it errs only in the
  safe direction, and the error costs a lane rather than a guarantee.
- **Leave ordering alone and make the audit refuse any contested file.** Already rejected on the
  previous pass and still wrong for the same reason: the narrow ticket writing inside its OWN
  carve-out would be refused for doing exactly its job. It also treats the symptom, since the two
  worktrees would still have run at once.
- **Keep the name reading beside the reach reading as belt and braces.** Written that way first.
  Removed once mutation testing showed no input can distinguish it: a branch nothing can reach is a
  claim no test can prove, which is the failure mode this module exists to remove. The guarantee it
  expressed became an assertion over a corpus instead.

## Reversal cost

Low. One pure module, one added field on its compiled area, and its tests; no persisted artefact
carries a reading, and no verdict is recorded anywhere. Loosening the relation back is deleting one
comparison.
