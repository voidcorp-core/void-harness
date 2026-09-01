# PROJECT-DOCTRINE.md — the full format

The reference for `.void/PROJECT-DOCTRINE.md`, the file that carries what is true of **your**
project. `void-harness init` seeds that file with a stub of a dozen lines, because it is imported
into every session with `@` and a form nobody has filled in is context that says nothing while
costing what a filled one would. This page is the long form, kept here where nothing loads it.

Universal rules — the ones that hold in any project — live in `.void/installed/PHILOSOPHY.md` and
are managed by the harness; to change one, open an issue on `voidcorp-core/void-harness` through
`void-learn`. Everything below is yours.

**Sections appear as you use them.** There is no order to respect and no section you owe: write
the heading when you have something to put under it, and delete one that stops being true.
`void-learn` creates the heading it needs when it is absent, and its section routing table decides
which one a captured rule belongs to.

Every example below is an **illustration of the shape**, not a record of anything. Nothing here
happened.

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
agent uses the same wording (composes with `void-domain-driven-design`).

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
it belongs in `.void/installed/PHILOSOPHY.md`, not here.

Format per rule:

- **<rule name>** : <verbatim wording>.
  - **Why** : <reason — incident, regulation, dependency quirk>.
  - **Enforced by** : <skill / hook / manual review / code-review skill>.

Shape of a rule, with a plausible one to show what each line carries:

- **Stripe webhook signature verification** : every Stripe webhook handler
  verifies the signature AND the timestamp window (≤ 5 minutes).
  - **Why** : the incident that made it a rule — a replayed webhook
    re-credited an account. Composes with `void-async-safety`.
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
  `apps/billing/` triggers `void-tdd` in **strict** mode even if the
  path heuristic would say souple.
- **LLM-cost gate on agent calls** : any LLM call in `apps/agents/` must
  include `// using <model> because <why>` if it uses Opus —
  composes with `void-llm-cost-discipline`.

(Add your own routing overrides or delete if no project-specific routing
is required.)

---

## Forbidden patterns specific to this codebase

Things THIS project has paid for and will never reintroduce. Universal
anti-patterns (DI containers, CQRS default, raw `process.env`, etc.) are
already in `.void/installed/PHILOSOPHY.md` — list here only what is project-local.

- **<pattern>** : do not <action> in `<path>`.
  - **Why** : <incident / ADR>.
  - **Replacement** : <what to do instead>.

(Add your own as incidents happen, or delete if not applicable.)
