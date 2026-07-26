import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARCHITECT_CONTRACT } from './__fixtures__/contract.js';
import { compileClaudeSpecialist } from './compile-claude.js';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  '.claude',
  'agents',
  'solution-architect.md',
);

describe('compileClaudeSpecialist', () => {
  it('matches the native Claude golden file', () => {
    expect(compileClaudeSpecialist(ARCHITECT_CONTRACT).content).toBe(readFileSync(FIXTURE, 'utf8'));
  });

  it('enforces a fresh read-only tool surface and a native turn budget', () => {
    const compiled = compileClaudeSpecialist(ARCHITECT_CONTRACT);
    expect(compiled.content).toMatch(/^tools: Read, Grep, Glob$/m);
    expect(compiled.content).toMatch(/^disallowedTools: Write, Edit, NotebookEdit, Bash, Agent, WebFetch, WebSearch$/m);
    expect(compiled.content).toMatch(/^maxTurns: 2$/m);
    expect(compiled.safety).toEqual({
      readOnly: 'enforced',
      isolation: 'fresh-context',
      teamMode: 'available',
      limitations: [],
    });
  });
});
