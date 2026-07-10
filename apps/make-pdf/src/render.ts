/**
 * Markdown -> full HTML document. Pure, deterministic, no I/O.
 *
 * Pipeline: marked parses md -> HTML, a conservative regex sanitizer strips the
 * dangerous element/attribute blacklist (untrusted markdown can embed raw HTML),
 * then the body is wrapped in a document with the print CSS inlined. The
 * sanitizer coverage is kept load-bearing from gstack make-pdf; the assembly is
 * re-authored lean (no cover/TOC/watermark — those are follow-ups, see the skill).
 */

import { marked } from 'marked';
import { printCss, type PrintCssOptions } from './print-css.js';

export interface RenderOptions extends PrintCssOptions {
  markdown: string;
  /** Overrides the `<title>` (else the first H1, else "Document"). */
  title?: string;
}

export interface RenderResult {
  /** Full HTML document, ready for Chrome to print. */
  html: string;
  /** Just the rendered+sanitized body (for tests/snapshots). */
  bodyHtml: string;
  title: string;
}

export function render(opts: RenderOptions): RenderResult {
  const rawHtml = marked.parse(opts.markdown, { async: false }) as string;
  const bodyHtml = sanitizeUntrustedHtml(rawHtml);
  const title = opts.title ?? extractFirstHeading(bodyHtml) ?? 'Document';
  const css = printCss(opts);

  const html = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('\n');

  return { html, bodyHtml, title };
}

/**
 * Strip a fixed blacklist of dangerous elements + attributes from marked's
 * output. A conservative regex sanitizer is sufficient here: marked emits
 * structured HTML, we strip a known set, and Chrome re-parses downstream.
 */
export function sanitizeUntrustedHtml(html: string): string {
  let s = html;
  const DANGER_TAGS = [
    'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form',
    'applet', 'frame', 'frameset',
  ];
  for (const tag of DANGER_TAGS) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), '');
    s = s.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }
  // <script> nested inside <svg>
  s = s.replace(/<svg([^>]*)>([\s\S]*?)<\/svg>/gi, (_m, attrs: string, body: string) =>
    `<svg${attrs}>${body.replace(/<script\b[\s\S]*?<\/script>/gi, '')}</svg>`,
  );
  // on* event handler attributes, in any case / quoting
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  // javascript: URLs. Literal-scheme match only: an entity-encoded scheme
  // (e.g. &#106;avascript:) survives, but it is INERT here — the HTML is printed
  // to PDF, never interactively rendered, so no navigation/click can fire it.
  // Harden (decode entities first) before reusing this sanitizer for live render.
  s = s.replace(
    /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
    '$1"#"',
  );
  // srcdoc + css url(javascript:)
  s = s.replace(/\s+srcdoc\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s+srcdoc\s*=\s*'[^']*'/gi, '');
  s = s.replace(/url\(\s*javascript:[^)]*\)/gi, 'url(#)');
  return s;
}

function extractFirstHeading(html: string): string | undefined {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return undefined;
  const text = stripTags(m[1] ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
