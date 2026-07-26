import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { isCodexEligible, packSkillsDir, parseFrontmatter } from './codex-skills.js';
import { wiredHooks } from './plugin-cache.js';
import { compileClaudeSpecialist } from './specialists/compile-claude.js';
import { loadSpecialists } from './specialists/load.js';

export type InstallSource = 'local' | 'marketplace';

export interface ClaudeLocalAssets {
  readonly skills: number;
  readonly agents: number;
  readonly commands: number;
  readonly hooks: number;
  readonly hookConfiguration: Record<string, unknown>;
}

function isClaudeEligible(frontmatter: Record<string, unknown>): boolean {
  const runtimes = frontmatter.runtimes;
  return Array.isArray(runtimes) && runtimes.includes('claude');
}

async function readOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function stageSkills(
  sourceDirectory: string,
  destination: string,
  runtime: 'claude' | 'codex',
): Promise<number> {
  if (!existsSync(sourceDirectory)) return 0;
  const eligible = runtime === 'claude' ? isClaudeEligible : isCodexEligible;
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillRoot = join(sourceDirectory, entry.name);
    const markdown = await readOrUndefined(join(skillRoot, 'SKILL.md'));
    if (markdown === undefined || !eligible(parseFrontmatter(markdown))) continue;
    await cp(skillRoot, join(destination, entry.name), {
      recursive: true,
      filter: (path) => !path.endsWith('.test.ts') && !path.endsWith(`${sep}.source`),
    });
    count += 1;
  }
  return count;
}

async function stageMarkdownDirectory(source: string, destination: string): Promise<number> {
  if (!existsSync(source)) return 0;
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    await cp(join(source, entry.name), join(destination, entry.name));
    count += 1;
  }
  return count;
}

async function stageClaudeAgents(
  sourceRoot: string,
  destination: string,
): Promise<number> {
  const authored = await stageMarkdownDirectory(join(sourceRoot, 'agents'), destination);
  const specialists = await loadSpecialists(sourceRoot);
  await mkdir(destination, { recursive: true });
  let added = 0;
  for (const contract of specialists) {
    const compiled = compileClaudeSpecialist(contract);
    const target = join(destination, `${compiled.name}.md`);
    const current = await readOrUndefined(target);
    if (current !== undefined && current !== compiled.content) {
      throw new Error(`Claude agent '${compiled.name}' conflicts with its canonical specialist`);
    }
    if (current === undefined) added += 1;
    await writeFile(target, compiled.content);
  }
  return authored + added;
}

function rewriteHookCommand(command: string): string {
  return command.replace(
    /"?\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([A-Za-z0-9._-]+)"?/g,
    '"$CLAUDE_PROJECT_DIR/.void/hooks/$1"',
  );
}

function rewriteCommands(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteCommands);
  if (typeof value !== 'object' || value === null) return value;
  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    rewritten[key] = key === 'command' && typeof child === 'string'
      ? rewriteHookCommand(child)
      : rewriteCommands(child);
  }
  return rewritten;
}

/** Compile plugin-relative Claude hook commands into project-local commands. */
export function compileClaudeHooks(hooks: unknown): Record<string, unknown> {
  const compiled = rewriteCommands(hooks);
  if (typeof compiled !== 'object' || compiled === null || Array.isArray(compiled)) {
    throw new Error('Claude hooks configuration is not an object');
  }
  return compiled as Record<string, unknown>;
}

async function stageHooks(
  projectRoot: string,
  sourceRoot: string,
  assets: readonly string[],
): Promise<number> {
  const source = join(sourceRoot, 'hooks');
  const destination = join(projectRoot, '.void', 'hooks');
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const asset of assets) {
    const name = asset.replace(/^hooks\//, '');
    const target = join(destination, name);
    await cp(join(source, name), target);
    if (name.endsWith('.sh')) await chmod(target, 0o755);
    count += 1;
  }
  return count;
}

/**
 * Materialize Claude's native project surfaces from the bundled npm assets.
 * No network, account, global cache, marketplace or runtime executable needed.
 */
export async function wireClaudeLocalAssets(
  projectRoot: string,
  sourceRoot: string,
  packDirectories: readonly string[],
): Promise<ClaudeLocalAssets> {
  const skillsDestination = join(projectRoot, '.claude', 'skills');
  await mkdir(skillsDestination, { recursive: true });
  let skills = await stageSkills(join(sourceRoot, 'skills'), skillsDestination, 'claude');
  for (const packDirectory of packDirectories) {
    const source = packSkillsDir(sourceRoot, packDirectory);
    if (source !== undefined) skills += await stageSkills(source, skillsDestination, 'claude');
  }
  const manifest = JSON.parse(
    await readFile(join(sourceRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  ) as { hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>> };
  if (manifest.hooks === undefined) throw new Error('core Claude manifest has no hooks');
  const hookAssets = wiredHooks({ hooks: manifest.hooks });
  const [agents, commands, hooks] = await Promise.all([
    stageClaudeAgents(sourceRoot, join(projectRoot, '.claude', 'agents')),
    stageMarkdownDirectory(join(sourceRoot, 'commands'), join(projectRoot, '.claude', 'commands')),
    stageHooks(projectRoot, sourceRoot, hookAssets),
  ]);
  return {
    skills,
    agents,
    commands,
    hooks,
    hookConfiguration: compileClaudeHooks(manifest.hooks),
  };
}

export async function localPackAssetIssues(
  projectRoot: string,
  sourceRoot: string,
  packDirectories: readonly string[],
  runtimes: readonly ('claude' | 'codex')[],
): Promise<string[]> {
  const issues: string[] = [];
  for (const packDirectory of packDirectories) {
    const source = packSkillsDir(sourceRoot, packDirectory);
    if (source === undefined) {
      issues.push(`${packDirectory}: bundled skills missing`);
      continue;
    }
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const markdown = await readOrUndefined(join(source, entry.name, 'SKILL.md'));
      if (markdown === undefined) continue;
      const frontmatter = parseFrontmatter(markdown);
      if (
        runtimes.includes('claude')
        && isClaudeEligible(frontmatter)
        && !existsSync(join(projectRoot, '.claude', 'skills', entry.name, 'SKILL.md'))
      ) {
        issues.push(`${packDirectory}/${entry.name}: Claude asset missing`);
      }
      if (
        runtimes.includes('codex')
        && isCodexEligible(frontmatter)
        && !existsSync(join(projectRoot, '.agents', 'skills', entry.name, 'SKILL.md'))
      ) {
        issues.push(`${packDirectory}/${entry.name}: Codex asset missing`);
      }
    }
  }
  return issues;
}
