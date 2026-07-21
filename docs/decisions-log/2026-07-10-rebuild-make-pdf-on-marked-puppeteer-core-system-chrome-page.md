---
date: 2026-07-10
title: "rebuild make-pdf on marked + puppeteer-core (system Chrome, page numbers), not a band-aid (DEV-391)"
---

## 2026-07-10: rebuild make-pdf on marked + puppeteer-core (system Chrome, page numbers), not a band-aid (DEV-391)

De-gstackification Vague 4 (epic DEV-383), REBUILD. gstack `/make-pdf` produces the PDFs DECLIK signed
deliverables depend on, via the browse daemon. A first pass rebuilt it with a hand-rolled markdown parser + the
raw `chrome --headless --print-to-pdf` flag to avoid a dependency; Folpe rejected that as a band-aid ("pas de
rustine, état de l'art"). Rebuilt on the researched state-of-the-art path instead.

- **`marked` + `puppeteer-core`** (the standard md->PDF pipeline, e.g. `md-to-pdf`): `marked` for robust
  parsing; `puppeteer-core` drives the **system** Chrome (no bundled Chromium download) and prints via
  `page.pdf()`, which — unlike the CLI flag — gives **page-number footers** (`pageNumber`/`totalPages`),
  `printBackground`, and precise margins. Source-driven against the Puppeteer PDFOptions docs.
- **Engine `apps/make-pdf/`**: pure `render` (marked + the kept HTML sanitizer — marked passes raw HTML through,
  a real trust boundary) + `print-css`, an impure `pdf` module (injectable `findChrome`), an async CLI. 13 unit
  tests + a dogfood PDF (observed: 67 KB, `1/1` footer, French accents, table with €, code).
- **Enabled by the floor fix above**: the two deps change the lockfile; rather than hand-roll around the floor
  (band-aid) or permanently allowlist the lockfile (removes protection), the floor learned the
  manifest-accompaniment rule. Principled unblock.
- **Chrome absent -> explicit non-zero exit**, never silent (AC).

Why: make-pdf is load-bearing for revenue deliverables; it must be état-de-l'art, not a stopgap. `marked` +
Puppeteer is the standard, it restores page numbers the CLI flag could not do, and `puppeteer-core` keeps CI
light (no Chromium download).
