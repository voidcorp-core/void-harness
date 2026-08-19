import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, analyzeCost, parseActivations } from '@voidcorp/harness-graph';
import {
  adaptCatalogV1,
  projectCatalogV3ToV1,
  type GraphModel,
} from '@voidcorp/harness-graph';
import { extractMeta } from '../src/data/extract-meta.js';
import { summarizeActivations } from '../src/data/summarize.js';
import type { WorkflowMeta } from '../src/data/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/**
 * The demo journal the studio ships with.
 *
 * This used to read `.void/runs` -- the mission journals of whoever ran the
 * build. Two defects in one line: the published `void-graph.mjs` carried that
 * person's real activity (skill names, counts, sessions), and the bundle
 * differed on every build since the journal grows with every session. A
 * committed fixture is chosen rather than inherited, and `demo-journal.test.ts`
 * holds it parseable and aimed at components the catalogue actually has.
 *
 * Real data reaches the studio through `graph live`, never through the build.
 */
const demoJournalPath = resolve(here, '../fixtures/demo-journal.jsonl');

mkdirSync(outDir, { recursive: true });

const modelText = readFileSync(resolve(repoRoot, 'packages/core/data/model.json'), 'utf8');
const model = projectCatalogV3ToV1(
  adaptCatalogV1(JSON.parse(modelText) as GraphModel),
);

const activations = parseActivations(readFileSync(demoJournalPath, 'utf8'));
const usage = summarizeActivations(activations);
const findings = analyze(model, { usedSkillNames: new Set(usage.usedSkillNames) });

// Static-only cost snapshot (no transcripts → no cli dependency). The 1/1 volume floor keeps the
// viz populated on modest dev data; real cost + gating come server-fed via `graph live`.
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
