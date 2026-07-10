---
skill: make-pdf
status: shipped
strategy: rebuild (REBUILD class — daemon -> system Chrome)
target_loc: 400
actual_loc: 48
activation: on-demand
phase: D
depends_on: []
composes_with: []
source_ticket: DEV-391
epic: DEV-383
audit_date: 2026-07-10
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `make-pdf`

## Need

gstack `/make-pdf` produces publication-quality PDFs from markdown — used by DECLIK signed deliverables (Audit Pulse), so it cannot be lost at the gstack teardown. But it depends on the gstack browse daemon. The cartography classifies it REBUILD: "1 script Chromium print" — markdown -> styled HTML -> `chrome --headless --print-to-pdf`.

## Decision: a TS package (`apps/make-pdf/`) + a lean skill, on system Chrome

- **Engine in `apps/make-pdf/`** (`@voidcorp/make-pdf`), a workspace package like `apps/eval-harness` — pure modules (render, print-css, chrome-detection) + an impure CLI shell. Unit-tested (14 tests, root `pnpm test` picks up `apps/**`); typecheck strict.
- **Lean `harness:make-pdf` skill** documents driving the CLI. The gstack source was a compiled tool with a SKILL.md wrapper; this keeps the same split.
- **System Chrome, no daemon**: `--headless=new --no-pdf-header-footer --print-to-pdf`. `findChrome` probes `CHROME_PATH`/`CHROME` then per-OS defaults; a missing browser is an explicit non-zero exit, never a silent failure (AC).

## Kept (load-bearing) / Rejected

- **Kept**: the `marked` md->HTML pipeline; the **HTML sanitizer** (untrusted markdown can embed raw `<script>`/`<iframe>`/`on*`/`javascript:` — a real trust boundary, re-authored with the same coverage); the print-CSS design intent (metric-compatible sans stack that renders French diacritics on every OS, `@page` margins, `break-inside: avoid` so tables/figures/code never split across a page).
- **Rejected**: the browse-daemon dependency (`browseClient.ts`); all gstack runtime.
- **One added dependency**: `marked@^14` — justified (robust table/code parsing; gstack used it), no lockfile hand-editing (regular `pnpm add`).

## Deferred (v1 scope cut)

Page-number footers, cover pages, and an auto TOC are NOT in v1: Chrome's CLI `--print-to-pdf` does not render `@page` margin-box counters (that needs Paged.js or the DevTools protocol). The skill documents this and the follow-up path. v1 renders clean, correctly-paginated documents, which is the AC.

## Verification (observed, not assumed)

- 14 unit tests pass (render: headings/tables/code/images present, French diacritics preserved, title derivation; sanitizer: script/iframe/on*/javascript: stripped; print-css: @page + break rules; chrome: detection with mocked env/fs).
- **Dogfood**: a French sample (H1, table with € and accents, TS code block, list) → a real 51 KB, 1-page `PDF document, version 1.4` via system Chrome. Observed.
- No-Chrome path: `CHROME_PATH=/does/not/exist` → explicit error message, exit 1. Observed.
- typecheck strict clean; anti-bloat (skill 48 LOC, desc ≤ 200, `.source` + this note).

## Follow-ups
- Page numbers / cover / TOC via Paged.js or CDP if a deliverable needs them.
- Bundling the engine for consumer projects (currently a monorepo app; consumers run it via the workspace).
