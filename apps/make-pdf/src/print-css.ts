/**
 * Print stylesheet for the PDF. Pure: options in, CSS string out.
 *
 * Distilled from gstack make-pdf's print-css (design decisions kept, not the
 * code): a metric-compatible sans stack that renders Latin diacritics (French
 * accents) cleanly on every OS, 1-inch margins via `@page`, flush-left body,
 * and break-avoid rules so tables / figures / headings never split across a
 * page. Page-number margin boxes are intentionally omitted: Chrome's CLI
 * `--print-to-pdf` does not render `@page` margin-box counters (that needs
 * Paged.js or the DevTools protocol) — a deliberate v1 scope cut, see the skill.
 */

export interface PrintCssOptions {
  /** `letter` (default), `a4`, `legal`. */
  pageSize?: 'letter' | 'a4' | 'legal';
  /** CSS margin shorthand. Default `1in`. */
  margins?: string;
}

// Metric-compatible sans: Helvetica (macOS), Liberation Sans (Linux, ships via
// fonts-liberation), Arial (Windows). All render French diacritics correctly.
const SANS = `Helvetica, "Liberation Sans", Arial, sans-serif`;
// Monospace for code: the OS defaults all cover Latin-1.
const MONO = `"SF Mono", "Liberation Mono", "DejaVu Sans Mono", Consolas, monospace`;

export function printCss(opts: PrintCssOptions = {}): string {
  const size = opts.pageSize ?? 'letter';
  const margin = opts.margins ?? '1in';
  return `
@page { size: ${size}; margin: ${margin}; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: ${SANS};
  font-size: 11pt;
  line-height: 1.5;
  color: #1a1a1a;
  text-align: left;
  margin: 0;
}

h1, h2, h3, h4 { line-height: 1.25; break-after: avoid; text-wrap: balance; }
h1 { font-size: 20pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 18pt 0 8pt; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; }
h4 { font-size: 11pt; margin: 12pt 0 4pt; }

p { margin: 0 0 10pt; text-align: left; }
a { color: #1a1a1a; text-decoration: underline; }

ul, ol { margin: 0 0 10pt; padding-left: 1.4em; }
li { margin: 2pt 0; }

blockquote {
  margin: 10pt 0;
  padding: 2pt 0 2pt 14pt;
  border-left: 2pt solid #ccc;
  color: #555;
}

code {
  font-family: ${MONO};
  font-size: 9.5pt;
  background: #f4f4f4;
  padding: 1pt 3pt;
  border-radius: 2pt;
}
pre {
  font-family: ${MONO};
  font-size: 9pt;
  line-height: 1.4;
  background: #f6f6f6;
  border: 1pt solid #e2e2e2;
  border-radius: 3pt;
  padding: 8pt 10pt;
  margin: 10pt 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: inherit; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 12pt 0;
  font-size: 10pt;
  break-inside: avoid;
}
th, td { border: 1pt solid #ccc; padding: 5pt 8pt; text-align: left; vertical-align: top; }
th { background: #f0f0f0; font-weight: bold; }

img { max-width: 100%; height: auto; break-inside: avoid; }
figure { margin: 12pt 0; break-inside: avoid; }
figcaption { font-size: 9pt; color: #666; margin-top: 4pt; }

hr { border: none; border-top: 1pt solid #ddd; margin: 16pt 0; }

/* Keep content whole: no widowed/orphaned lines, no split blocks. */
p, li, blockquote { orphans: 3; widows: 3; }
`.trim();
}
