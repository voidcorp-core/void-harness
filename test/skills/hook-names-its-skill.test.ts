/**
 * A refusal must say which doctrine it is enforcing.
 *
 * Thirteen PreToolUse rules refuse writes in this harness, and they refused
 * anonymously: "any weakens the type boundary" names the rule and not the skill
 * that explains it. So the enforcement layer worked while the doctrine layer sat
 * unread, which is exactly the shape of the failure this whole chantier is about.
 * Over the observed telemetry there were 26,440 hook executions and 4 skill
 * activations.
 *
 * Naming the skill in the refusal is the cheapest possible fix: one line, no
 * automatic loading, and the model reaches for the skill only if it needs more
 * than the rule. That is the progressive disclosure the Agent Skills spec asks
 * for, and unlike `paths` it works identically on Claude and Codex, since both
 * run the same hook runner.
 *
 * The association is not invented here. `relations.graph.yaml` already declares
 * 24 `enforces` edges from a hook to the skill it enforces, with evidence. This
 * test holds the runner's table to that declaration, so the two cannot drift.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { governingSkill, RULE_NAMES } from '../../packages/hook-runner/src/enforcement/governing-skill.js';
import { loadDeclaredEdges } from '../../packages/harness-graph/src/relations/load.js';

const ROOT = new URL('../../', import.meta.url);

const EDGES = loadDeclaredEdges(
  readFileSync(new URL('packages/harness-graph/relations.graph.yaml', ROOT), 'utf8'),
);

/** Skills that exist on disk, which is what a name has to resolve to. */
function skillExists(name: string): boolean {
  try {
    readFileSync(new URL(`packages/core/skills/${name}/SKILL.md`, ROOT), 'utf8');
    return true;
  } catch {
    return false;
  }
}

describe('every enforcement rule names the doctrine it enforces', () => {
  it.each(RULE_NAMES)('%s resolves to a skill that exists', (rule) => {
    const skill = governingSkill(rule);
    expect(skill).not.toBe('');
    expect(skillExists(skill), `${rule} -> ${skill}`).toBe(true);
  });

  /**
   * The graph is the declaration; the runner's table is the copy that ships
   * inside the compiled hook. A copy that no one compares drifts, which is how
   * `ticket-writer` stayed in a live event stream a day after it was renamed.
   */
  it.each(RULE_NAMES)('%s agrees with the enforces edge declared in the graph', (rule) => {
    const declared = EDGES.filter(
      (edge) => edge.kind === 'enforces' && edge.from.startsWith('hook:') && edge.to.startsWith('skill:'),
    );
    // A rule maps to a hook by name or by the hook's `-grep` / `-guard` suffix.
    const match = declared.filter((edge) => {
      const hook = edge.from.slice('hook:'.length);
      return hook === rule || hook.startsWith(`${rule}-`) || rule.startsWith(hook.replace(/-(?:grep|guard|lint)$/, ''));
    });
    if (match.length === 0) return; // Not every rule has a declared edge yet.
    const targets = new Set(match.map((edge) => edge.to.slice('skill:'.length)));
    expect(targets.has(governingSkill(rule)), `${rule}: graph says ${[...targets].join(', ')}`).toBe(true);
  });

  /**
   * End to end, through the bundle a consumer actually runs. The unit test above
   * proves the table; this proves the sentence reaches the person who was just
   * refused, which is the only place it does any good.
   */
  it('names the doctrine in the refusal a consumer sees', () => {
    const bundle = fileURLToPath(new URL('packages/core/hooks/_void-hook.mjs', ROOT));
    if (!existsSync(bundle)) return; // built by `pnpm hooks:build`; CI builds before testing.
    const root = fileURLToPath(ROOT).replace(/\/$/, '');
    const payload = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: `${root}/packages/cli/src/probe.ts`, content: 'const x: any = 1;' },
    });
    const run = spawnSync(process.execPath, [bundle, 'enforce', 'no-any', 'claude'], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, VOID_PROJECT_ROOT: root },
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('typescript-strict');
  });
});
