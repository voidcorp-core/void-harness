---
title: Deliver the installed harness cheat sheet
date: 2026-09-13
status: executing
spec: docs/specs/2026-09-13-installed-cheatsheet.md
ticket: DEV-532
author: Folpe + Codex
high_risk: false
---

## Goal

Deliver `void-harness cheatsheet [--format html|markdown|json]` from one
authoritative projection. The default is a self-contained HTML document on
stdout, readable offline and without JavaScript. It explains the catalogue,
local availability and invocation without writing project or machine state.
Folpe approved the written spec on 2026-09-13. Folpe explicitly approved this plan on 2026-09-13.

## Grounding and boundaries

- Base: fetched `origin/develop`, `4ab3d56b`, including DEV-520 / PR 374.
- `packages/cli/src/main.ts` owns command dispatch;
  `packages/cli/src/commands/help.ts` separately owns help text today.
- `scripts/build-cheatsheet.mjs` generates the source Markdown reference. It
  is not imported by the distributed command. The source Linear index stays out.
- `packages/core/data/model.json`, `catalog.v3.json` and `certification.json`
  carry catalogue and certification facts; packaged copies live in
  `packages/cli/core-assets/data/`. Reuse their canonical parsers and identities.
- `packages/cli/src/lib/specialists/load.ts` validates canonical contracts;
  their `appliesWhen` and `stages` provide specialist trigger information.
- `packages/cli/src/commands/status.ts` computes availability but also writes
  history and resolves registry freshness. Never call it from the cheat sheet.
- `packages/cli/src/lib/project-roots.ts`, `receipts.ts`, `config-schema.ts`
  and runtime adapters own installation roots and local evidence contracts.

Keep the pure projection and renderers in the CLI's `lib/cheatsheet/` boundary;
the command is the I/O adapter. No graph schema migration, dependency addition,
version change, lockfile edit or source maintenance import is required.
Before implementation, record the approved projection ownership decision with
`void-harness decisions new`, using the existing decision workflow, and document
it in `docs/ARCHITECTURE.md`. Accepted earlier decisions remain immutable.

## Steps

### Step 1 - Export the complete catalogue as JSON through the real CLI

- **Goal**: the smallest useful slice prints every canonical capability and
  invocation from a packed CLI in a project with no installation.
- **Depends on**: none.
- **TDD mode**: strict.
- **Files**: add `packages/cli/src/lib/command-catalog.ts` and its `.test.ts`;
  add `packages/cli/src/lib/cheatsheet/catalog.ts`, `load.ts` and paired tests;
  add `packages/cli/src/commands/cheatsheet.ts` and `.test.ts`;
  update `packages/cli/src/main.ts`, `commands/help.ts`, `commands/help.test.ts`.
- **Behavior**: share command metadata between help and this projection. Test
  dispatch parity including aliases and self-help routing. Enumerate skills,
  hooks and agents from shipped catalogue metadata, and specialists through
  their canonical loader. Link specialist roles to agent implementations.
  Hook events and matchers come from shipped wiring, never an editorial list.
  Missing trigger metadata is explicitly undeclared. Preserve descriptions.
- **Contract**: JSON schema version 1; canonical IDs appear once, in stable
  code-point order. Reject duplicate IDs and invalid shipped metadata with
  nonzero exit and a path-free corrective stderr diagnostic. No installation
  still returns the full catalogue and an explicit absent local state.
  Reject unknown, missing, repeated or positional format arguments with exit 2.
- **Verification gate**: focused tests pass after observed red; fixture addition
  appears without renderer changes; every dispatched command is represented;
  JSON parses with no banner or diagnostic on stdout; package typecheck passes.
- **Expected commits**: `test(cheatsheet): define catalogue CLI contract`, then
  `feat(cheatsheet): export the authoritative catalogue`.

### Step 2 - Explain availability from existing local evidence

- **Goal**: the JSON command correctly answers what is available here without
  refreshing any state or running runtime probes.
- **Depends on**: Step 1.
- **TDD mode**: strict.
- **Files**: add `packages/cli/src/lib/cheatsheet/availability.ts` and its test;
  extend `lib/cheatsheet/load.ts`, `catalog.ts` and command tests. Reuse the
  root resolver, receipt/config validation and runtime evidence readers above.
- **Behavior**: retain per-runtime availability and reasons. Distinguish absent
  installation, installed, disabled, inactive pack, unsupported runtime and
  unknown evidence. Configuration alone never yields runtime-verified status.
  Missing/corrupt/unreadable evidence remains unknown. Do not silently classify
  a corrupt receipt as an uninstalled project. Command availability describes
  the running CLI separately from installed agent assets.
- **Safety**: bounded reads using existing reader limits; new reads declare
  finite byte/file limits and test limit+1 refusal before parsing. Select only
  allowlisted export fields. Never serialize raw config, paths or journal data.
  Resolve linked worktrees through the existing installation-root contract.
- **Verification gate**: real temporary-project tests cover no install, both
  runtimes, disabled skill, inactive pack, corrupt evidence and linked worktree.
  Before/after tree-byte comparisons prove zero command writes. A canary path
  and canary project content never appear in output or diagnostics. No network
  or runtime process is invoked. Focused tests and package typecheck pass.
- **Expected commits**: `test(cheatsheet): cover local availability evidence`,
  then `feat(cheatsheet): explain installed availability without effects`.

### Step 3 - Deliver the offline HTML and Markdown experience

- **Goal**: all three formats expose the same information, with the default
  HTML supporting the ticket's three views, filtering, copying and printing.
- **Depends on**: Step 2.
- **TDD mode**: strict for rendering/escaping and CLI contracts; souple for CSS.
- **Files**: add `packages/cli/src/lib/cheatsheet/render.ts` and its test,
  `html.ts` and its test; extend command tests. Add small adjacent presentation
  modules only where necessary to keep rendering, styling and interaction clear.
- **Behavior**: semantic native form controls for catalogue/here/intent views,
  search, runtime/pack/type filters, count, reset and actionable empty state.
  The intent view searches the existing descriptions and triggers. Static
  catalogue HTML remains readable without JS. Inline enhancement copies plain
  text, announces success only after completion, and exposes denial feedback.
  System fonts; no fetches, external assets, server or framework.
- **Safety**: escape text in HTML and Markdown; hostile markup, quotes,
  closing script tags and URL-like metadata remain inert. Use text nodes for
  dynamic feedback; do not interpolate metadata into executable JS or CSS.
- **Verification gate**: tests compare identities, descriptions, triggers and
  local states across all formats. Browser inspection of the actual local file
  at 390 px and 1440 px verifies all views, composed filters, no-results/reset,
  keyboard focus, 44 px targets, clipboard denial, no-JS and print preview.
  Record screenshots and observed results; zero unexpected network requests.
- **Expected commits**: `test(cheatsheet): define offline document behavior`,
  then `feat(cheatsheet): render accessible offline reference documents`.

### Step 4 - Verify the packed consumer and ship the single ticket

- **Goal**: prove the delivered package works offline, document it, and submit
  the complete candidate to the existing ticket review and merge process.
- **Depends on**: Step 3.
- **TDD mode**: strict for packed behavior tests; souple for documentation.
- **Files**: extend `test/cli/self-contained.test.ts` and add
  `test/cli/cheatsheet.test.ts`; update `README.md`, `packages/cli/README.md`
  and `docs/ARCHITECTURE.md`. Keep `test/cheatsheet/cheatsheet.test.ts` and the
  existing source-document generation gate passing.
- **Verification gate**: packed CLI runs all formats offline with no source
  checkout or extra runtime dependency. Run `pnpm verify` on the candidate,
  including typecheck, tests, build and generated-artifact checks. Require
  current CI and independent review of the complete diff, resolving blockers.
  Reuse existing verification ownership; add no duplicate gate or test retry.
- **Expected commits**: `test(cheatsheet): prove packed offline exports`, then
  `docs(cheatsheet): explain installed capability discovery`.
- **Delivery**: PR carries detailed evidence and limitations. Linear receives
  operational status and PR/CI links only; refresh the source index after each
  confirmed write. Done means merged and verified, never merely generated.

## Review checkpoints

### Preparation review dispositions

The eight independent preparation reviews passed. The two low-severity
recommendations are accepted as verification criteria for Step 3:

- Measure text/control contrast, 200% text enlargement and 320 px reflow.
  Inspect accessible names, result/copy announcements and focus preservation
  with assistive browser evidence; name any unavailable screen-reader evidence.
- Exercise realistic intent searches against the same catalogue: "failing
  test" should find debugging/TDD guidance; "public API" should find interface
  design guidance; "review" should expose relevant review roles and their
  invocation. These are acceptance examples, never an extra capability registry.

### Source grounding before implementation

Zod resolves to 4.4.3. Its version-pinned
[schema reference](https://raw.githubusercontent.com/colinhacks/zod/v4.4.3/packages/docs/content/api.mdx)
governs validation. The Node 22 filesystem contract governs bounded descriptor
reads; a size check alone does not bound a growing file's subsequent read.

The [Claude skill settings contract](https://code.claude.com/docs/en/skills#override-skill-visibility-from-settings)
defines `skillOverrides` in project and local settings, including `off` and
`user-invocable-only`. It excludes plugin skills. Do not infer disabled status
from a missing file, an inactive pack or manual-only invocation.
Codex's documented disable setting is in the user's configuration; this command
does not read home-directory configuration. Effective visibility beyond local
evidence remains unknown. Installation and runtime verification stay separate.

The [Clipboard contract](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)
requires a fulfilled promise before reporting success. Local-file clipboard
availability is browser-dependent, so selection and explicit denial feedback
are part of the required path, not an exceptional untested fallback.

Folpe reviewed and approved this written plan on 2026-09-13. No additional
intermediate approval is introduced inside these four steps. The review and
merge policy already authorized for the cluster remains applicable; this plan
does not grant promotion to `main` or weaken exact-candidate verification.

## Execution handoff

Implementation and automated consumer proofs are present on the feature branch.
Observed RED/GREEN cycles cover catalogue/CLI, local evidence, rendering,
hook-owner syntax, subdirectory discovery and missing specialist sources.
The packed npm archive exports all formats without a source checkout and fails
with empty stdout plus a path-free diagnostic when its specialists are missing.
Whole-inventory tests compare canonical identities in all three formats and
exercise bidirectional specialist/agent links. Real linked-worktree tests compare
tree bytes before and after inspection.

Folpe approved isolated Playwright CI on 2026-09-13. The follow-up replaces
personal-browser inspection with regenerated synthetic consumer documents on a
GitHub-hosted runner, consuming the same SHA/digest-verified archive as install
conformance. No developer HTML, home directory or browser profile is transferred,
and the connected browser's local-file refusal remains intact.

The new `browser conformance` job owns behavioral browser checks and attaches
mobile/desktop, keyboard, empty, clipboard-denial, 320 px reflow, doubled-text,
print PDF and no-JavaScript evidence. axe checks automatically detectable WCAG
violations. One worker and zero retries preserve failure evidence. The source-only
QA tooling and its complete dependency graph are version-pinned separately from
the consumer package. See `test/browser/README.md` for the reproducible run and
review contract, and the isolated consumer browser CI ADR.

Browser execution and visual review of the candidate artifacts remain required
before claiming those proofs. Native screen-reader interaction remains a named
manual evidence gap. The clipboard-denial test is an explicit browser API double,
not a claim about an operating-system permission dialog.

All eight fresh-context preparation reviews of this increment found no substantive
blocker. Four native roles returned contract v2 while the controller expected v1;
those events were recorded failed, not coerced to passes. SHA-verified file packs
were an explicit transport deviation. Canonical team certification remains
unverified until compatible contracts can certify the candidate. Do not conflate
that tooling limitation with green tests or with a completed merge gate.

| Order | Unit | Dependencies | Estimate | Human gate |
|---|---|---|---|---|
| CS-01 | DEV-532, Steps 1-4 in order | No native blockers on 2026-09-13 | M (tracker) | Written plan review; existing promotion policy |

This remains one provider-owned unit, not four new tickets. Linear owns claims
and mutable progress. Re-fetch the complete issue and relations before claiming
it and starting `void-implement`; do not derive its state from this document.
