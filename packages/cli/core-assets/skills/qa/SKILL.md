---
name: qa
kind: action
activation: on-demand
description: "Live browser QA of a running web app via the claude-in-chrome MCP: systematic exploration, edge/error/empty states, atomic fix loop, evidence-backed report. Report-only mode available."
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# qa — voidcorp craftsman edition

You are a QA engineer AND a bug-fix engineer. Test a running web app like a real user — click everything, fill every form, check every state — using the **claude-in-chrome MCP** to drive the browser. When you find a bug, fix it in source with an atomic commit, then re-verify. Produce a structured report with before/after evidence.

This tests the *shipped, running app* through a real browser. It is not unit/E2E authoring (`harness:tdd` + `harness:testing` own that), and it does not judge visual craft from code (`harness:ui-review` owns that — this skill composes it for the live visual pass).

**Attribution**: see `.source`. Vendored from gstack `/qa` + `/qa-only` + the live half of `/design-review`, repointed off the gstack browse daemon onto the claude-in-chrome MCP already present in Claude Code. The gstack runtime (browse binary, gbrain/learnings, telemetry, `~/.gstack` artifacts, test-framework bootstrap) is rejected.

---

## When to invoke

- Verifying a running app after a change (the default: a feature branch, "does it actually work?").
- Auditing a deployed site for bugs and broken flows.
- A report-only pass (no fixes) before a review or handoff.

Do NOT use this to author a unit/E2E suite (`harness:tdd`/`harness:testing`), to audit UI craft from code (`harness:ui-review`), or to audit a dev-facing API/CLI/SDK surface (`harness:devex-audit`).

## Browser tooling: claude-in-chrome (load first)

The execution primitives are the `mcp__claude-in-chrome__*` tools. If they are deferred, load the core set in **one** ToolSearch call before anything else:

`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__gif_creator,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__read_network_requests`

Command mapping from the old gstack browse (`$B`) to the MCP:

| Need | claude-in-chrome tool |
|------|-----------------------|
| Session tab context (**call first**) | `tabs_context_mcp` |
| Open the target in a **new** tab | `tabs_create_mcp` |
| Navigate | `navigate` |
| Click / type / screenshot | `computer` |
| Fill a form field | `form_input` |
| Read DOM / accessibility tree | `read_page` |
| Console errors after an action | `read_console_messages` (filter with `pattern`) |
| Network (data-fetch 404s) | `read_network_requests` |
| Responsive viewport | `resize_window` |
| Record a repro | `gif_creator` |

## Hard constraints (claude-in-chrome reality)

- **`tabs_context_mcp` first**, every session. Never reuse a tab id from another session; open a fresh tab with `tabs_create_mcp` unless the user names a tab.
- **Permissions are per-site.** If a site is not authorized and permission is refused, STOP and tell the user which site to allow — never loop retrying the same denied call.
- **Never trigger a JS dialog** (`alert`/`confirm`/`prompt`) or a browser modal — they block the extension and kill the session. For repro debugging use `console.log` + `read_console_messages`, not `alert`. Warn the user before touching any element that may open one.
- **Not headless.** claude-in-chrome drives the user's real, interactive Chrome (already logged in — no cookie import, no `~/.gstack/chromium-profile`). QA in a cloud/cron session with no interactive Chrome is **out of scope** — an assumed limitation the browse daemon did not have; say so rather than faking it.
- After 2-3 failed tool calls, a page that will not load, or unexpected tangents: stop and ask the user, do not keep retrying.

## Modes

- **Diff-aware** (default on a feature branch with no URL) — read the branch diff, map changed files to affected pages/routes, detect the local dev server, test only those pages plus a homepage smoke. The common case.
- **Full** (a URL is given) — systematic exploration of every reachable page; 5-10 well-evidenced issues; health score.
- **Quick** (`--quick`) — 30-second smoke: homepage + top 5 nav targets, load + console + broken links only.
- **Regression** (`--regression <baseline.json>`) — run full, then diff against a prior baseline: fixed vs new vs score delta.
- **Report-only** (`--report-only`, the old `/qa-only`) — phases through Report, then STOP. No fix loop, no commits.

## Precondition: clean working tree

Each fix must be its own atomic commit, so before fixing, `git status --porcelain` must be empty. If dirty, ask the user to commit / stash / abort first (recommend commit — preserve their work before QA adds fix commits). Report-only mode may run on a dirty tree.

## Workflow

1. **Orient** — `tabs_context_mcp`, open the target in a new tab, screenshot, read the page, check console. Detect the framework (Next.js `__next` / `_next/data`; Rails `csrf-token`; SPA = client routing) and note it. For an SPA, map nav from `read_page` (client routes, not raw links).
2. **Explore** — visit pages systematically. Per page: visual scan of the screenshot; click interactive elements; fill + submit forms (empty, invalid, edge, overflow); walk navigation in and out; exercise **the states a user actually hits — empty, loading, error, overflow**; check console after every interaction; for responsive, `resize_window` then **verify the screenshot dimensions actually changed** — on some setups it resizes the window without re-rendering to a true mobile viewport, so confirm before trusting a "mobile" shot (else note responsive as unverified). Depth over breadth: more time on core flows (auth, checkout, search), less on static pages.
3. **Document** — write each issue the moment you find it, never batch. Two evidence tiers: an **interactive** bug gets a before-screenshot, the action, an after-screenshot (a `gif_creator` repro for a flow); a **static** bug gets one annotated screenshot. Verify a bug reproduces once before writing it. For a UI quality pass, capture mobile and desktop for every applicable state and bind each capture to the current diff hash; a later CSS/UI diff makes it stale. Redact credentials (`[REDACTED]`). Surface every screenshot to the user (Read the file) — otherwise it is invisible.
4. **Health score** — per-category 0-100 (Console, Links, Visual, Functional, UX, Performance, Content, Accessibility) minus severity deductions (critical -25 / high -15 / medium -8 / low -3), weighted average. Record it as the baseline.
5. **Visual pass** — for visual/interaction judgment on the live screenshots, compose `harness:ui-review`, then hand the current-diff evidence to `core:visual-craft-director` in fresh context. This skill drives the browser; `ui-review` supplies the craft bar; the specialist owns the independent verdict. If the browser or required captures are unavailable, report the UI pass blocked rather than certifying from prose.
6. **Triage** — sort by severity; fix per tier: `--quick` critical+high · standard (default) +medium · `--exhaustive` +low. Mark unfixable-from-source (third-party, infra) as deferred.
7. **Fix loop** (skipped in report-only) — per issue in severity order: locate source (grep/glob — only now do you read code); make the **minimal** fix (no refactor, no scope creep); commit one fix `fix(qa): <issue> — <desc>`; re-test the page with a before/after pair + console + a regression test that reproduces the bug (compose `harness:tdd`/`harness:testing` — assert behavior, not "it renders"); classify **verified / best-effort / reverted** (`git revert` on a regression → defer).
8. **Self-regulation** — every 5 fixes or after any revert, stop and evaluate: reverts, fixes touching many files, all-low-severity remaining, and unrelated-file edits all raise the "this is going wrong" signal. Above the threshold, or past a hard cap of ~50 fixes, STOP and show the user before continuing.
9. **Report** — issues with severity + evidence + fix status (verified/best-effort/reverted/deferred) + commit SHA; health-score delta baseline → final; a one-line PR summary ("QA found N, fixed M, health X → Y"). If the final score is worse than baseline, warn prominently. Write it under the project's report location, not `~/.gstack`.

## Composition & boundaries

- **With `harness:ui-review`** — this skill owns driving the browser and the functional/fix loop; `ui-review` owns the visual-craft judgment applied to the live screenshots (step 5). No restated design rules here.
- **With `harness:tdd` / `harness:testing`** — the regression test in the fix loop is authored per their discipline. This skill finds bugs in a running app; they own how the test that locks the fix is written.
- **Not `harness:devex-audit`** — that audits a developer-facing surface (API/CLI/SDK/docs journey, TTHW); this QAs an end-user web app in a browser. Different surface.
- **Not E2E authoring** — Playwright suites are `harness:testing`'s output; this is exploratory human-style QA of the deployed thing.
- **Supersedes** gstack `/qa`, `/qa-only`, and the live-screenshot half of `/design-review`.

## Anti-rules

- MUST NOT test by reading source — test as a user; read code only in the fix loop, to locate the bug.
- MUST NOT trigger a blocking JS dialog / modal — it kills the claude-in-chrome session.
- MUST NOT reuse a cross-session tab id, or assume a headless/CI browser — mark non-interactive sessions out of scope.
- MUST NOT bundle fixes — one atomic `fix(qa):` commit each; revert on regression.
- MUST NOT include credentials in the report — `[REDACTED]`.
- MUST NOT bootstrap a test framework or edit CI/CLAUDE.md — that is `harness:tdd`/`harness:testing`, not QA.
- MUST NOT vendor the gstack runtime (browse binary, gbrain/learnings, telemetry, `~/.gstack` artifacts, cookie-profile import).

## Final rule

```
Running app → load claude-in-chrome (tabs_context first) → orient → explore every state → document with
evidence → score → triage → atomic fix + regression test + re-verify → self-regulate → report.
Report-only stops before the fix loop. Otherwise → it is not voidcorp qa.
```

QA is the discipline of hitting the app the way a user will, before the user does — and, when it breaks, fixing it under the same evidence bar that found it.
