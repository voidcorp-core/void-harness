---
name: compounding
description: End-of-cycle ritual — after a merged feature/bugfix/refactor, name the reusable pattern learned, decide its scope, and route it. Use at cycle close or on a "deja vu" fix.
---

# compounding — voidcorp craftsman edition

Every Inc's compound engineering rests on one claim: each unit of work should make the next one easier. The default failure mode is the opposite — you fix the bug, you merge, you move on, and the *lesson* evaporates. The next person (or the next you) re-discovers it from scratch. This skill is the two-minute ritual that converts a finished cycle into a durable, routed lesson before the context is gone.

It does not store anything itself. It is a router: it names the learned pattern, decides where the pattern belongs, and hands it to the skill that owns that destination.

**Attribution**: see `.source` in this directory.

---

## The trigger

Invoke at two moments:

1. **Cycle close** — a feature, bugfix, or refactor just merged. Before starting the next task, stop for two minutes.
2. **"Deja vu"** — mid-work, you catch yourself solving something that feels *already seen*. That recognition is the signal that a pattern exists and was never captured.

Both are cheap. The whole ritual is bounded at ~2 minutes. If it takes longer, the lesson is probably a full plan or an ADR, not a captured pattern — escalate it elsewhere.

---

## The ritual — four steps

### Step 1 — Name the pattern, not the instance

Write one sentence that *generalizes*. The instance is "I fixed the null deref in `CheckoutSummary`." The pattern is the reusable shape behind it:

- "X always fails when Y" — a recurring failure mode.
- "This project expects Z" — a project convention you kept re-learning.
- "The harness should have caught W" — a missing guard in the doctrine itself.

If you cannot state the generalization in one sentence, you have an instance, not a pattern. Stop — go to "When to drop it" below.

### Step 2 — Decide the scope

Ask the same question `capture-rule` asks: *"If I started a new unrelated project tomorrow, would this lesson still apply?"*

| Answer | Scope | Destination |
|---|---|---|
| No — only this codebase | **Project rule** | `.void/PROJECT-DOCTRINE.md` |
| Yes — every voidcorp project | **Harness gap** | a GitHub issue on `voidcorp-core/void-harness` |
| It is true but trivial / one-off | **Disposable** | nowhere |

When the scope is genuinely ambiguous, surface the doubt to the user rather than guessing (see `capture-rule`'s "when in doubt" prompt). Do not route on a coin flip.

### Step 3 — Route to the owner skill

This skill writes nothing to doctrine. It delegates:

- **Project rule** → invoke **`capture-rule`**. It proposes the wording, waits for explicit confirmation, and writes to `.void/PROJECT-DOCTRINE.md`. The HITL gate lives there.
- **Harness gap** → follow **`harness-evolution`** mode `feedback`: once it clears that skill's agnostic + harness-worthy bar, file it directly as a GitHub issue on `voidcorp-core/void-harness` (drafted, confirmed, then `gh issue create`). The tracker is the triage zone — owned by `harness-evolution`, not here.
- **Disposable** → nothing. A throwaway note in chat is fine; the doctrine stays clean.

### Step 4 — HITL is absolute

This skill PROPOSES a capture. It never writes into doctrine on its own, and it never auto-promotes a harness proposal. The routing decision is surfaced; the destination skill enforces its own human gate. Silence is not consent.

---

## Boundary — compounding vs capture-rule vs harness-evolution

These three are deliberately distinct. compounding sits *upstream* of the other two and feeds them; it does not replace either.

| Skill | Owns | When |
|---|---|---|
| **capture-rule** | Writing a *known* project rule into `.void/PROJECT-DOCTRINE.md` | The user states a persistent project rule, on demand. |
| **harness-evolution** | The *mechanism* of inbound feedback / outbound audit + obsolescence detection for the harness | A harness gap is perceived, or a periodic audit runs. |
| **compounding** (this) | The *end-of-cycle ritual* that extracts the reusable pattern *learned* (not the bug fixed), decides its scope, and routes it | A cycle closes, or a "deja vu" fix recurs. |

The dividing lines:

- **capture-rule starts from a known rule**; compounding starts from a *finished piece of work* and has to *discover* whether a rule even exists. capture-rule is the writer; compounding is the extractor that decides whether to call the writer.
- **harness-evolution owns the feedback machinery** (the proposal format, the CLI, the audit, the PR flow). compounding never reimplements that machinery — when the pattern is a harness gap, it hands off into harness-evolution's `feedback` mode and stops. compounding adds the *occasion* (the ritual moment) and the *triage* (which of the two destinations); the plumbing belongs to the other two.
- A lesson that is purely a project rule the user already articulated, with no extraction needed, should go straight to `capture-rule` — compounding adds nothing. compounding earns its keep only when the lesson has to be *named and triaged* first.

Rule of thumb: if you are *deciding where a lesson goes*, you are in compounding. If you are *writing a project rule*, you are in capture-rule. If you are *operating the feedback or audit machinery*, you are in harness-evolution.

---

## Rationalizations

| Excuse | Reality |
|---|---|
| "I'll remember this next time." | You won't, and neither will the next person. The cost of forgetting is paid every cycle; the cost of capturing is two minutes once. |
| "It's too small to write down." | Then it is disposable — say so and drop it. The skill is not "capture everything"; it is "decide, then route or drop." |
| "I'll capture it later when I have time." | Later is after the context evaporated. The pattern is sharpest at cycle close. Capture now or accept the loss. |
| "This is obviously a harness gap, I'll just PR it." | Routing to a PR directly skips the consumer-project proposal trail that gives reviewers the real-usage motivation. Go through harness-evolution `feedback`. |
| "I'll just write the rule into doctrine myself." | No auto-write, ever. Route to capture-rule and let its HITL gate run. |
| "Every fix teaches something — I'll log them all." | Logging instances is noise. Noise erodes trust in the doctrine the same way a false-positive hook does. Only the *generalizable* pattern earns a slot. |

---

## When to drop it (anti-capitalization)

Capitalizing trivial instances is worse than capturing nothing: it bloats `PROJECT-DOCTRINE.md`, dilutes the signal, and trains everyone to skim past it. Drop the lesson when:

- It is a one-off that will not recur (a typo, a one-time data migration quirk).
- It is already covered by an existing skill, rule, or hook — re-check before adding.
- It cannot be stated as a generalization (Step 1 failed).
- It is genuinely "nice to know" but changes no future behavior.

A clean doctrine is the asset. Every entry must earn its place by changing what happens next time.

---

## Composition with other skills

- **`capture-rule`** — downstream destination for project-scoped patterns. compounding decides; capture-rule writes (with its own HITL gate).
- **`harness-evolution`** (mode `feedback`) — downstream destination for harness-scoped gaps. compounding decides; harness-evolution owns the proposal + promotion machinery.
- **`verification-before-completion`** — upstream: a cycle is not "closed" (and the ritual should not run) until the work is actually verified done.
- **`commit-discipline`** — the merge that closes the cycle is the natural trigger point; a captured project rule is then committed with a `docs(doctrine):` commit (by capture-rule's flow, not here).
- **`code-review`** — a review finding that recurs across PRs is a strong "deja vu" signal that a pattern wants capturing.

---

## Anti-rules

- MUST NOT write into `.void/PROJECT-DOCTRINE.md` directly — route to `capture-rule`.
- MUST NOT open or promote a harness PR directly — route to `harness-evolution` mode `feedback`.
- MUST NOT reimplement the feedback proposal format, the CLI, or the audit — those belong to `harness-evolution`.
- MUST NOT capitalize trivial or one-off instances — drop them.
- MUST NOT auto-apply any captured lesson — every capture passes a human gate in its owner skill.
- MUST NOT run on an unfinished cycle — wait for verified completion.

---

## Verification

Before considering the ritual complete:

- [ ] The lesson is stated as a *generalization* (a pattern), not an instance.
- [ ] Scope was decided explicitly: project rule / harness gap / disposable.
- [ ] If project rule → handed to `capture-rule` (not written here).
- [ ] If harness gap → proposal written in `harness-evolution`'s `feedback` format, in the consumer project.
- [ ] If disposable → dropped, nothing written.
- [ ] No instance was capitalized as a rule.
- [ ] No doctrine file was auto-written by this skill.

---

## Final rule

```
Cycle closes → name the pattern → decide scope → route to capture-rule or harness-evolution, or drop it.
Otherwise → it is not voidcorp compounding.
```

The harness compounds when each cycle makes the next easier — but only the learned *pattern* compounds, routed deliberately, never the raw instance dumped into doctrine.
