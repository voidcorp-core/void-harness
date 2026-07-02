import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, analyzeCost, parseActivations } from '@voidcorp/harness-graph';
import type { GraphModel } from '@voidcorp/harness-graph';
import { extractMeta } from '../src/data/extract-meta.js';
import { summarizeUsage } from '../src/data/summarize.js';
import type { WorkflowMeta } from '../src/data/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

mkdirSync(outDir, { recursive: true });

const modelText = readFileSync(resolve(repoRoot, 'packages/harness-graph/model.json'), 'utf8');
const model = JSON.parse(modelText) as GraphModel;

const usage = summarizeUsage(readIfExists(resolve(repoRoot, '.void/usage.log')));
const findings = analyze(model, { usedSkillNames: new Set(usage.usedSkillNames) });

// Static-only cost snapshot (no transcripts → no cli dependency). The 1/1 volume floor keeps the
// viz populated on modest dev data; real cost + gating come server-fed via `graph live`.
const activations = parseActivations(readIfExists(resolve(repoRoot, '.void/activations.jsonl')));
const cost = analyzeCost(model, activations, { minSessions: 1, minEvents: 1 });

const workflows: Record<string, WorkflowMeta> = {};
for (const node of model.nodes) {
  if (node.type !== 'workflow-def') continue;
  const meta = extractMeta(readIfExists(resolve(repoRoot, node.source)));
  if (meta.phases.length > 0) workflows[node.id] = meta;
}

const write = (name: string, value: unknown): void => {
  writeFileSync(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
};
write('model.json', model);
write('usage-summary.json', usage);
write('findings.json', findings);
write('workflows.json', workflows);
write('cost.json', cost);
process.stdout.write(
  `prepare-data: ${model.nodes.length} nodes, ${findings.length} findings, ${cost.rows.length} cost rows, ${Object.keys(workflows).length} workflow metas\n`,
);
