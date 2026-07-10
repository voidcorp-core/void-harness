# gstack → void-harness coverage matrix

> Authoritative account of **every** gstack skill (53) and its destination in the void-harness,
> so the de-gstackification (epic DEV-383) has **no silent gaps**. Produced by the coverage audit
> of 2026-07-10, after Vagues 1-3 merged. Each skill is VENDORED, DEFERRED (with a ticket),
> KEEP-EXTERNAL (with an ADR), or DROP (documented). Any capability not here is a bug.

## Status legend

- **VENDORED** — distilled into a harness skill (merged).
- **DEFERRED** — a real capability postponed with an open ticket (Vague 4 browser re-point, or Vague 6 teardown).
- **KEEP-EXTERNAL** — deliberately not vendored, kept as an outside tool, with an ADR + exit/wake criterion.
- **DROP** — not carried: a harness duplicate, gstack-specific runtime, or out-of-scope (deploy = vercel plugin).

## The 53 skills

| gstack skill | Status | Destination / reason |
|---|---|---|
| plan-ceo-review | VENDORED | `plan-review` CEO lens (DEV-385) |
| plan-eng-review | VENDORED | `plan-review` Eng lens (DEV-385) |
| plan-design-review | VENDORED | `plan-review` Design lens (DEV-385) |
| plan-devex-review | VENDORED | `plan-review` DevEx lens (DEV-385) |
| autoplan | VENDORED | `plan-review` `all` mode (DEV-385) |
| office-hours | VENDORED | `brainstorming` pressure-test mode + 10x (DEV-386) |
| cso | VENDORED | `security-audit` (DEV-387) |
| ship | VENDORED | `ticket-runner` + `verification-before-completion` (DEV-388); VERSION/CHANGELOG → release-please |
| spec | VENDORED | `brainstorming` (precision) + `writing-plans` (executability gate) (DEV-388) |
| investigate | VENDORED | `systematic-debugging` (DEV-388) |
| design-review | VENDORED | `ui-review` (audit) + `frontend-design` (Krug) (DEV-389); live visual QA → `harness:qa` visual pass (DEV-390) |
| design-consultation | VENDORED | `frontend-design` + `ui-review`; DESIGN.md contract kept (DEV-389); rosters → forge |
| design-shotgun | VENDORED | `frontend-design`/`ui-review` + forge (DEV-389); comparison board → Vague 4 |
| retro | VENDORED | `retrospective`, gamification dropped (DEV-396) |
| qa | VENDORED | `harness:qa` — QA methodology re-pointed onto claude-in-chrome MCP (DEV-390) |
| qa-only | VENDORED | `harness:qa --report-only` mode (DEV-390) |
| browse | DROP | daemon not ported; QA methodology re-pointed to claude-in-chrome via `harness:qa` (DEV-390); daemon removed at Vague 6 teardown |
| scrape | DROP | claude-in-chrome `get_page_text`/`read_page` cover it natively; no dedicated skill (DEV-390) |
| setup-browser-cookies | DROP | claude-in-chrome uses the real logged-in Chrome; cookie import moot (DEV-390) |
| open-gstack-browser | DROP | dropped with the browse daemon (DEV-390) |
| make-pdf | VENDORED | `apps/make-pdf` (marked + puppeteer-core, system Chrome, page-number footers) + `harness:make-pdf` skill (DEV-391, merged) |
| devex-review | VENDORED | `harness:devex-audit` (audit ceiling: measured TTHW, error-path tracing, evidence-backed scorecard) (DEV-398); live browser driver → Vague 4 |
| ios-qa | KEEP-EXTERNAL / DEFERRED | ADR-0001 (defer until first iOS project); snapshot before Vague 6 teardown |
| ios-fix | KEEP-EXTERNAL / DEFERRED | ADR-0001 |
| ios-design-review | KEEP-EXTERNAL / DEFERRED | ADR-0001 |
| ios-sync | KEEP-EXTERNAL / DEFERRED | ADR-0001 |
| ios-clean | KEEP-EXTERNAL / DEFERRED | ADR-0001 |
| setup-gbrain | KEEP-EXTERNAL | ADR-0002 (keep until harness primitives prove sufficient) |
| sync-gbrain | KEEP-EXTERNAL | ADR-0002 |
| context-save | KEEP-EXTERNAL | ADR-0002 (cross-session handoff — served today by Claude memory + Linear + DECISIONS/ADRs) |
| context-restore | KEEP-EXTERNAL | ADR-0002 |
| learn | VENDORED (partial) | capture → `learning-capture`; obsolescence/prune → `void-harness audit` + `learning-capture`. Curate/prune mode is a small `learning-capture` extension if a live gap appears — no dedicated skill needed |
| review | DROP | harness duplicate → `code-review` skill |
| codex | DROP | review wrapper; cross-model second opinion is the proposed `/challenge` initiative (unticketed improvement) |
| health | DROP | harness duplicate → `retrospective` signals + `void-graph` (audit/cost/behavior) + `void-audit` |
| landing-report | DROP | ship queue dashboard — harness duplicate |
| document-generate | DROP | not carried (doc-gen out of core scope) |
| document-release | DROP | not carried (release doc = release-please) |
| benchmark | DROP | perf regression via browse daemon — out of scope |
| benchmark-models | DROP | not carried |
| plan-tune | DROP | gstack self-tuning runtime |
| skillify | DROP | gstack browser-skill codification runtime |
| pair-agent | DROP | gstack browser-sharing runtime |
| careful | DROP | harness hooks (`block-dangerous-bash`) |
| freeze | DROP | harness hooks |
| unfreeze | DROP | harness hooks |
| guard | DROP | harness hooks |
| connect-chrome | DROP | symlink duplicate of `browse` |
| gstack-upgrade | DROP | gstack self-update runtime |
| land-and-deploy | DROP | deploy = vercel plugin (`vercel:deploy`) |
| setup-deploy | DROP | deploy = vercel plugin |
| canary | DROP | post-deploy monitoring = deploy family → vercel plugin; out of harness scope |
| design-html | DROP | gstack-specific "Pretext-native" HTML output; the general capability (production HTML/CSS) is `frontend-design` |

## Summary

- **VENDORED** (merged, Vagues 1-4): 17 gstack skills → 6 new harness skills (`security-audit`, `plan-review`, `ui-review`, `retrospective`, `devex-audit`, `qa`) + folds into 7 existing skills. `qa-only` folds into `qa` as `--report-only`; the live half of `design-review` folds into `qa`'s visual pass. `learn` is covered by `learning-capture`/`void-audit`.
- **DEFERRED** (open tickets): 0 — `make-pdf` (DEV-391) and the browser family (DEV-390) are both merged. No open coverage ticket remains; only the Vague 6 teardown (DEV-395) is left, which removes rather than adds.
- **KEEP-EXTERNAL** (ADRs, accepted): 9 — iOS cluster (5) → ADR-0001; gbrain (4) → ADR-0002.
- **DROP** (documented): 24 — harness duplicates, gstack runtime, deploy family (vercel), gstack-specific output, and the browser daemon family (`browse`, `scrape`, `setup-browser-cookies`, `open-gstack-browser`) now that the QA methodology runs on the claude-in-chrome MCP.

**No silent gaps.** Every gstack capability is vendored, folded, ADR'd, or explicitly dropped. The last real
capability gaps at audit time — `devex-review` (live DX audit) and the QA browser family — are now vendored as
`harness:devex-audit` (DEV-398) and `harness:qa` (DEV-390, on the claude-in-chrome MCP). The
"deploy family" (`land-and-deploy`, `setup-deploy`, `canary`) is deliberately out of harness scope — deploy is
the vercel plugin's domain; if VoidCorp ever wants harness-native deploy, that is a new initiative, not a gstack
gap.

## Open HITL items (not gaps, but pending human decisions)

- **ADR-0001 / ADR-0002** (PR #88) — proposed; Folpe accepts by merging (merging = accepting in the ADR lifecycle).
- **4 forge issues** (DEV-389) — drafted, not filed (external-repo permission); Folpe files them or grants access.
- **DEV-390 / DEV-391 / DEV-398** — Vague 4 + the DX gap, open.
- **DEV-395** (Vague 6 teardown) — DESTRUCTIVE; runs only what the ADRs and this matrix sanction, on Folpe's explicit go. This matrix is its "what to preserve vs remove" source of truth.
