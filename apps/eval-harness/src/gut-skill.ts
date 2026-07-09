const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

/**
 * The injectable body of a SKILL.md: everything AFTER the YAML frontmatter. A
 * loaded skill contributes its instructions, not its frontmatter — and crucially
 * the `description` field often summarizes the whole skill, which would leak the
 * signal into a "gutted" run and defeat the sensitivity check. So the eval injects
 * the body, never the frontmatter.
 */
export function skillBody(md: string): string {
  const fm = md.match(FRONTMATTER);
  return md.slice(fm ? fm[0].length : 0).replace(/^\n+/, '');
}

/**
 * A "gutted" body: the first H1 only, all load-bearing prose (and the frontmatter)
 * removed. Used by the sensitivity check — a real skill must beat its own gutted
 * version, else the eval is measuring something other than the prose.
 */
export function gutSkill(md: string): string {
  const body = skillBody(md);
  const h1 = body.match(/^#\s+.*$/m);
  return h1 ? `${h1[0]}\n` : '';
}
