import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, analyzeCost, parseActivations } from '@voidcorp/harness-graph';
import type { GraphModel } from '@voidcorp/harness-graph';
import { extractMeta } from '../src/data/extract-meta.js';
import {
  summarizeActivations,
  summarizeUsage,
} from '../src/data/summarize.js';
import type { WorkflowMeta } from '../src/data/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function readMissionEvents(root: string): string {
  const runs = resolve(root, '.void/runs');
  try {
    const info = lstatSync(runs);
    if (!info.isDirectory() || info.isSymbolicLink()) return '';
    return readdirSync(runs, { withFileTypes: true })
      .filter((entry) =>
        entry.isDirectory()
        && !entry.isSymbolicLink()
        && /^mis_[A-Za-z0-9_-]{8,100}$/.test(entry.name),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const path = resolve(runs, entry.name, 'events.jsonl');
        try {
          const file = lstatSync(path);
          return file.isFile() && !file.isSymbolicLink() && file.size <= 8 * 1024 * 1024
            ? [readFileSync(path, 'utf8')]
            : [];
        } catch {
          return [];
        }
      })
      .join('\n');
  } catch {
    return '';
  }
}

mkdirSync(outDir, { recursive: true });

const modelText = readFileSync(resolve(repoRoot, 'packages/harness-graph/model.json'), 'utf8');
const model = JSON.parse(modelText) as GraphModel;

const activationBody = [
  readMissionEvents(repoRoot),
  readIfExists(resolve(repoRoot, '.void/activations.jsonl')),
].filter((body) => body !== '').join('\n');
const activations = parseActivations(activationBody);
const eventUsage = summarizeActivations(activations);
const usage = eventUsage.usedSkillNames.length > 0
  ? eventUsage
  : summarizeUsage(readIfExists(resolve(repoRoot, '.void/usage.log')));
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
