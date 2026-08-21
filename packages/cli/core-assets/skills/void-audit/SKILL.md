---
name: void-audit
description: Run the outbound audit over local mission events and surface skills that never fire, upstream deprecations and matrix conflicts, as proposals a human disposes of.
allowed-tools: Bash(void-harness:*) Bash(npx:*)
---

# void-audit

The harness accumulates. This asks which parts of it are still earning their place.

**Attribution**: see `.source`.

---

## When it fires

Only when a human asks. A harness that audits itself unprompted starts proposing deletions in
the middle of someone's work, which is the surest way to have every proposal ignored.

The moment worth running it is periodic and deliberate: alongside `void-retrospective`, or before a
release, when there is appetite to actually remove something.

---

## Run it

```
void-harness audit
```

Or `npx voidharness audit` when the CLI is not on PATH.

It reads local mission events from `.void/machine/runs/<mission-id>/events.jsonl`, written by the
activation meter, plus read-only legacy usage logs. Everything is local; nothing is sent
anywhere.

---

## Read it

The report names components that have not fired recently, upstream sources that have deprecated
what a skill was distilled from, and conflicts between decisions. Three things to say about it,
in this order:

1. **What the data can support.** A skill absent from the events is a skill that did not fire in
   the observed window. It is not a skill nobody needs, and the difference is the whole
   interpretation. Say the window and the event count.
2. **What is worth proposing.** A deprecation, a fusion, a rewrite. One line each, with what it
   would cost to be wrong.
3. **What the data cannot support yet.** Insufficient events is a finding, not a failure: it
   means the harness has not been used enough in this project for the question to have an
   answer.

---

## What it must not do

**Nothing is applied.** Every output is a proposal; a human turns it into a pull request or
declines it. Auto-applying a deprecation from usage data would delete the skill that fires twice
a year and matters both times.

**No inference from silence.** A component absent from the events is absent from the events.

---

## Red flags

| Rationalization | Reality |
|---|---|
| "Nothing invoked it, remove it" | Removal is a human decision with its own reasoning. Propose it; say what breaks if the reading is wrong. |
| "Insufficient data, so the audit failed" | It succeeded and reported an absence of evidence. That is the honest answer. |
| "I'll open the PR while I'm here" | The proposal is the deliverable. The PR is a separate, deliberate act. |

---

## Composition

Upstream: the activation meter writes the events this reads. Adjacent: `void-retrospective` looks at a
window of engineering signals, this looks at the harness itself. Downstream: an accepted proposal
is filed through `void-learn`, which owns the HITL capture.
