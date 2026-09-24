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

/** What is wrong with one installed specialist, judged against the contract this CLI carries. */
export type SpecialistDrift =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'version'; readonly installed: number; readonly expected: number };

const CONTRACT_LINE = /Canonical contract: `([^`]+)` v([1-9][0-9]{0,5})\./;

/**
 * Judges one installed specialist. A contract line naming another version is
 * told apart from a broken file, because the two are repaired differently: a
 * version drift means the CLI and the install come from different releases.
 */
export function specialistDrift(
  contract: SpecialistContract,
  content: string | undefined,
  required: readonly string[],
): SpecialistDrift | undefined {
  if (content === undefined) return { kind: 'missing' };
  const line = CONTRACT_LINE.exec(content);
  const installed = line?.[1] === contract.id ? Number(line[2]) : undefined;
  if (installed !== undefined && installed !== contract.version) {
    return { kind: 'version', installed, expected: contract.version };
  }
  return required.every((fragment) => content.includes(fragment)) ? undefined : { kind: 'invalid' };
}

/**
 * One sentence naming each drifted specialist and the repair. An install newer
 * than the CLI is the one case where reinstalling is not the only answer: the
 * CLI that reads it is the stale side, and upgrading it keeps the newer install.
 */
export function describeSpecialistDrift(
  drifts: ReadonlyMap<string, SpecialistDrift>,
  reinstall: string,
): string {
  const named = [...drifts].map(([name, drift]) =>
    drift.kind === 'version'
      ? `${name} (installed v${drift.installed}, this CLI carries v${drift.expected})`
      : `${name} (${drift.kind})`,
  );
  const newer = [...drifts.values()].some(
    (drift) => drift.kind === 'version' && drift.installed > drift.expected,
  );
  const reinstallWithThis = `reinstall them with this CLI: \`${reinstall}\``;
  const repair = newer
    ? 'this CLI is older than the install: upgrade voidharness to the release that installed'
      + ` them, or ${reinstallWithThis}`
    : reinstallWithThis;
  return `native specialists do not match this CLI: ${named.join(', ')}; ${repair}`;
}

/** A regular file's text; undefined when it is absent, a link, or unreadable. */
export async function regularFileText(path: string): Promise<string | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
    return await readFile(path, 'utf8');
  } catch {
    // Absent or unreadable: the caller reports the specialist as missing.
    return undefined;
  }
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
  const drifts = new Map<string, SpecialistDrift>();
  for (const contract of contracts) {
    const name = contract.name;
    const required = [
      `name = "${name}"`,
      'sandbox_mode = "read-only"',
      'web_search = "disabled"',
      'mcp_servers = {}',
      `Canonical contract: \`${contract.id}\` v${contract.version}.`,
    ];
    const path = join(projectRoot, CODEX_AGENTS_DIR, `${name}.toml`);
    const drift = specialistDrift(contract, await regularFileText(path), required);
    if (drift !== undefined) drifts.set(name, drift);
  }
  return drifts.size === 0
    ? { ok: true, detail: `${contracts.length} version-matched native specialist TOML files discovered` }
    : { ok: false, detail: describeSpecialistDrift(drifts, 'void-harness runtime add codex') };
}
