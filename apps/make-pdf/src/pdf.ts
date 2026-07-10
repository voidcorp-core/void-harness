/**
 * HTML -> PDF via puppeteer-core driving the SYSTEM Chrome/Chromium — the
 * state-of-the-art path (marked + puppeteer). `puppeteer-core` bundles NO
 * Chromium (nothing to download in CI); it drives the browser `findChrome`
 * locates. `page.pdf()` gives what the raw `--print-to-pdf` flag cannot: real
 * page-number footers, background printing, and precise margins.
 *
 * `findChrome` is pure/injectable (unit-tested); `generatePdf` is the impure edge
 * (launches a browser), exercised by the dogfood.
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

export interface FindChromeDeps {
  platform?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
}

/** Resolve a Chrome/Chromium executable, or `undefined`. `CHROME_PATH`/`CHROME` win. */
export function findChrome(deps: FindChromeDeps = {}): string | undefined {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? existsSync;

  const override = env['CHROME_PATH'] ?? env['CHROME'];
  if (override && override.length > 0) {
    return exists(override) ? override : undefined;
  }
  const candidates = CANDIDATES[platform] ?? CANDIDATES['linux'] ?? [];
  return candidates.find((p) => exists(p));
}

export class ChromeNotFoundError extends Error {
  constructor() {
    super(
      'No Chrome/Chromium found. Install Google Chrome (or Chromium), or set CHROME_PATH to the executable.',
    );
    this.name = 'ChromeNotFoundError';
  }
}

export interface PdfOptions {
  format?: 'Letter' | 'A4' | 'Legal';
  margin?: string;
  /** Chrome executable override (else `findChrome`). */
  executablePath?: string;
}

/** Centered "N / M" footer with an explicit font-size (the template default is invisible). */
function footerTemplate(): string {
  return (
    '<div style="font-size:9px; color:#666; width:100%; text-align:center; margin:0 12mm;">' +
    '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  );
}

/** Render an HTML document string to a PDF on disk. Throws ChromeNotFoundError if none is available. */
export async function generatePdf(html: string, outPath: string, opts: PdfOptions = {}): Promise<void> {
  const executablePath = opts.executablePath ?? findChrome();
  if (!executablePath) throw new ChromeNotFoundError();
  const margin = opts.margin ?? '1in';

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    // Inline HTML with no external fetches: 'load' fires immediately. (networkidle0
    // waits for a quiet network that a self-contained doc never signals, and hangs.)
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: opts.format ?? 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate(),
      margin: { top: margin, bottom: margin, left: margin, right: margin },
    });
  } finally {
    await browser.close();
  }
}
