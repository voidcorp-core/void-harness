#!/usr/bin/env node
// Compatibility shim. Decision files are the source of truth and projections
// are read-only: this script must never rewrite a shared index.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(
  new URL('../packages/cli/bin/void-harness.mjs', import.meta.url),
);

export function commandFor(args) {
  return args.includes('--check')
    ? ['decisions', 'check']
    : ['decisions', 'render', '--format', 'markdown'];
}

function main() {
  const result = spawnSync(
    process.execPath,
    [CLI, ...commandFor(process.argv.slice(2))],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.error !== undefined) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
