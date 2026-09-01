---
schemaVersion: 1
id: "adr:47ca3baa-7e69-46db-a5fc-bc3eca899ca5"
createdAt: "2026-09-01T13:56:42.269Z"
title: "update refreshes a project doctrine nobody ever filled in"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# update refreshes a project doctrine nobody ever filled in

## Context

`init` seeded `.void/PROJECT-DOCTRINE.md` from a 124-line template, and `CLAUDE.md` imports it
with `@`, so it entered the context of every session whether or not anyone had written in it.
Measured on this repository, whose copy was byte-identical to the template: 124 of the 440 lines
of doctrine loaded per session, 28 %, said nothing about the project.

Worse than empty, it was false. The template did not carry only `<placeholders>`: it carried
examples written in the present tense, with a date and an incident.

> **Stripe webhook signature verification** : every Stripe webhook handler verifies the signature
> AND the timestamp window (<= 5 minutes).
> **Why** : incident 2026-04-12 — a replayed webhook re-credited an account.

An invented incident, an invented date, and a wrapper from a package the project does not depend
on, presented as this project's reality, injected into repositories that have never touched
Stripe. A template is written to be read by a human filling a file in. This one was loaded as if
it were doctrine.

Two facts bound the fix. The file is `project` class and co-owned: the project owns every line,
which is why `init` has always preserved it. And the install manifest records the sha256 of what
the harness actually wrote there, which makes "has anyone written in this file" a decidable
question rather than a guess.

## Decision

The installed file becomes a stub of a dozen lines that says what the file is for, that it is
yours, and where the full format lives; the long form moves to `docs/PROJECT-DOCTRINE-FORMAT.md`,
which nothing loads. `init` seeds that stub, and additionally replaces the file when — and only
when — its bytes still match the manifest's record of what a previous install wrote. Any other
state preserves the file untouched, including a missing or unparseable manifest, because silence
is not proof that nobody edited it.

The stub carries no section headings. `void-learn` already owns the section routing table and
already creates a heading when the one it needs is absent, so the headings in the template were a
second, and by then divergent, copy of that list: it named `Quality bar`, which the template never
had.

`PHILOSOPHY.md` is a separate question and is deliberately untouched here. It is 164 lines and,
unlike the template, every one of them says something. Whether it too should shrink is worth
asking; it is not answered by this record.

## Consequences

Positive:

- A fresh install loads 14 lines instead of 124, and a consumer who never filled the file in stops
  carrying an obsolete template into every session forever rather than only until their next
  install.
- No fabricated incident, date, or dependency survives in any file loaded by `@`.
- "Never overwritten" gains a precise boundary instead of an absolute one, and the boundary is
  proven per file rather than assumed per project.

Negative:

- `init` can now rewrite a file the project nominally owns. The blast radius is exactly the set of
  files whose bytes we ourselves wrote and nobody has changed since, but the rule is no longer the
  one sentence it used to be.
- A project that deliberately kept the template verbatim as its doctrine loses that text. It was
  placeholders about a fictional Stripe incident, so the loss is a gain, but it is a loss.
- The full format is one network hop away for someone offline.

## Alternatives considered

- **Leave an untouched file alone and fix only new installs.** Rejected: every existing consumer
  keeps paying for the old template in every session, indefinitely, which is the complaint. The
  fix would help only projects that do not exist yet.
- **Recognize the old template by a list of shipped digests instead of the manifest.** Rejected:
  the template has nine revisions in this repository's history, the list would need every one, and
  it would answer a question the manifest already answers exactly for the install at hand.
- **Keep the section headings in the stub as scaffolding to fill.** Rejected: the scaffolding is
  paid once by one person at fill-in time and charged to everyone in every session until then, and
  the person filling it in is better served by the format document, which carries the headings
  plus the prose explaining each. A heading with nothing under it is still structure a model reads
  as the shape of this project's doctrine.
- **Ship the long format into the project as a second installed file.** Rejected: it trades bytes
  in the context for bytes on disk plus a new managed asset to declare, version, and keep in sync,
  to serve a document that is read once.

## Reversal cost

Low. The behaviour is one pure predicate, `isUntouchedSinceInstall`, and one branch in
`installDoctrineFiles`. Deleting the branch restores the previous absolute preserve in a single
commit; the stub and the format document are content and revert independently.
