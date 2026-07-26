# PROJECT-DOCTRINE.md

> **This file is YOURS.** `void-harness init` creates it once with the
> template below. Subsequent runs of `init` will NEVER overwrite it.
> Edit freely. The `harness:learning-capture` skill appends to it (HITL strict).

This file holds **project-specific** rules and context only. **Universal**
rules (your global coding philosophy) live in `.void/PHILOSOPHY.md`
(managed by void-harness — to change them, propose a PR on the void-harness
repo via the `harness:learning-capture` skill's harness-gap branch).

The two files are imported into every Claude Code session via the
`@.void/PHILOSOPHY.md` and `@.void/PROJECT-DOCTRINE.md` references
in `CLAUDE.md`.

---

## Project context

Who and what is this codebase for? One or two paragraphs the agent can use
to calibrate decisions.

- **Product** : <what this project is>
- **Users** : <who uses it, how many, in what conditions>
- **What would break** : <the most expensive failure modes>
- **Current phase** : <pilot / scaling / maintenance / etc.>
- **Stable vs in-flight sub-systems** : <list>

(Replace this section with your real project context.)

---

## Domain language (ubiquitous vocabulary)

If the team uses specific terms for domain concepts, list them here so the
agent uses the same wording (composes with `harness:domain-driven-design`).

| Term | Meaning in this project |
|---|---|
| | |

(Add your domain terms or delete the table if there is no specific
vocabulary to enforce.)

---

## Trade-offs already decided (link to ADRs)

The agent MUST NOT re-litigate these. Each entry points to the rationale
in its own file under `docs/decisions/` (or equivalent) so future contributors can audit
the choice without paging the original team.

- `docs/decisions/<date>-<slug>--<id>.md` — <one-line summary of the decision>
- ...

(Add your decisions as they happen.)

---

## Project-specific hard rules

Rules that apply HERE only — usually because of a specific dependency,
incident, regulation, or domain constraint. If a rule is universal,
it belongs in `.void/PHILOSOPHY.md`, not here.

Format per rule:

- **<rule name>** : <verbatim wording>.
  - **Why** : <reason — incident, regulation, dependency quirk>.
  - **Enforced by** : <skill / hook / manual review / code-review skill>.

(Examples to seed, delete if not applicable:)

- **Stripe webhook signature verification** : every Stripe webhook handler
  verifies the signature AND the timestamp window (≤ 5 minutes).
  - **Why** : incident 2026-04-12 — a replayed webhook re-credited an
    account. Composes with `harness:async-safety`.
  - **Enforced by** : `withWebhookSafety` wrapper from
    `@voidcorp/pack-nextjs/async` + code review.

---

## In-flight decisions / open questions

Things the team has not yet decided. Useful for the agent so it asks
instead of guessing.

- <open question> — owner: <person>, deadline: <date>
- ...

(Add as they come up. Resolve to "Trade-offs already decided" once the
ADR is written.)

---

## Project-specific skill routing

Override default skill behavior for THIS project.

Examples:

- **Strict TDD on payment surface** : any change to `apps/checkout/` or
  `apps/billing/` triggers `harness:tdd` in **strict** mode even if the
  path heuristic would say souple.
- **LLM-cost gate on agent calls** : any LLM call in `apps/agents/` must
  include `// using <model> because <why>` if it uses Opus —
  composes with `harness:llm-cost-discipline`.

(Add your own routing overrides or delete if no project-specific routing
is required.)

---

## Forbidden patterns specific to this codebase

Things THIS project has paid for and will never reintroduce. Universal
anti-patterns (DI containers, CQRS default, raw `process.env`, etc.) are
already in `.void/PHILOSOPHY.md` — list here only what is project-local.

- **<pattern>** : do not <action> in `<path>`.
  - **Why** : <incident / ADR>.
  - **Replacement** : <what to do instead>.

(Add your own as incidents happen, or delete if not applicable.)
