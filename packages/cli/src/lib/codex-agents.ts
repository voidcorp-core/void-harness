// Compile the Claude AGENT definitions into Codex-discoverable skills.
//
// Claude runs the five read-only critics (doctrine-critic, silent-failure-hunter,
// type-design-analyzer, code-explorer, migration-planner) as context-isolated
// SUBAGENTS, shipped through the marketplace plugin. Codex has no stable
// equivalent: its own docs point reusable capabilities at SKILLS (custom prompts
// are deprecated in their favour, and Codex subagents are still experimental).
//
// So we COMPILE rather than author a second copy. Hand-writing five parallel
// SKILL.md files would duplicate the doctrine body of every agent — two sources
// for one capability, guaranteed to drift, and a straight hit on the repo's
// "no responsibility overlap" rule. Compiling keeps ONE authored doctrine per
// capability and is exactly what the runtime seam exists for: author once,
// compile per runtime (see runtime-adapters.ts).
//
// Honest degradation, stated in the compiled file itself: Codex gets the
// capability, not the CONTEXT ISOLATION. A skill runs inline in the main Codex
// context, where Claude spawns a separate one. That is a real difference, so it
// is written where the reader will see it rather than buried in docs.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CODEX_SKILLS_DIR } from './codex-skills.js';

export interface CompiledAgentSkill {
  readonly name: string;
  readonly content: string;
}

/**
 * Render a string as an always-quoted YAML scalar. Agent descriptions routinely
 * carry a `:` ("Judges a diff against doctrine that hooks miss: weak tests,
 * ..."), which is precisely the unquoted-colon frontmatter bug this repo already
 * had to fix once (#130). Quoting unconditionally removes the whole class.
 */
function yamlScalar(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Read a single-line scalar out of a raw frontmatter block by line scan rather
 * than a YAML parse. Deliberate: a strict parse REJECTS the very files we must
 * read — several agent descriptions carry an unquoted `:` ("Judges what hooks
 * miss: weak tests, ...") — and a rejected parse would silently stage nothing.
 * The same tolerance the skills reader already applies to `runtimes`.
 */
function frontmatterScalar(block: string, key: string): string {
  const raw = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const quoted =
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  return quoted ? raw.slice(1, -1) : raw;
}

/**
 * Compile one Claude agent definition into the SKILL.md text Codex discovers.
 * The Claude-only frontmatter keys (tools / model / color) are dropped: they
 * describe a subagent spawn Codex has no equivalent for, and leaving them would
 * promise a behaviour the runtime cannot honour. Returns undefined when the file
 * carries no usable frontmatter `name` — there would be nothing to stage under.
 */
export function compileAgentToSkill(md: string): CompiledAgentSkill | undefined {
  const block = md.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) return undefined;
  const name = frontmatterScalar(block, 'name');
  if (name === '') return undefined;
  const description = frontmatterScalar(block, 'description');
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const frontmatter = [
    '---',
    `name: ${name}`,
    `description: ${yamlScalar(description)}`,
    'runtimes: [codex]',
    '---',
  ].join('\n');
  const provenance = [
    `> Compiled by \`void-harness\` from the core agent \`${name}\` — do not hand-edit,`,
    '> `void-harness init` overwrites this file. Claude runs this critic as a',
    '> context-isolated subagent; under Codex it runs inline in the current context.',
  ].join('\n');
  return { name, content: `${frontmatter}\n\n${provenance}\n\n${body}` };
}

/**
 * Stage every core agent into <project>/.agents/skills/<name>/SKILL.md so Codex
 * discovers the same five capabilities Claude gets from the plugin. Idempotent:
 * re-running overwrites each compiled file in place. Returns how many were
 * staged so the adapter phrases its own status line. `sourceRoot` is the located
 * `packages/core` tree (findCoreSource).
 */
export async function wireCodexAgents(projectRoot: string, sourceRoot: string): Promise<number> {
  const agentsDir = join(sourceRoot, 'agents');
  if (!existsSync(agentsDir)) return 0;
  const entries = await readdir(agentsDir, { withFileTypes: true });
  let staged = 0;
  for (const entry of entries) {
    // `.source` sidecars sit next to the definitions; only `.md` is an agent.
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const compiled = compileAgentToSkill(await readFile(join(agentsDir, entry.name), 'utf8'));
    if (compiled === undefined) continue;
    const dir = join(projectRoot, CODEX_SKILLS_DIR, compiled.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), compiled.content);
    staged += 1;
  }
  return staged;
}
