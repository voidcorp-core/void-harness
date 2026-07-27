import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARCHITECT_CONTRACT } from './__fixtures__/contract.js';
import { compileClaudeSpecialist } from './compile-claude.js';
import { loadSpecialists } from './load.js';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  '.claude',
  'agents',
  'solution-architect.md',
);
const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'core');

describe('compileClaudeSpecialist', () => {
  it('loads both UI specialists from the canonical core source', async () => {
    await expect(loadSpecialists(CORE_ROOT)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'core:experience-designer' }),
      expect.objectContaining({ id: 'core:visual-craft-director' }),
    ]));
  });

  it('matches the native Claude golden file', () => {
    expect(compileClaudeSpecialist(ARCHITECT_CONTRACT).content).toBe(readFileSync(FIXTURE, 'utf8'));
  });

  it('blocks mutating built-ins and declares the remaining inherited-MCP limitation', () => {
    const compiled = compileClaudeSpecialist(ARCHITECT_CONTRACT);
    expect(compiled.content).toMatch(/^tools: Read, Grep, Glob$/m);
    expect(compiled.content).toMatch(/^disallowedTools: Write, Edit, NotebookEdit, Bash, Agent, WebFetch, WebSearch$/m);
    expect(compiled.content).toMatch(/^maxTurns: 2$/m);
    expect(compiled.safety).toEqual({
      readOnly: 'declared',
      isolation: 'fresh-context',
      teamMode: 'degraded',
      limitations: [
        'Claude agent frontmatter blocks mutating built-ins but cannot deny unknown inherited MCP tools.',
      ],
    });
  });

  it('keeps marketplace-native agent files generated from the canonical YAML', async () => {
    for (const contract of await loadSpecialists(CORE_ROOT)) {
      const compiled = compileClaudeSpecialist(contract);
      expect(readFileSync(join(CORE_ROOT, 'agents', `${contract.name}.md`), 'utf8')).toBe(
        compiled.content,
      );
    }
  });
});
