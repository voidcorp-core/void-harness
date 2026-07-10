import { describe, it, expect } from 'vitest';
import { render, sanitizeUntrustedHtml } from './render.js';
import { printCss } from './print-css.js';

describe('render', () => {
  it('renders headings, tables, code, and images into the document body', () => {
    const md = [
      '# Titre', '', 'Un paragraphe.', '',
      '| a | b |', '|---|---|', '| 1 | 2 |', '',
      '```ts', 'const x = 1;', '```', '',
      '![alt](img.png)',
    ].join('\n');
    const { html, bodyHtml } = render({ markdown: md });
    expect(bodyHtml).toContain('<h1>Titre</h1>');
    expect(bodyHtml).toContain('<table>');
    expect(bodyHtml).toContain('<th>a</th>');
    expect(bodyHtml).toContain('<code');
    expect(bodyHtml).toContain('<img');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<style>');
  });

  it('preserves French diacritics (deliverables are in French)', () => {
    const { bodyHtml } = render({ markdown: 'Évaluation à réaliser : coûts, délais, périmètre.' });
    expect(bodyHtml).toContain('Évaluation à réaliser');
    expect(bodyHtml).toContain('coûts, délais, périmètre');
  });

  it('derives the title from the first H1, honours an override, defaults to Document', () => {
    expect(render({ markdown: '# My Report\n\nbody' }).title).toBe('My Report');
    expect(render({ markdown: 'no heading' }).title).toBe('Document');
    expect(render({ markdown: '# ignored', title: 'Explicit' }).title).toBe('Explicit');
  });

  it('sets the document language to French', () => {
    expect(render({ markdown: 'x' }).html).toContain('<html lang="fr">');
  });
});

describe('sanitizeUntrustedHtml', () => {
  it('strips script/iframe/object and their content', () => {
    const clean = sanitizeUntrustedHtml('<p>ok</p><script>alert(1)</script><iframe src="x"></iframe>');
    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)');
    expect(clean).not.toContain('<iframe');
  });

  it('strips on* handlers and javascript: URLs', () => {
    const clean = sanitizeUntrustedHtml('<a href="javascript:evil()" onclick="steal()">x</a><img onerror="hack()">');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
  });

  it('runs through the full pipeline (raw HTML in markdown is untrusted)', () => {
    expect(render({ markdown: 'Hi\n\n<script>alert(1)</script>\n\nBye' }).bodyHtml).not.toContain('<script');
  });
});

describe('printCss', () => {
  it('carries the break-avoid rules and a diacritic-safe font stack', () => {
    const css = printCss();
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('break-after: avoid');
    expect(css).toContain('Liberation Sans');
  });
});
