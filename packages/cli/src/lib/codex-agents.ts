// Compile each authored agent into Codex's native project-agent TOML format.
// Legacy critics keep their Markdown as their single source; v3 specialists use
// canonical YAML and the same compiler contract as Claude. No agent is emitted
// as a skill: skills teach the current context, agents provide fresh context.

import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findCoreSource } from './paths.js';
import { compileCodexSpecialist, tomlString } from './specialists/compile-codex.js';
import { loadSpecialists } from './specialists/load.js';
import type { SpecialistContract } from './specialists/schema.js';

export const CODEX_AGENTS_DIR = '.codex/agents';

export interface CompiledCodexAgent {
  readonly name: string;
  readonly content: string;
  readonly instructions: string;
}

function frontmatterScalar(block: string, key: string): string {
  const raw = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const quoted =
    raw.length >= 2
    && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  return quoted ? raw.slice(1, -1) : raw;
}

export function compileAgentToToml(md: string): CompiledCodexAgent | undefined {
  const block = md.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) return undefined;
  const name = frontmatterScalar(block, 'name');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return undefined;
  const description = frontmatterScalar(block, 'description');
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, '').trimEnd();
  const instructions = [
    `Compiled by void-harness from the core agent '${name}'. Do not hand-edit this generated file.`,
    body,
  ].join('\n\n');
  const content = [
    `name = ${tomlString(name)}`,
    `description = ${tomlString(description)}`,
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    'mcp_servers = {}',
    `developer_instructions = ${tomlString(instructions)}`,
    '',
  ].join('\n');
  return { name, content, instructions };
}

/** Stage every legacy critic and canonical specialist as a native Codex agent. */
export async function wireCodexAgents(projectRoot: string, sourceRoot: string): Promise<number> {
  const destination = join(projectRoot, CODEX_AGENTS_DIR);
  const specialists = await loadSpecialists(sourceRoot);
  const specialistNames = new Set(specialists.map((contract) => contract.name));
  const compiled: CompiledCodexAgent[] = specialists.map((contract) =>
    compileCodexSpecialist(contract));
  const agentsDirectory = join(sourceRoot, 'agents');
  if (existsSync(agentsDirectory)) {
    const entries = await readdir(agentsDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const agent = compileAgentToToml(await readFile(join(agentsDirectory, entry.name), 'utf8'));
      if (agent === undefined || specialistNames.has(agent.name)) continue;
      compiled.push(agent);
    }
  }
  if (compiled.length === 0) return 0;
  await mkdir(destination, { recursive: true });
  compiled.sort((left, right) => left.name.localeCompare(right.name));
  for (const agent of compiled) {
    await writeFile(join(destination, `${agent.name}.toml`), agent.content);
  }
  return compiled.length;
}

export interface CodexAgentHealth {
  readonly ok: boolean;
  readonly detail: string;
}

/** The canonical catalog is the only specialist identity registry. */
export async function canonicalSpecialistContracts(
  sourceRoot?: string,
): Promise<readonly SpecialistContract[]> {
  const root = sourceRoot ?? await findCoreSource();
  const contracts = await loadSpecialists(root);
  if (contracts.length === 0) {
    throw new Error('canonical specialist catalog is empty');
  }
  return contracts;
}

/** Native specialist discovery health. Runtime sandbox strength is reported separately. */
export async function codexSpecialistsHealth(
  projectRoot: string,
  sourceRoot?: string,
): Promise<CodexAgentHealth> {
  let contracts: readonly SpecialistContract[];
  try {
    contracts = await canonicalSpecialistContracts(sourceRoot);
  } catch (error) {
    return {
      ok: false,
      detail: `canonical specialist catalog unavailable: ${(error as Error).message}`,
    };
  }
  const missing: string[] = [];
  for (const contract of contracts) {
    const name = contract.name;
    const path = join(projectRoot, CODEX_AGENTS_DIR, `${name}.toml`);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        missing.push(name);
        continue;
      }
      const content = await readFile(path, 'utf8');
      const required = [
        `name = "${name}"`,
        'sandbox_mode = "read-only"',
        'web_search = "disabled"',
        'mcp_servers = {}',
        `Canonical contract: \`${contract.id}\` v${contract.version}.`,
      ];
      if (!required.every((fragment) => content.includes(fragment))) {
        missing.push(name);
      }
    } catch {
      missing.push(name);
    }
  }
  return missing.length === 0
    ? { ok: true, detail: `${contracts.length} version-matched native specialist TOML files discovered` }
    : { ok: false, detail: `missing or invalid native specialists: ${missing.join(', ')}` };
}
