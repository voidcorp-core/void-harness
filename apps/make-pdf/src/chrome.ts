/**
 * System Chrome/Chromium discovery + headless print-to-PDF. This is the one
 * impure edge (spawns a process). `findChrome` is kept pure/injectable so it is
 * unit-testable without a real browser; `printToPdf` is exercised by the dogfood.
 *
 * Replaces gstack make-pdf's dependency on the browse daemon: no daemon, no
 * Puppeteer/Playwright — just the system browser's `--print-to-pdf` flag.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Candidate executables, most-preferred first, per platform. */
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

/**
 * Resolve a Chrome/Chromium executable path, or `undefined` if none is found.
 * `CHROME_PATH` / `CHROME` env vars win over the platform defaults.
 */
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

/** Thrown when no system Chrome/Chromium can be located. */
export class ChromeNotFoundError extends Error {
  constructor() {
    super(
      'No Chrome/Chromium found. Install Google Chrome (or Chromium), or set CHROME_PATH to the executable.',
    );
    this.name = 'ChromeNotFoundError';
  }
}

/**
 * Print an on-disk HTML file to a PDF via headless Chrome. Throws
 * ChromeNotFoundError if no browser is available, or Error on a non-zero exit.
 */
export function printToPdf(htmlPath: string, pdfPath: string, chromePath?: string): void {
  const chrome = chromePath ?? findChrome();
  if (!chrome) throw new ChromeNotFoundError();

  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Chrome exited with code ${result.status ?? 'unknown'}: ${result.stderr ?? ''}`.trim(),
    );
  }
}
