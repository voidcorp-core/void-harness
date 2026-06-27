import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

mkdirSync(outDir, { recursive: true });
const model = readFileSync(resolve(repoRoot, 'packages/harness-graph/model.json'), 'utf8');
writeFileSync(resolve(outDir, 'model.json'), model);
writeFileSync(resolve(outDir, 'usage-summary.json'), `${JSON.stringify({ counts: {}, usedSkillNames: [] }, null, 2)}\n`);
writeFileSync(resolve(outDir, 'findings.json'), `${JSON.stringify([], null, 2)}\n`);
writeFileSync(resolve(outDir, 'workflows.json'), `${JSON.stringify({}, null, 2)}\n`);
process.stdout.write('prepare-data: wrote 4 generated files\n');
