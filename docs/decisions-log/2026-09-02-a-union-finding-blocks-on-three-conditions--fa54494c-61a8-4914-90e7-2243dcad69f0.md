---
schemaVersion: 1
id: "adr:fa54494c-61a8-4914-90e7-2243dcad69f0"
createdAt: "2026-09-02T11:08:01.698Z"
title: "A union finding blocks on three conditions, not on being true"
status: accepted
deciders: []
supersedes: []
---

# A union finding blocks on three conditions, not on being true

## Context

The grant already graded findings: `union-contradicted` fires on a *blocking* contradiction, and
the table says an advisory is carried over and does not stop the merge. But nothing defined what
makes a finding blocking. Each reading therefore settled it implicitly, and the available default
is the strict one: everything true blocks.

That default was measured on 2026-09-01. One unit (DEV-681) took twenty-five commits, seven
correction passes and **eight union readings**. Seven refused. Every one of the seven was factually
right, and none of them ended the work. The subject was a guard, and a guard is asymmetric: it must
hold on every path, not merely on the paths anyone walks, so there is always one more true finding.
A reading that blocks on every true finding does not converge.

The same mechanism, on the same day, merged a two-ticket cluster after a single clean reading. The
difference was not difficulty. It was the missing threshold.

## Decision

A union finding blocks only when all three hold: it is reachable without forgery on the nominal
path, it has a real consequence (unclaimed code enters the base, or a stated guarantee is false on
a path someone takes), and it is owned by the diff under review. Everything else is advisory:
real, anchored, filed, and it does not stop the merge.

## Alternatives

**Keep blocking on every true finding.** Credible, and it was the status quo. It is the safer
reading of a single pass taken alone, and it is what a reader reaches for when the subject is
safety. Rejected on measurement rather than on taste: it produced seven refusals without ever
producing a merge, and its cost is not paid once — it is paid on every unit whose subject is a
guard, which is exactly the class of unit this harness exists to ship carefully.

**Cap the number of readings.** Rejected: a budget stops the loop without saying which findings
mattered, so the last reading refuses and the cap merges anyway. That is worse than no threshold,
because it launders an unresolved refusal into an approval.

**Let the operator waive a finding.** Rejected: it moves the judgement to the moment of most
pressure, at the end of a paid run, which is where the refusal that used to name a disarming
gesture did its damage.

## Consequences

The threshold does not loosen the seven refusals it was written after: each was reachable on the
nominal path, each let unclaimed code through or made a stated guarantee false, and each belonged
to the diff. They all block under it. What it removes is the class that needs a hand-built payload
lying coherently across several fields, and the class that predates the diff.

A plausible mistake still blocks. The distinction is not severity but authorship: a mistake is not
a lie, and an agent that hallucinates one field does not thereby produce a coherent forgery.

Negative: condition three lets a diff merge over a real defect it merely revealed. That is
deliberate — refusing the diff neither repairs the defect nor contains it — but it depends on the
advisory actually being filed. An advisory that is reported and not filed is a finding lost, and
this decision makes that loss likelier than the strict default did.

Also negative: reachability is a judgement, not a computation. Two readings can disagree about
whether a path is nominal. The condition is written to be argued, and a reading that cannot
justify all three in writing must classify the finding as advisory.
