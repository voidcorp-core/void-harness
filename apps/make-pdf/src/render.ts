/**
 * Markdown -> full HTML document. Pure, deterministic, no I/O.
 *
 * `marked` parses md -> HTML (the battle-tested parser — tables, code, nesting).
 * Because marked passes raw HTML in the source THROUGH, a conservative sanitizer
 * strips the dangerous element/attribute blacklist (untrusted markdown can embed
 * raw HTML — a real trust boundary). The body is then wrapped in a document with
 * the print CSS inlined. Page margins + page-number footer are applied by
 * puppeteer at print time (src/pdf.ts), not here.
 */

import { marked } from 'marked';
import { printCss } from './print-css.js';

export interface RenderOptions {
  markdown: string;
  /** Overrides the `<title>` (else the first H1, else "Document"). */
  title?: string;
}

export interface RenderResult {
  html: string;
  bodyHtml: string;
  title: string;
}

export function render(opts: RenderOptions): RenderResult {
  const rawHtml = marked.parse(opts.markdown, { async: false }) as string;
  const bodyHtml = sanitizeUntrustedHtml(rawHtml);
  const title = opts.title ?? extractFirstHeading(bodyHtml) ?? 'Document';

  const html = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>\n${printCss()}\n</style>`,
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
 * output. A conservative regex sanitizer suffices: marked emits structured HTML,
 * we strip a known set, and Chrome re-parses downstream.
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
  s = s.replace(/<svg([^>]*)>([\s\S]*?)<\/svg>/gi, (_m, attrs: string, body: string) =>
    `<svg${attrs}>${body.replace(/<script\b[\s\S]*?<\/script>/gi, '')}</svg>`,
  );
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  s = s.replace(
    /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
    '$1"#"',
  );
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
