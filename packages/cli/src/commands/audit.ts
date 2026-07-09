// `void-harness audit` — the outbound self-evolution audit (issue #17 cluster C).
//
// MVP scope (usage-log only): read .void/usage.log (written by the
// skill-usage-meter hook) and report which harness skills are active, which have
// gone stale, and which have never fired. The never/stale lists are the signal a
// human weighs when proposing a deprecation. HITL: this reports, it never acts.
// Upstream-deprecation and decision-matrix-conflict detection are a documented
// follow-up (they need data sources beyond the usage log).

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type SkillAudit, auditSkills } from '../lib/audit.js';
import { loadSkillUsage } from '../lib/graph-io.js';
import { findCoreSource } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';

const DEFAULT_STALE_DAYS = 30;

/** Harness skill names (`harness:<folder>`) discovered from the core tree. */
function harnessSkills(coreSource: string): string[] {
  const skillsDir = join(coreSource, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => existsSync(join(skillsDir, name, 'SKILL.md')))
    .map((name) => `harness:${name}`)
    .sort();
}

function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function audit(args: readonly string[]): Promise<void> {
  const root = process.cwd();
  const staleDays = Number.parseInt(flag(args, 'stale-days') ?? '', 10) || DEFAULT_STALE_DAYS;

  const coreSource = await findCoreSource();
  const allSkills = harnessSkills(coreSource);

  // Single source of truth: activations.jsonl (rich), merged with the legacy
  // usage.log for transition history only (issue #70).
  const usage = loadSkillUsage(root);

  const report = auditSkills({ allSkills, usage, nowMs: Date.now(), staleDays });

  banner('audit');
  blank();
  if (!existsSync(join(root, '.void', 'activations.jsonl')) && usage.length === 0) {
    line(
      c.yellow(`  no .void/activations.jsonl yet — the activation-meter hook populates it as skills fire.`),
    );
  }
  line(
    `${c.dim('skills')} ${allSkills.length} ${c.dim(glyph.dot)} ${c.green(`${report.active.length} active`)} ${c.dim(glyph.dot)} ${c.yellow(`${report.stale.length} stale`)} ${c.dim(glyph.dot)} ${c.dim(`${report.never.length} never`)} ${c.dim(`(stale > ${staleDays}d)`)}`,
  );

  reportSection('stale (used, but not in the window)', report.stale);
  reportSection('never fired', report.never);

  blank();
  if (report.stale.length === 0 && report.never.length === 0) {
    footer(c.dim('every harness skill has fired recently — nothing to propose.'));
  } else {
    footer(
      c.dim(
        'proposals are HITL: a stale/never skill is a candidate for deprecation, not an auto-action. Open a PR if you agree.',
      ),
    );
  }
}

function reportSection(title: string, items: readonly SkillAudit[]): void {
  if (items.length === 0) return;
  blank();
  line(c.bold(`  ${title}`));
  for (const item of items) {
    const when = item.daysSince !== undefined ? c.dim(`${item.daysSince}d ago`) : c.dim('never');
    line(`    ${c.dim(glyph.dot)} ${item.skill.padEnd(40)} ${when}`);
  }
}
