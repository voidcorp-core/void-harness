#!/usr/bin/env tsx
/**
 * CLI: `make-pdf <input.md> [output.pdf] [--a4|--legal] [--margins=1in] [--title="..."]`
 *
 * Reads markdown, renders a styled HTML document (render.ts), and prints it to
 * PDF via puppeteer-core on the system Chrome (pdf.ts). The impure shell.
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { render } from './render.js';
import { generatePdf, ChromeNotFoundError, type PdfOptions } from './pdf.js';

interface Args {
  input: string;
  output: string;
  format?: 'A4' | 'Legal';
  margin?: string;
  title?: string;
}

function parseArgs(argv: readonly string[]): Args | undefined {
  const positional: string[] = [];
  let format: 'A4' | 'Legal' | undefined;
  let margin: string | undefined;
  let title: string | undefined;
  for (const arg of argv) {
    if (arg === '--a4') format = 'A4';
    else if (arg === '--legal') format = 'Legal';
    else if (arg.startsWith('--margins=')) margin = arg.slice('--margins='.length);
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
    ...(format !== undefined ? { format } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    process.stderr.write(
      'usage: make-pdf <input.md> [output.pdf] [--a4|--legal] [--margins=1in] [--title="..."]\n',
    );
    process.exit(2);
  }

  const markdown = readFileSync(args.input, 'utf8');
  const { html } = render({ markdown, ...(args.title !== undefined ? { title: args.title } : {}) });

  const pdfOpts: PdfOptions = {
    ...(args.format !== undefined ? { format: args.format } : {}),
    ...(args.margin !== undefined ? { margin: args.margin } : {}),
  };
  try {
    await generatePdf(html, args.output, pdfOpts);
  } catch (err) {
    if (err instanceof ChromeNotFoundError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  process.stdout.write(`${args.output}\n`);
}

void main();
