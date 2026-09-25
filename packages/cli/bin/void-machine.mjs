#!/usr/bin/env node
// Entry point for the CLI. Every installed command is one of these files, named after the command
// it serves, so the CLI learns how it was invoked from the file name. The typed name never reaches
// the process: Node resolves the npm bin symlink to this file, and a Windows shim calls it directly.
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../dist/main.js';

run(basename(fileURLToPath(import.meta.url), '.mjs'), process.argv.slice(2)).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
