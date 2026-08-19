import {
  type CompiledSpecialist,
  renderSpecialistInstructions,
  type SpecialistContract,
} from './schema.js';

/**
 * The allowlist is the isolation, and it already covers MCP.
 *
 * This was recorded as a permanent degradation on the belief that agent
 * frontmatter could not deny unknown inherited MCP tools, and `doctor` printed
 * that on every run for weeks. The official subagent documentation says the
 * opposite of this exact shape: "This example uses `tools` to allow only Read,
 * Grep, Glob, and Bash. The subagent can't edit files, write files, or use any
 * MCP tools." A specialist listing three read tools reaches no server, including
 * the ones nobody enumerated, which is the case the belief was worried about.
 *
 * An advisory describing a limitation that does not exist is worse than none: it
 * is printed until it stops being read, and it invites a mechanism built to
 * silence it.
 */
export const CLAUDE_SPECIALIST_SAFETY = Object.freeze({
  readOnly: 'declared' as const,
  isolation: 'fresh-context' as const,
  teamMode: 'available' as const,
  limitations: Object.freeze([] as readonly string[]),
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
