// Assemble the self-contained consumer artifact `packages/core/graph/void-graph.mjs`:
//   1. build the single-file studio (VOID_SINGLEFILE=1 -> one inlined index.html)
//   2. bundle the graph CLI with the kernel inlined, the committed model.json baked in, and the
//      studio HTML inlined (buildVoidGraphBundle).
// Deterministic given the same model.json + studio sources. Wired into the release in Step 9.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVoidGraphBundle } from '../src/lib/build-bundle.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = resolve(here, '..', '..'); // packages/
const modelPath = resolve(pkgs, 'harness-graph', 'model.json');
const studioHtmlPath = resolve(pkgs, '..', 'apps', 'graph-studio', 'dist-singlefile', 'index.html');
const outFile = resolve(pkgs, 'core', 'graph', 'void-graph.mjs');

process.stdout.write('build-void-graph: building single-file studio…\n');
execFileSync('pnpm', ['-F', '@voidcorp/graph-studio', 'build:singlefile'], { stdio: 'inherit' });

process.stdout.write('build-void-graph: bundling void-graph.mjs…\n');
const modelJson = readFileSync(modelPath, 'utf8');
const studioHtml = readFileSync(studioHtmlPath, 'utf8');
const code = await buildVoidGraphBundle(modelJson, studioHtml);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, code);
process.stdout.write(`build-void-graph: wrote ${(code.length / 1024).toFixed(0)} KB -> ${outFile}\n`);
