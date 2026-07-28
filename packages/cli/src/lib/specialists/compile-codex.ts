import {
  type CompiledSpecialist,
  renderSpecialistInstructions,
  type SpecialistContract,
} from './schema.js';

const CODEX_LIMITATION =
  'Codex parent runtime overrides can replace the agent sandbox and no per-agent process allowlist is available.';

export const CODEX_SPECIALIST_SAFETY = Object.freeze({
  readOnly: 'declared' as const,
  isolation: 'fresh-context' as const,
  teamMode: 'degraded' as const,
  limitations: Object.freeze([CODEX_LIMITATION]),
});

export function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function compileCodexSpecialist(contract: SpecialistContract): CompiledSpecialist {
  const instructions = renderSpecialistInstructions(contract);
  const content = [
    `name = ${tomlString(contract.name)}`,
    `description = ${tomlString(contract.description)}`,
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    'mcp_servers = {}',
    `developer_instructions = ${tomlString(instructions)}`,
    '',
  ].join('\n');
  return {
    name: contract.name,
    relativePath: `.codex/agents/${contract.name}.toml`,
    content,
    instructions,
    safety: CODEX_SPECIALIST_SAFETY,
  };
}
