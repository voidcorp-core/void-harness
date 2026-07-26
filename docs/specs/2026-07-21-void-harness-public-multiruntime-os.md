---
title: void-harness as a public, multi-runtime, multi-model harness OS
date: 2026-07-21
status: superseded
superseded_by: docs/specs/2026-07-24-void-harness-v3-top-tier-engineering-team.md
author: Folpe + Claude
related:
  - docs/specs/2026-06-26-harness-graph-viz.md
  - docs/specs/2026-07-01-graph-consumer-delivery.md
  - docs/decisions-log/2026-07-09-distribution-is-marketplace-only-the-cli-is-maintainer-tooli.md
---

# void-harness as a public, multi-runtime, multi-model harness OS

## 0. Intent

Redefine void-harness from "an opinionated Claude Code plugin" into **a development-doctrine
operating system for coding agents**. Its promise:

> Install a top-5% development doctrine on any project, run it across several agent runtimes and
> models, then show locally what is installed, actually active, effective, and worth improving.

Three dimensions are separated for the first time and must never be conflated again:

- **Agent runtime** — Claude Code, Codex, Hermes Agent, future agents. *How* the doctrine executes.
- **Model provider** — Anthropic, OpenAI-compatible, Ollama, custom base URL. *Which brain* runs it.
- **Harness** — the doctrine itself: capabilities, policies, triggers, hooks, evals, telemetry, state.

The single most important product distinction is the **five-state capability lifecycle**:

```
available -> installed -> verified -> used -> effective
```

An installed-but-never-used skill must no longer be presented as a fully available capability.

## 1. Target architecture (boundaries + data flow)

```
                          void-harness
                               |
                 Canonical Harness Contract
     capabilities (SKILL.md) · policies · triggers · enforcement specs · evals
                               |
        +----------------------+----------------------+
        |                      |                      |
   Claude adapter        Codex adapter          Hermes adapter        (+ future)
   (CLAUDE.md, hooks,    (AGENTS.md, tools,     (seam target; speced
    Skill tool, MCP)      shell)                 after reading its docs)
        |                      |                      |
        +----------------------+----------------------+
                               |
                    Model Provider Port
       (internal harness functions only — NOT a universal LLM proxy)
     Anthropic native · OpenAI-compatible · Ollama local · custom base URL
```

Load-bearing rules:

1. **The contract is authored once, in runtime-neutral form** — `SKILL.md` bodies + structured
   manifests + testable rules. Adapters *compile* it to each runtime's native format. No doctrine
   lives inside an adapter.
2. **Adapters are a first-class seam from day one** (Fork 4). Claude + Codex ship E2E first (they
   already exist as CLAUDE.md/AGENTS.md + hooks). Hermes is the *proof the seam holds*, delivered as
   a dedicated later phase — its adapter is speced only after reading
   `https://hermes-agent.nousresearch.com/docs/` (source-driven-development; never from memory).
3. **The Model Provider Port is minimal and internal** — it powers the harness's *own* functions
   (eval runner, any LLM-assisted maintainer task). It is **not** a universal proxy and does not try
   to normalize every provider feature. A declared capability matrix (below) states what each
   provider supports.
4. **Enforcement is two-tier** (Fork 1): a runtime-agnostic **CI floor** (the existing void-enforce
   Action) that every runtime inherits, plus **deep in-session PreToolUse** enforcement where the
   runtime supports it (Claude, Codex). A runtime's enforcement tier is declared, never masked.

### Model Provider Port — capability matrix

The port never pretends a provider does what it cannot. Each `(provider)` declares:

| provider | text | streaming | tools | structured output | vision | reasoning | usage/cost |
|---|---|---|---|---|---|---|---|
| anthropic | yes | yes | yes | yes | yes | yes | yes |
| openai-compatible | yes | yes | yes | yes | varies | varies | yes |
| ollama (local) | yes | yes | yes | yes | model-dep | model-dep | n/a (free) |
| custom base URL | declared per endpoint | | | | | | |

Internal functions request only capabilities they need; a provider missing one is skipped, not
crashed. Ollama documents OpenAI-compatible endpoints (streaming, tools, structured outputs), which
is the free local inference path — see `https://docs.ollama.com/api/openai-compatibility`.

## 2. The Capability contract

A **capability** is the unit the whole system reasons about. It is a structured manifest that lives
next to its `SKILL.md` (or is derived from an `always`-doctrine module). Schema:

```yaml
# capability.yaml (or frontmatter block in SKILL.md)
id: harness:tdd                 # stable identity
version: 0.18.0                 # lockstep harness version it was authored/certified at
runtimes: [claude, codex]       # runtimes this capability declares it supports (Fork 4)
activation: on-demand           # always | on-demand (existing graph-liveness field)
triggers:                       # machine-readable, drives activation scoring
  - kind: path
    match: "**/*.test.ts"
  - kind: intent
    match: ["write a test", "add a feature", "fix a bug"]
enforcement:                    # per-runtime map (Fork 1)
  floor: ci                     # every runtime: void-enforce Action replays the floor
  inline:                       # deep in-session enforcement, per runtime
    claude: pretooluse          # tdd-guard.sh blocks prod-before-test
    codex: pretooluse
    hermes: ci-only             # declared limitation, not hidden
evals:                          # certification inputs (Fork 3)
  targets:                      # the (runtime, provider/tier) cells this capability is proven on
    - { runtime: claude, provider: anthropic, tier: opus }
  method: with-without          # with/without delta + sensitivity test
  sensitivity: required         # prove the PROSE carries the signal, not the fixture
success_signal: "test-first commit pair present; mutation survivors addressed"
cost:                           # static context cost (tokens of the SKILL.md body)
  static_tokens: 2140
proof:                          # the certification record (frozen into the release manifest, Fork 5)
  verified: { at: 0.18.0, by: [struct, smoke] }
  effective:
    at: 0.18.0
    cells:                      # proven per declared target cell
      - { runtime: claude, provider: anthropic, tier: opus, delta: 0.31, confidence: high }
```

Rules:

- `runtimes`, `enforcement.inline.<runtime>`, and `evals.targets` are the three places the
  multi-runtime / multi-model reality is made explicit. A capability is only ever `effective` on the
  cells it declares and was proven on.
- `proof` is **not** computed on a consumer machine. It is authored/certified in this repo and
  **shipped frozen inside the release** (the certification manifest, §3). Consumers read it; they
  never re-run evals locally.
- No capability may claim a `proof` it does not have. A capability with an `effective` block whose
  eval did not pass, or with no `owner`, is a **governance blocker** (§6) — it caps the score.
- Governance: every capability declares an `owner` (a person/team accountable). No capacity without
  an owner and a proof status.

### The five states, defined precisely

| State | Meaning | Source of truth |
|---|---|---|
| `available` | exists in the catalog, could be installed | shipped catalog |
| `installed` | present in *this* project | local files / config |
| `verified` | correctly wired + passes structural check and cheap offline smoke | local check + shipped `proof.verified` |
| `used` | actually fired on real work *in this project* | local telemetry `.void/*.jsonl` |
| `effective` | proven to improve outcomes on a declared cell **and** exercised here | shipped `proof.effective` **joined with** local `used` |

`effective` in a project view = certified-centrally (frozen manifest) **AND** used-here (telemetry).
A capability certified `effective` in general but never fired here displays at `installed`/`verified`
— exactly the "installed but unused is not fully available" intent.

## 3. ProjectState

A versioned, **deterministic, LLM-free, offline** snapshot. It never runs an eval and never calls a
model. It is a pure join (Fork 5) of two inputs:

1. **Shipped certification manifest** (frozen at release, part of the published artifact): every
   capability's identity/version, declared runtimes/providers, enforcement tiers, and `proof`
   record.
2. **Local signals**: project files/config (`installed`), runtime detection, `.void/activations.jsonl`
   + `.void/outcomes.jsonl` telemetry (`used`), local smoke results (`verified`), void-enforce
   adoption (`enforcement`).

Persisted at `.void/state.json`, with history snapshots at `.void/history/<timestamp>.json`.

```jsonc
// .void/state.json
{
  "schemaVersion": 1,
  "harnessVersion": "0.18.0",
  "generatedAt": "<stamped by CLI, not by the pure core>",
  "score": {
    "global": 82,
    "confidence": "medium",          // driven by eval coverage + telemetry volume
    "capped": false,                 // true if a blocker forced <=69
    "blockers": []                   // integrity failures that cap the score (§6)
  },
  "dimensions": {                    // each 0-100, kind = blocker | gauge
    "installation":   { "score": 100, "kind": "blocker", "status": "pass" },
    "portability":    { "score": 66,  "kind": "gauge",   "detail": "claude+codex verified, hermes missing" },
    "activation":     { "score": 63,  "kind": "gauge",   "detail": "17 missed activations / 30d" },
    "efficacy":       { "score": 38,  "kind": "gauge",   "detail": "12/32 critical capabilities evaluated" },
    "enforcement":    { "score": 87,  "kind": "blocker", "perRuntime": { "claude": 100, "codex": 100, "hermes": 60 } },
    "dx":             { "score": 74,  "kind": "gauge" },
    "performance":    { "score": 74,  "kind": "gauge",   "detail": "4 context-heavy capabilities" },
    "governance":     { "score": 100, "kind": "blocker", "status": "pass" }
  },
  "runtimes": {
    "claude": { "detected": true, "verified": true },
    "codex":  { "detected": true, "verified": true },
    "hermes": { "detected": false, "verified": false }
  },
  "capabilities": [
    {
      "id": "harness:ticket-runner",
      "version": "0.18.0",
      "state": "effective",
      "usedCount": 14,
      "cells": [{ "runtime": "claude", "provider": "anthropic", "tier": "opus", "delta": 0.4 }]
    },
    { "id": "harness:qa", "version": "0.18.0", "state": "installed", "usedCount": 0, "note": "never verified" }
  ],
  "adoption": null,                  // populated only if opt-in telemetry is enabled (§7)
  "nextActions": [
    { "rank": 1, "title": "Add Hermes adapter E2E", "impact": "+8 portability" },
    { "rank": 2, "title": "Evaluate security-guidance", "impact": "+6 confidence" },
    { "rank": 3, "title": "Fix testing trigger misses", "impact": "+4 activation" }
  ]
}
```

The pure core computes everything except `generatedAt` (stamped by the imperative shell — the CLI —
so the core stays deterministic and testable; same functional-core / imperative-shell split the
graph kernel already uses). `nextActions` are ranked by score impact, computed deterministically from
the dimension gaps.

## 4. Runtime x capability x provider matrix

Three orthogonal axes, three concrete relations. All are derived from the capability manifests, not
hand-maintained.

- **runtime x capability** — does capability C support runtime R, and at what enforcement tier?
  Source: `capability.runtimes` + `capability.enforcement.inline.<R>`.
- **capability x provider** — on which provider/tier is C certified `effective`? Source:
  `capability.evals.targets` + `proof.effective.cells`.
- **runtime x provider** — which providers can drive runtime R? Source: adapter declaration (Claude
  → Anthropic; Codex → OpenAI-compatible; Hermes → its documented providers, filled after doc read).

Illustrative (values are examples, generated from manifests):

| capability | claude | codex | hermes | certified provider/tier |
|---|---|---|---|---|
| harness:tdd | pretooluse | pretooluse | ci-only | anthropic/opus |
| harness:ticket-runner | active | active | active | anthropic/opus |
| harness:security-guidance | pretooluse | pretooluse | ci-only | anthropic/sonnet |
| harness:qa (browser) | active | n/a | n/a | uncertified |

`n/a` (runtime cannot host it) and `uncertified` (no passing eval) are distinct and both shown
honestly. `graph audit` warnings feed the matrix but only integrity issues (missing owner, claimed
but absent proof) are blocking.

## 5. Install flow + postconditions

Primary entry (Fork 2), account-free, no API key, offline after fetch:

```
npx @voidcorp/harness init
```

Sequence:

```
detect project + stack
  -> detect installed runtimes (claude / codex / hermes)
  -> user selects one / several / all
  -> install local assets (adapter-compiled, transactional)
  -> run conformance checks (the shipped smoke suite)
  -> write ProjectState + print verified capabilities
```

**Postconditions (all must hold or the command fails closed):**

1. **Transactional** — success is fully valid or no state is written. A staging dir is assembled and
   atomically swapped; any failure rolls back, leaving zero partial state.
2. **`init` never returns 0 while `doctor` would be red** — fixes the current defect where `init`
   exits 0 but `doctor` fails. `init`'s final step *is* the doctor postcondition set; a red doctor →
   non-zero exit → rollback.
3. **< 2 minutes** on a warm cache.
4. **Offline after acquisition** — once the signed release artifact is fetched, no network is
   required to install, audit, or visualize.
5. **Reproducible from a signed release** — the artifact is a signed GitHub Release; install verifies
   the signature.
6. **Cross-platform** — macOS, Linux, Windows.

A standalone signed binary (GitHub Releases) complements `npx` for machines without Node.

Target command surface (built incrementally, §8):

```
void init                 void capabilities        void runtime add <runtime>
void status               void dashboard           void model add <provider>
void doctor               void adoption            # tier-1 telemetry pull (maintainer)
```

## 6. `void status` — exact terminal mockup

```
VOID PROJECT HEALTH                                      82/100   confidence: medium

Installation       PASS   transactional, reproducible
Runtimes           2/3    claude verified · codex verified · hermes missing
Doctrine           91%    58/64 capabilities installed
Activation         63%    17 missed activations over 30 days
Behavioral proof   38%    12/32 critical capabilities evaluated       (drives confidence)
Enforcement        87%    claude 100 · codex 100 · hermes 60 (ci-only, structural)
Efficiency         74%    4 context-heavy capabilities to optimize
Governance         PASS   every capability has an owner + proof status

CAPABILITIES
  effective  Implement ticket end-to-end        used 14x · opus/anthropic
  effective  Security audit                      used 2x  · sonnet/anthropic
  installed  Browser QA                          never verified
  n/a        Hermes execution                    runtime not installed

NEXT BEST ACTIONS
  1. Add Hermes adapter E2E                       +8 portability
  2. Evaluate security-guidance                   +6 confidence
  3. Fix testing trigger misses                   +4 activation
```

Differences from the brief's draft, all forced by the forks:

- A **confidence** field next to the score (Fork 6) — a high score on thin proof reads honest.
- Enforcement shows **per-runtime** numbers and labels Hermes' 60 as `ci-only, structural`, so a
  structural limit never reads as a failure (Fork 1 + 6).
- A **Governance** line (blocker dimension) — a claimed-but-absent proof or an ownerless capability
  turns this red and caps the global score at 69.
- Capability rows lead with the **five-state** word, not a checkmark, so `installed` vs `effective`
  is unmistakable.

When a blocker is red, the header shows `69/100 (capped: <blocker>)` so the cap is never silent.

## 7. Control Center (`void dashboard`)

A local app (offline, served on `localhost`, LLM-free) consuming the same `.void/state.json` +
`.void/history/*`. Views:

1. **Health** — the `void status` synthesis, graphically; score + confidence + blockers up top.
2. **Capabilities** — the five-state table, filterable by state / runtime / provider.
3. **Runtime x capability matrix** — §4, with enforcement tier per cell.
4. **Behavioral proof** — eval coverage, per-cell deltas, sensitivity results, regressions vs the
   previous release.
5. **Quality & enforcement** — floor adoption (void-enforce), per-runtime inline enforcement.
6. **Cost, context & efficiency** — static context cost per capability, context-heavy outliers.
7. **History** — score/dimension evolution across `.void/history/*` snapshots.
8. **Next actions** — impact-ranked backlog.
9. **Topology** — the existing 3D graph, **demoted to a secondary drill-down**, not the front door.

All views are pure renderers of the versioned snapshot (functional core / imperative shell), the same
split `apps/graph-studio` already uses.

### Adoption telemetry (opt-in, §2b)

Three tiers, all opt-in, transport is an *optional* VoidCorp endpoint never required at runtime
(preserves "offline" + "no mandatory VoidCorp service"):

- **Tier 1 (now, zero phone-home):** a maintainer `void adoption` command *pulls* npm download stats
  + GitHub Releases download counts / stars / traffic. Answers "who downloads" in aggregate.
- **Tier 2 (in scope, opt-in):** one disclosed anonymous ping on install/update (version, OS,
  detected runtime). `--no-telemetry` + first-run consent. Answers the activation funnel.
- **Tier 3 (deferred):** opt-in periodic upload of local meter *aggregates* (invocation counts per
  capability, runtime, version — never file content, project names, or secrets). Feeds the outbound
  self-evolution flywheel (`void audit`). Highest reputational cost → deferred until tier 1+2 leave a
  real unanswered question.

Opt-in is non-negotiable: on-by-default telemetry would forfeit the privacy-first, offline brand that
is itself the point of going public.

## 8. Migration strategy (no big bang)

Expand-contract from today's marketplace-only Claude-centric harness to the public multi-runtime OS.
Each phase ships and is usable on its own; nothing is removed before its replacement is live.

- **Phase A — Capability contract + certification manifest.** Add `capability.yaml` (or frontmatter)
  to existing skills; build the frozen certification manifest into the release. No behavior change
  for consumers yet. Backfills `proof` from the existing eval-harness. *Ships: the contract + a
  `graph`-style check that every capability has an owner + declared runtimes.*
- **Phase B — ProjectState + `void status`.** The deterministic join over the manifest + local
  telemetry. This is the highest-leverage vertical slice: it needs no runtime/provider work and
  turns the existing `.void/*.jsonl` meters into the five-state view. *Ships: `void status`.*
- **Phase C — Public distribution.** `npm publish @voidcorp/harness` + signed GitHub Releases binary;
  docs/help flip npx-primary; marketplace demoted to optional. ADR supersedes 2026-07-09. Tier-1
  adoption pull. *Ships: account-free `npx @voidcorp/harness init`.*
- **Phase D — Adapter seam + Codex E2E parity.** Extract the runtime-neutral contract compilation
  behind an adapter interface; bring Codex from documentary parity to E2E-verified. *Ships: two
  runtimes verified E2E.*
- **Phase E — Evals as a capability gate.** Deterministic evals PR-blocking; capable-model evals
  nightly/release-blocking; `effective` cells populate the manifest. Local Ollama smoke for
  `verified`. *Ships: behavioral proof drives the score.*
- **Phase F — Control Center.** Build `void dashboard` on the now-trustworthy data; graph becomes the
  Topology drill-down. *Ships: the local app.*
- **Phase G — Hermes adapter.** After reading the Hermes docs, implement + E2E-verify the third
  runtime as the proof the seam holds. Tier-2 telemetry opt-in. *Ships: three runtimes.*
- **Phase H — Model Provider Port + `void model add`.** Anthropic / OpenAI-compat / Ollama / custom
  for internal functions. *Ships: free local inference path for harness functions.*

Ordering rationale: prove the *state* is trustworthy (A, B) before making it public (C); make it
portable (D, G) around the parts that pay for themselves first; evals (E) gate quality before the
dashboard (F) advertises it.

## 9. ADRs required

Each is a non-obvious decision with a credible alternative, so each gets a dated
`docs/decisions-log/` entry:

1. **Public MIT, supersedes marketplace-only (2026-07-09).** Why the earlier deliberate non-publish
   is reversed by a changed premise (the CLI/status *becomes* the product; account-free install is a
   non-negotiable that the marketplace cannot satisfy). Moat relocated to private sibling repos +
   the telemetry flywheel.
2. **Two-tier enforcement; enforcement is a per-runtime capability attribute.** Why the floor moves
   to CI-agnostic while deep PreToolUse stays runtime-specific, and why a structural runtime limit is
   scored on its own ceiling rather than capping the global score.
3. **`effective` is certified on the declared paid tier, not the free-local model.** Why the free
   Ollama path is scoped to install/audit/visualize + smoke (`verified`) and not to the effectiveness
   gate; refines the brief's "free inference path" non-negotiable to "available, not required for the
   quality gate."
4. **ProjectState is a deterministic join of a frozen certification manifest + local signals.** Why
   evals never run on a consumer machine, and why `effective` in a project means certified-AND-used.
5. **Adapter seam first-class; Hermes deferred to a dedicated phase.** Why "3 runtimes E2E" is a
   trajectory the score rewards, not a day-1 gate, and why Hermes is speced only after its docs.
6. **Score = blockers (integrity) cap at 69; everything else is a maturity gauge with a confidence
   band.** Why a fresh install is "new, not broken."
7. **Adoption telemetry is opt-in, tiered, and never a runtime dependency.** Why on-by-default would
   forfeit the brand.

## 10. Risks, rejected alternatives, success criteria

### Risks

- **Certification staleness.** A frozen manifest can lie if a skill's prose changed without re-eval.
  Mitigation: the manifest is keyed by harness version; a prose change without a matching eval run is
  a governance blocker in CI.
- **Adapter divergence.** Three adapters risk drifting from the canonical contract. Mitigation: a
  **common conformance suite** every adapter must pass; the contract is the single source, adapters
  own no doctrine.
- **Eval cost.** Capable-model evals cost money. Mitigation: deterministic evals are PR-blocking and
  free; paid evals are nightly/release-blocking, not per-PR.
- **Public exposure of a not-yet-polished product.** Mitigation: phased; public distribution (C) only
  after state is trustworthy (A, B).
- **Windows parity.** The current hooks are bash. Mitigation: the CI floor is portable; in-session
  hooks degrade to the floor where a shell is unavailable, declared per runtime.

### Rejected alternatives

- **Universal LLM proxy.** Rejected — premature normalization; a minimal internal port + a declared
  capability matrix is enough (brief's own guidance).
- **Premium-gated doctrine.** Rejected — reintroduces an account for the value, contradicts
  account-free, protects already-public-derived prose.
- **All-3-runtimes E2E in the first delivery.** Rejected — score red from day one, and Hermes cannot
  be honestly speced before its docs are read.
- **`effective` on free-local model.** Rejected — false negatives make the terminal state noise.
- **Keep marketplace as the primary channel.** Rejected — requires a Claude account, fails the
  account-free non-negotiable.

### Success criteria (measurable)

A new developer can:

1. install free in **< 2 minutes** (`init` wall-clock, transactional, signed);
2. use it with **at least one runtime + one local model, no subscription**;
3. add Claude / Codex / Hermes **without reinstalling the project** (`void runtime add`);
4. run `void status`;
5. understand in **< 30 seconds**: where the project stands, what actually works, what it can do,
   what blocks top-5%, and which single action yields the most progress.

Additionally, machine-checkable: `init` never exits 0 with a red `doctor`; every capability has an
owner + proof status (governance gate green); the adapter conformance suite passes for every shipped
runtime; no capability claims a proof it lacks.

## 11. Phased vertical slices (deliverable order)

Same as §8 (A -> H), each a shippable vertical. The first three (A, B, C) are the spine and unblock
everything: contract -> state -> public. Only after this spec is approved do we proceed to
`harness:writing-plans` for Phase A (and a plan per subsequent phase), then `harness:ticket-writer`.

## 12. Out of scope (this spec)

- The Hermes adapter's internals (Phase G; requires its docs).
- The universal LLM proxy (explicitly rejected).
- Any auto-write into doctrine (HITL is absolute — every change is a deliberate commit).
- Cross-project telemetry aggregation beyond opt-in tier-3 aggregates (deferred).
