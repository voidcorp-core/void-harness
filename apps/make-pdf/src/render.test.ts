import { describe, it, expect } from 'vitest';
import { render, sanitizeUntrustedHtml } from './render.js';
import { printCss } from './print-css.js';

describe('render', () => {
  it('renders headings, tables, code, and images into the document body', () => {
    const md = [
      '# Titre',
      '',
      'Un paragraphe.',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
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

  it('derives the title from the first H1 when not given', () => {
    expect(render({ markdown: '# My Report\n\nbody' }).title).toBe('My Report');
    expect(render({ markdown: 'no heading' }).title).toBe('Document');
    expect(render({ markdown: '# ignored', title: 'Explicit' }).title).toBe('Explicit');
  });

  it('sets the document language to French for correct hyphenation/quotes', () => {
    expect(render({ markdown: 'x' }).html).toContain('<html lang="fr">');
  });
});

describe('sanitizeUntrustedHtml', () => {
  it('strips script/iframe/object and their content', () => {
    const dirty = '<p>ok</p><script>alert(1)</script><iframe src="x"></iframe>';
    const clean = sanitizeUntrustedHtml(dirty);
    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)');
    expect(clean).not.toContain('<iframe');
  });

  it('strips on* event handlers and javascript: URLs', () => {
    const dirty = '<a href="javascript:evil()" onclick="steal()">x</a><img onerror="hack()" src="y">';
    const clean = sanitizeUntrustedHtml(dirty);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
  });

  it('runs through the full render pipeline (raw HTML in markdown is untrusted)', () => {
    const { bodyHtml } = render({ markdown: 'Hello\n\n<script>alert(1)</script>\n\nWorld' });
    expect(bodyHtml).not.toContain('<script');
  });
});

describe('printCss', () => {
  it('sets the page size, margins, and break-avoid rules', () => {
    const css = printCss({ pageSize: 'a4', margins: '2cm' });
    expect(css).toContain('@page { size: a4; margin: 2cm; }');
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('break-after: avoid');
  });

  it('defaults to letter / 1in', () => {
    expect(printCss()).toContain('@page { size: letter; margin: 1in; }');
  });
});
