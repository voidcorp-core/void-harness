import {
  type CompiledSpecialist,
  renderSpecialistInstructions,
  type SpecialistContract,
} from './schema.js';

export const CLAUDE_SPECIALIST_SAFETY = Object.freeze({
  readOnly: 'declared' as const,
  isolation: 'fresh-context' as const,
  teamMode: 'degraded' as const,
  limitations: Object.freeze([
    'Claude agent frontmatter blocks mutating built-ins but cannot deny unknown inherited MCP tools.',
  ]),
});

export function compileClaudeSpecialist(contract: SpecialistContract): CompiledSpecialist {
  const instructions = renderSpecialistInstructions(contract);
  const frontmatter = [
    '---',
    `name: ${contract.name}`,
    `description: ${JSON.stringify(contract.description)}`,
    'tools: Read, Grep, Glob',
    'disallowedTools: Write, Edit, NotebookEdit, Bash, Agent, WebFetch, WebSearch',
    `maxTurns: ${contract.budgets.maxTurns}`,
    '---',
  ].join('\n');
  return {
    name: contract.name,
    relativePath: `.claude/agents/${contract.name}.md`,
    content: `${frontmatter}\n\n<!-- Generated from ${contract.id} v${contract.version}. Do not edit. -->\n\n${instructions}\n`,
    instructions,
    safety: CLAUDE_SPECIALIST_SAFETY,
  };
}
