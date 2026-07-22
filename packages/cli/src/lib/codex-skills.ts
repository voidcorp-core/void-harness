// Stage the harness skills into a consumer project for Codex. Claude Code
// auto-discovers the plugin's skills from the marketplace; Codex has no such
// channel — it discovers skills by directory convention, scanning `.agents/skills`
// from the cwd up to the repo root (per the official Codex skills docs). Without
// this, a Codex-wired project got the doctrine via AGENTS.md but NONE of the
// invocable skills — the multi-runtime promise was unmet (issue #125).
//
// Scope: the 36 core skills (they ship in the CLI tarball via core-assets/skills).
// Pack skills are not bundled in the CLI yet — a separate bundling step is needed
// before they can be staged for Codex.
//
// This module owns the Codex-skills domain: the pure filters (frontmatter parse,
// eligibility) and the imperative staging (wire) + the health read `doctor` uses.

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Directory Codex scans for project-local skills. Relative to the project root;
// Codex resolves it from the cwd up to the repo root.
export const CODEX_SKILLS_DIR = '.agents/skills';

async function readOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Narrow an unknown YAML value to a plain object without a cast or a null literal. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recover just `runtimes` from a frontmatter block that strict YAML rejects.
 * Several skills carry an unquoted `:` in their `description` (e.g. "Iron Law:
 * ..."), which is technically-invalid YAML the rest of the repo's tolerant
 * parsers accept. The `runtimes:` line is its own inline list, unaffected by that
 * — so we can still read eligibility rather than silently dropping the skill.
 */
function runtimesFallback(body: string): Record<string, unknown> {
  const line = body.match(/^runtimes:\s*\[([^\]]*)\]/m);
  if (!line) return {};
  const runtimes = (line[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { runtimes };
}

/**
 * Parse the leading YAML frontmatter block of a SKILL.md. Prefers a strict YAML
 * parse; on failure (a malformed-but-tolerated frontmatter) falls back to
 * recovering `runtimes` by scan, so an unquoted description never silently
 * excludes a skill from the Codex surface. Returns {} only when there is truly
 * no frontmatter. Never throws.
 */
export function parseFrontmatter(md: string): Record<string, unknown> {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const body = match[1] ?? '';
  try {
    const parsed: unknown = parseYaml(body);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Strict YAML failed — fall through to the tolerant recovery below.
  }
  return runtimesFallback(body);
}

/**
 * True when the skill opts into Codex via its `runtimes` list. Opt-in by design:
 * a skill with no `runtimes` field (or one that omits `codex`) is NOT staged, so
 * a Claude-only skill never leaks into the Codex surface.
 */
export function isCodexEligible(frontmatter: Record<string, unknown>): boolean {
  const runtimes = frontmatter.runtimes;
  return Array.isArray(runtimes) && runtimes.includes('codex');
}

/**
 * The Codex-eligible core skill names under `<sourceRoot>/skills`, sorted. Reads
 * each SKILL.md's frontmatter; a directory without a readable SKILL.md, or one
 * not opting into `codex`, is skipped. `sourceRoot` is findCoreSource().
 */
export async function listCodexSkills(sourceRoot: string): Promise<string[]> {
  const skillsDir = join(sourceRoot, 'skills');
  if (!existsSync(skillsDir)) return [];
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const eligible: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const md = await readOrUndefined(join(skillsDir, entry.name, 'SKILL.md'));
    if (md !== undefined && isCodexEligible(parseFrontmatter(md))) eligible.push(entry.name);
  }
  return eligible.sort();
}

/**
 * Stage every Codex-eligible core skill into <project>/.agents/skills/<name>/SKILL.md
 * (imperative shell). Idempotent: re-running overwrites in place. Returns how many
 * skills were staged so the caller phrases its own status line.
 */
export async function wireCodexSkills(projectRoot: string, sourceRoot: string): Promise<number> {
  const names = await listCodexSkills(sourceRoot);
  const dst = join(projectRoot, CODEX_SKILLS_DIR);
  await mkdir(dst, { recursive: true });
  for (const name of names) {
    const skillDst = join(dst, name);
    await mkdir(skillDst, { recursive: true });
    await cp(join(sourceRoot, 'skills', name, 'SKILL.md'), join(skillDst, 'SKILL.md'));
  }
  return names.length;
}

export interface CodexSkillsHealth {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Health of the staged Codex skills, for `doctor`. Never throws. Verifies the
 * skills are actually discoverable by Codex (present under `.agents/skills/<name>/
 * SKILL.md`), not merely that the directory exists.
 */
export async function codexSkillsHealth(projectRoot: string): Promise<CodexSkillsHealth> {
  const dir = join(projectRoot, CODEX_SKILLS_DIR);
  if (!existsSync(dir)) {
    return { ok: false, detail: `${CODEX_SKILLS_DIR} missing — no Codex skills wired (run void-harness init)` };
  }
  const entries = await readdir(dir, { withFileTypes: true });
  let discoverable = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md'))) discoverable += 1;
  }
  if (discoverable === 0) {
    return { ok: false, detail: `${CODEX_SKILLS_DIR} present but no SKILL.md staged` };
  }
  return { ok: true, detail: `${discoverable} skill(s) discoverable in ${CODEX_SKILLS_DIR}/` };
}
