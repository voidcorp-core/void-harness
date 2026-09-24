---
schemaVersion: 1
id: "adr:cd25f7f5-13f0-4e0e-aa51-a7556488990c"
createdAt: "2026-09-24T13:50:47.229Z"
title: "init refreshes an untouched project doctrine, and void-learn owns the section list"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:47ca3baa-7e69-46db-a5fc-bc3eca899ca5"]
---

# init refreshes an untouched project doctrine, and void-learn owns the section list

## Context

The decision on refreshing an untouched project doctrine (`adr:47ca3baa`) shrank the installed
`.void/PROJECT-DOCTRINE.md` to a stub and let an install replace a file nobody had written in. Two
of its claims were wider than the code, and the union review of the first autopilot run found
both.

Its title says `update` refreshes the file, and its consequences promise that a consumer who never
filled it in stops carrying the old template "forever rather than only until their next install".
Only two of the three `update` routes reach that code. `local` and `local-rehydrate` call `init`,
and `installDoctrineFiles` has exactly one caller, `init`. The `marketplace` route refreshes the
plugin cache, the pins, the Codex floor and the receipt, and never calls `init`. That route is
also the one taken when there is no install manifest, which is the case the refresh cannot handle
anyway: the predicate refuses without a manifest that recorded the delivered template, because
silence is not proof that nobody edited the file.

It also removed the section headings from the stub because they were "a second, and by then
divergent, copy" of the section routing table in `void-learn`. The headings were not removed; they
moved, verbatim, into `docs/PROJECT-DOCTRINE-FORMAT.md`. The two lists still disagreed in both
directions: `void-learn` routed to `Quality bar`, which the format page never had, and to `Hard
rules`, which the format page called `Project-specific hard rules`, while the format page carried
`Domain language` and open questions that `void-learn` could not route to. A developer who copied
the format page and then stated a rule got a second heading for a concept the file already had.

## Decision

The refresh is scoped to what the code does. An install that runs `init`, directly or through the
`local` and `local-rehydrate` routes of `update`, replaces `.void/PROJECT-DOCTRINE.md` only when its
bytes still match the manifest's record of the template an install delivered there, and preserves
it in every other state. The `marketplace` route does not refresh the file and will not: it has no
manifest, so it holds no evidence that the file is untouched, and calling `init` from it would
preserve the file under the same rule. A marketplace consumer who wants the stub replaces the file
by hand.

The list of section kinds has one owner, the section routing table of `void-learn`. The format page
illustrates each kind under the same name and adds none. `void-learn` stops depending on exact
titles: it chooses the kind from the rule's meaning, appends under the heading the file already
has for that kind whatever its wording, creates the table's name only when no heading names the
kind, and asks when two headings could hold the rule or a heading matches no row plainly. The
proposal names the target heading verbatim, so the mapping is confirmed with the wording instead of
inferred silently.

Everything else in `adr:47ca3baa` stands: the stub of a dozen lines, the long form in the format
page that nothing loads, the manifest as the only proof, and the preservation of `PHILOSOPHY.md` as
a separate question.

## Consequences

Positive:

- The decision record says what each install channel does, including the one that does nothing.
- A file written from the format page, or from any wording that names the same kinds, is fed by
  `void-learn` without a duplicate heading.
- Adding a section kind is one row in one table; the format page follows by review, and a stale
  wording in a project file is harmless because routing no longer compares strings.

Negative:

- A marketplace consumer keeps the old template in every session until they replace it. That is
  the cost of refusing to overwrite a file without proof, and it is the same cost DEV-649 already
  accepted for any project installed before the manifest existed.
- Routing by meaning is a judgement. It is bounded by the table, by the rule to ask on any doubt,
  and by the human confirmation that already gates every write, but it is not a string equality a
  test can pin.
- The format page still repeats the eight names. Nothing generates it, so keeping it aligned is a
  review duty, not a gate.

## Alternatives considered

- **Make the marketplace route call `init`.** Rejected: without a manifest the predicate preserves
  the file, so the call would change nothing for the file it is meant to refresh, while pulling a
  local materialisation into a route whose assets live in the runtime's plugin cache.
- **Recognize the old template on the marketplace route by a list of shipped digests.** Rejected
  for the reason `adr:47ca3baa` already gave: nine template revisions to enumerate, to answer a
  question only a manifest answers exactly.
- **Keep exact-title routing and make the format page the owner, generated into `void-learn`.**
  Rejected: the format page is not installed, and `void-learn` runs in consumer projects that do
  not have it, so the list the agent reads at routing time has to live in the skill.
- **Fuzzy title matching.** Rejected: it would write a rule under whichever heading scores
  highest, which is exactly how a rule lands in the wrong section without anyone being asked.

## Reversal cost

Low. The first half is a statement of existing behaviour and changes no code. The second half is
prose in one skill and one document; restoring exact-title routing is a revert of the section
routing paragraphs.
