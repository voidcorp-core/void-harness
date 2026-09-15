#!/usr/bin/env node
// Private source maintenance only. Never imported by a consumer build.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcile } from './backlog-index/model.mjs';
import { readBounded } from './backlog-index/read.mjs';
import { maxBytes, requireValue } from './backlog-index/schema.mjs';
import { publish, readCurrent } from './backlog-index/store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function inputFile(path) {
  return JSON.parse(readBounded(path, maxBytes));
}
function main(args) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  requireValue(pkg.name === 'void-harness' && pkg.private === true
    && realpathSync(process.cwd()) === realpathSync(root), 'Run from the private void-harness source workspace');
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('pnpm backlog:index --input <export.json> [--check]\n'
      + 'Offline render only. Collect through the connected runtime: docs/LINEAR-INDEX.md.\n');
    return;
  }
  requireValue((args.length === 2 || (args.length === 3 && args[2] === '--check'))
    && args[0] === '--input' && args[1], 'Usage: pnpm backlog:index --input <export.json> [--check]');
  const input = inputFile(resolve(args[1]));
  const output = join(root, '.void/machine/linear-index');
  const state = args[2] === '--check'
    ? reconcile(input, readCurrent(output)) : publish(output, input);
  process.stdout.write(`${args[2] ? 'Validated' : 'Indexed'} ${state.issues.length} tickets. `
    + `Full capture: ${state.fullCapturedAt}. Latest: ${state.capturedAt}.\n`
    + 'Local source-only projection; remote freshness is not verified by this command.\n');
}
try { main(process.argv.slice(2)); }
catch (error) {
  // Never echo the untrusted payload or JSON parser excerpts in diagnostics.
  process.stderr.write(error instanceof SyntaxError ? 'Invalid JSON export. Re-export; prior index preserved.\n'
    : `${error instanceof Error ? error.message : 'Indexing failed'}\n`);
  process.exitCode = 1;
}
