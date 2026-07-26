import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARCHITECT_CONTRACT } from './__fixtures__/contract.js';
import { compileClaudeSpecialist } from './compile-claude.js';
import { compileCodexSpecialist } from './compile-codex.js';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  '.codex',
  'agents',
  'solution-architect.toml',
);

describe('compileCodexSpecialist', () => {
  it('matches the native Codex golden file without a skill fallback', () => {
    const compiled = compileCodexSpecialist(ARCHITECT_CONTRACT);
    expect(compiled.content).toBe(readFileSync(FIXTURE, 'utf8'));
    expect(compiled.relativePath).toBe('.codex/agents/solution-architect.toml');
    expect(compiled.content).not.toContain('SKILL.md');
  });

  it('denies writes, web search, and inherited MCP servers by default', () => {
    const compiled = compileCodexSpecialist(ARCHITECT_CONTRACT);
    expect(compiled.content).toMatch(/^sandbox_mode = "read-only"$/m);
    expect(compiled.content).toMatch(/^web_search = "disabled"$/m);
    expect(compiled.content).toMatch(/^mcp_servers = \{\}$/m);
  });

  it('keeps team mode degraded because a parent runtime override can weaken the declared sandbox', () => {
    expect(compileCodexSpecialist(ARCHITECT_CONTRACT).safety).toEqual({
      readOnly: 'declared',
      isolation: 'fresh-context',
      teamMode: 'degraded',
      limitations: [
        'Codex parent runtime overrides can replace the agent sandbox and no per-agent process allowlist is available.',
      ],
    });
  });

  it('uses exactly the same doctrinal instructions as the Claude output', () => {
    expect(compileCodexSpecialist(ARCHITECT_CONTRACT).instructions).toBe(
      compileClaudeSpecialist(ARCHITECT_CONTRACT).instructions,
    );
  });
});
