---
name: make-pdf
activation: on-demand
description: Turn a markdown file into a publication-quality PDF via system headless Chrome (--print-to-pdf), no gstack daemon. For signed deliverables (DECLIK audits). Use when a .md must become a clean PDF.
---

# make-pdf — voidcorp craftsman edition

Render a markdown file to a clean, paginated PDF using the **system** Chrome/Chromium headless print engine — no gstack browse daemon, no Puppeteer/Playwright. For French-language signed deliverables (DECLIK Audit Pulse), it keeps diacritics, tables, and code blocks intact and never splits a table or heading across a page.

The engine lives in `apps/make-pdf/` (a small TS package). This skill tells the agent how to drive it.

**Attribution**: see `.source`. Distilled from gstack `/make-pdf` (its `marked` pipeline + print-CSS intent + HTML sanitizer), rebuilt on system Chrome instead of the browse daemon.

---

## Run it

```bash
pnpm --filter @voidcorp/make-pdf make-pdf <input.md> [output.pdf] [--a4|--legal] [--margins=1in] [--title="..."]
```

- `output.pdf` defaults to the input's basename with a `.pdf` extension.
- Default page size is US letter; `--a4` / `--legal` switch it. `--margins` overrides the 1in default.
- The title (PDF `<title>`) defaults to the first `# H1`, else "Document"; `--title` overrides.

## What it does

1. `marked` parses the markdown to HTML.
2. A conservative sanitizer strips dangerous embedded HTML (`<script>`/`<iframe>`/`on*`/`javascript:` — untrusted markdown can carry raw HTML). This is a real trust boundary.
3. The body is wrapped with an inlined print stylesheet: a metric-compatible sans stack (Helvetica / Liberation Sans / Arial — renders French accents on every OS), `@page` margins, and `break-inside: avoid` on tables / figures / code so nothing splits across a page.
4. Headless Chrome renders it: `--headless=new --no-pdf-header-footer --print-to-pdf`. The `--no-pdf-header-footer` flag suppresses Chrome's default date/URL chrome; margins are governed by CSS `@page`.

## Requirements & failure modes

- **System Chrome or Chromium** must be installed (macOS: Google Chrome / Chromium / Edge; Linux: `google-chrome` / `chromium`). Set `CHROME_PATH` to override. If none is found, the CLI exits non-zero with an explicit message — never a silent failure.
- **Relative images** in the markdown resolve against the CWD at print time; use absolute paths or run from the markdown's directory.

## Scope (v1) and follow-ups

v1 renders clean, correctly-paginated documents. Deliberately deferred (they need Paged.js or the DevTools protocol, which Chrome's CLI `--print-to-pdf` does not expose): **page-number footers**, **cover pages**, and an **auto TOC**. Add them as a follow-up if a deliverable needs them — the gstack source had all three via the daemon.

**Known sanitizer limitation**: the `javascript:`-scheme strip matches the literal string, so an entity-encoded scheme survives. It is **inert here** — the HTML is printed to PDF, never interactively rendered, so nothing can fire it. Harden the sanitizer (decode entities first) before reusing it for any live-rendered surface.

## Anti-rules

- MUST NOT depend on the gstack browse daemon or any gstack runtime.
- MUST NOT add Puppeteer/Playwright while the `--print-to-pdf` flag suffices (YAGNI).
- MUST NOT fail silently when Chrome is absent — the error is explicit.
- MUST NOT trust raw HTML embedded in markdown — the sanitizer runs unconditionally.
