// `void-harness graph` — build the model, gate on it (check), or report (audit).
// Thin shell over @voidcorp/harness-graph (functional core / imperative shell),
// mirroring the existing `audit` command.
//
// Path note: output paths (model.json, relations.graph.yaml, packs/) are anchored
// on PKGS_ROOT (2 levels up from dist/main.js), not on dirname(coreSource).
// findCoreSource() may return packages/cli/core-assets (the bundled npm copy),
// whose parent is not the workspace packages root. Using import.meta.url is more
// reliable for deriving sibling-package locations at runtime.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyze,
  assembleModel,
  blockingFindings,
  scanSourceTree,
  serializeModel,
} from '@voidcorp/harness-graph';
import { parseUsageLog } from '../lib/audit.js';
import { findCoreSource } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { usedSkillNames } from '../lib/graph-io.js';

// packages/ root: dist/main.js -> dist -> cli -> packages
const PKGS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function packsDirFor(_coreSource: string): string {
  return join(PKGS_ROOT, 'packs');
}
function modelPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'harness-graph', 'model.json');
}
function relationsPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'harness-graph', 'relations.graph.yaml');
}

async function loadModel(coreSource: string) {
  const tree = scanSourceTree(coreSource, packsDirFor(coreSource));
  const rp = relationsPath(coreSource);
  const declared = existsSync(rp) ? readFileSync(rp, 'utf8') : '';
  return assembleModel(tree, declared);
}

function ctxFor(): { usedSkillNames: Set<string> } {
  const logPath = join(process.cwd(), '.void', 'usage.log');
  const usage = existsSync(logPath) ? parseUsageLog(readFileSync(logPath, 'utf8')) : [];
  return { usedSkillNames: usedSkillNames(usage) };
}

export async function graph(args: readonly string[]): Promise<void> {
  const sub = args[0] ?? 'build';
  // Prefer the real source when running in the void-harness workspace itself;
  // fall back to the bundled core-assets for installed (consumer) invocations.
  const pkgsCoreDir = join(PKGS_ROOT, 'core');
  const coreSource = existsSync(pkgsCoreDir) ? pkgsCoreDir : await findCoreSource();

  if (sub === 'build') {
    const model = await loadModel(coreSource);
    writeFileSync(modelPath(coreSource), serializeModel(model));
    banner('graph build');
    blank();
    line(`  ${c.green(`${model.nodes.length} nodes`)} ${c.dim(glyph.dot)} ${c.green(`${model.edges.length} edges`)} -> ${c.dim('harness-graph/model.json')}`);
    footer(c.dim('model.json regenerated. Commit it; the check gate fails on drift.'));
    return;
  }

  if (sub === 'check') {
    const model = await loadModel(coreSource);
    const onDisk = existsSync(modelPath(coreSource)) ? readFileSync(modelPath(coreSource), 'utf8') : '';
    const drift = onDisk !== serializeModel(model);
    const blocking = blockingFindings(analyze(model, ctxFor()));
    banner('graph check');
    blank();
    if (drift) {
      line(`  ${c.red('model.json is stale')} -- run \`void-harness graph build\` and commit.`);
      const fresh = serializeModel(model).split('\n');
      const old = onDisk.split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(fresh.length, old.length) && shown < 6; i += 1) {
        if (fresh[i] !== old[i]) {
          line(`    L${i + 1} committed: ${c.dim((old[i] ?? '<missing>').trim())}`);
          line(`    L${i + 1} rebuilt:   ${c.dim((fresh[i] ?? '<missing>').trim())}`);
          shown += 1;
        }
      }
    }
    for (const f of blocking) line(`  ${c.red('error')} ${f.kind}: ${f.evidence}`);
    if (drift || blocking.length > 0) {
      footer(c.red('graph check failed.'));
      process.exit(1);
    }
    footer(c.green('graph check passed.'));
    return;
  }

  if (sub === 'audit') {
    const model = await loadModel(coreSource);
    const findings = analyze(model, ctxFor());
    banner('graph audit');
    blank();
    line(`  ${c.dim('nodes')} ${model.nodes.length} ${c.dim(glyph.dot)} ${c.dim('edges')} ${model.edges.length} ${c.dim(glyph.dot)} ${c.dim('findings')} ${findings.length}`);
    for (const f of findings) {
      const sev = f.severity === 'error' ? c.red(f.severity) : f.severity === 'warning' ? c.yellow(f.severity) : c.dim(f.severity);
      blank();
      line(`  ${sev} ${c.bold(f.kind)} ${c.dim(f.nodes.join(', '))}`);
      line(`    ${f.evidence}`);
      line(`    ${c.dim(`-> ${f.suggestion}`)}`);
    }
    blank();
    footer(c.dim('warnings/info are signals to weigh (HITL); only broken-route blocks CI.'));
    return;
  }

  console.error(`unknown graph subcommand: ${sub}\n`); // allow-console: error-exit branch per brief
  process.exit(2);
}
