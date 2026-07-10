#!/usr/bin/env tsx
/**
 * CLI: `make-pdf <input.md> [output.pdf] [--a4|--legal] [--margins=1in] [--title="..."]`
 *
 * Reads markdown, renders a styled HTML document (src/render.ts), writes it to a
 * temp file, and prints it to PDF via system headless Chrome (src/chrome.ts).
 * The impure shell; all logic lives in the pure modules it composes.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { render } from './render.js';
import { printToPdf, ChromeNotFoundError } from './chrome.js';

interface Args {
  input: string;
  output: string;
  pageSize?: 'a4' | 'legal';
  margins?: string;
  title?: string;
}

function parseArgs(argv: readonly string[]): Args | undefined {
  const positional: string[] = [];
  let pageSize: 'a4' | 'legal' | undefined;
  let margins: string | undefined;
  let title: string | undefined;
  for (const arg of argv) {
    if (arg === '--a4') pageSize = 'a4';
    else if (arg === '--legal') pageSize = 'legal';
    else if (arg.startsWith('--margins=')) margins = arg.slice('--margins='.length);
    else if (arg.startsWith('--title=')) title = arg.slice('--title='.length);
    else if (arg.startsWith('--')) return undefined;
    else positional.push(arg);
  }
  const input = positional[0];
  if (!input) return undefined;
  const output = positional[1] ?? `${basename(input).replace(/\.m[dk]?d?$/i, '')}.pdf`;
  return {
    input: resolve(input),
    output: resolve(output),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(margins !== undefined ? { margins } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    process.stderr.write(
      'usage: make-pdf <input.md> [output.pdf] [--a4|--legal] [--margins=1in] [--title="..."]\n',
    );
    process.exit(2);
  }

  const markdown = readFileSync(args.input, 'utf8');
  const { html } = render({
    markdown,
    ...(args.title !== undefined ? { title: args.title } : {}),
    ...(args.pageSize !== undefined ? { pageSize: args.pageSize } : {}),
    ...(args.margins !== undefined ? { margins: args.margins } : {}),
  });

  const dir = mkdtempSync(join(tmpdir(), 'make-pdf-'));
  const htmlPath = join(dir, 'doc.html');
  writeFileSync(htmlPath, html, 'utf8');
  try {
    printToPdf(htmlPath, args.output);
  } catch (err) {
    if (err instanceof ChromeNotFoundError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  } finally {
    unlinkSync(htmlPath);
  }

  process.stdout.write(`${args.output}\n`);
}

main();
