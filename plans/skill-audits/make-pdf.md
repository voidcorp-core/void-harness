---
skill: make-pdf
status: shipped
strategy: rebuild (REBUILD class — daemon -> marked + puppeteer, system Chrome)
target_loc: 400
actual_loc: 46
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

gstack `/make-pdf` produces publication-quality PDFs from markdown — used by DECLIK signed deliverables (Audit Pulse), so it cannot be lost at the gstack teardown. It depends on the gstack browse daemon. Rebuild it on the state-of-the-art path.

## Decision: marked + puppeteer-core on the system Chrome (not the CLI flag, not a hand-rolled parser)

A first pass used a hand-rolled markdown parser + the raw `chrome --headless --print-to-pdf` flag to avoid a dependency. Folpe rejected that as a band-aid ("pas de rustine, état de l'art"). The researched state-of-the-art for md->PDF in Node is **`marked` + Puppeteer** (e.g. `md-to-pdf`): `marked` for robust parsing, `puppeteer` `page.pdf()` for the print, which — unlike the CLI flag — gives **page-number footers**, `printBackground`, and precise margins.

- **Engine `apps/make-pdf/`** (`@voidcorp/make-pdf`): pure `render` (marked + sanitizer) + `print-css`, an impure `pdf` module (`puppeteer-core`, injectable `findChrome`), an async `cli`. Unit-tested (13 tests); typecheck strict.
- **`puppeteer-core`, not `puppeteer`**: no bundled Chromium download (nothing to fetch in CI); it drives the system Chrome `findChrome` locates. `page.pdf({ displayHeaderFooter: true, footerTemplate: '…pageNumber / totalPages…' })` numbers the pages.
- **System Chrome, no daemon**: a missing browser is an explicit non-zero exit, never silent (AC).

## Enabler: the floor fix (DEV-393 follow-up)

Adding `marked` + `puppeteer-core` changes `pnpm-lock.yaml`, which the server-side floor blocked wholesale — the harness monorepo could not add ANY dependency. Rather than hand-roll around it (band-aid) or permanently allowlist the lockfile (removes the protection), the floor itself was fixed: `ci-enforce.sh` now allows a lockfile change **accompanied by a package manifest change** (the reviewer-visible signature of a real `pnpm add`), while a lockfile changed alone stays blocked. See `docs/DECISIONS.md` (2026-07-10). That is the principled unblock.

## Kept / Rejected

- **Kept**: the `marked` pipeline; the **HTML sanitizer** (marked passes raw HTML through — a real trust boundary; re-authored with the same coverage); the print-CSS intent (metric-compatible sans stack rendering French diacritics on every OS, `break-inside: avoid`).
- **Rejected**: the browse-daemon dependency; all gstack runtime; the hand-rolled parser + CLI-flag first pass (band-aid).

## Verification (observed, not assumed)

- 13 unit tests (render: headings/tables/code/images, French diacritics, title derivation; sanitizer: script/iframe/on*/javascript: stripped; print-css: break rules + font stack; `findChrome`: detection with mocked env/fs).
- **Dogfood**: a French sample (H1, table with € + accents, TS code block, bold/italic/code, list) → a real **67 KB, 1-page PDF**; `pdftotext` confirms the content AND the **`1/1` page-number footer**. Observed.
- No-Chrome path: `CHROME_PATH=/nope` → explicit error, exit 1. Observed.
- Root `pnpm test` 889 (incl. the 13 here); typecheck strict clean; anti-bloat (skill 46 LOC, desc 184).

## Follow-ups
- Cover pages / auto-TOC if a deliverable needs them (puppeteer supports headerTemplate too).
- Bundling the engine for consumer projects (currently a monorepo app; consumers run it via the workspace).
