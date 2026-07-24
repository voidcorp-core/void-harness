// `void-harness audit` — the outbound self-evolution audit (issue #17 cluster C).
//
// Read canonical mission events plus legacy history and report which harness
// skills are active, stale or never fired. The never/stale lists are the signal a
// human weighs when proposing a deprecation. HITL: this reports, it never acts.
// Upstream-deprecation and decision-matrix-conflict detection are a documented
// follow-up (they need data sources beyond the usage log).

import * as p from '@clack/prompts';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type SkillAudit, auditFindings, auditSkills } from '../lib/audit.js';
import { loadCanonicalEventBody, loadSkillUsage } from '../lib/graph-io.js';
import { findCoreSource } from '../lib/paths.js';
import { checkGh } from '../lib/prerequisites.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { discoverProjects, findingToIssue, reconcileIssues, type IssueDraft } from '../lib/rollup.js';

const DEFAULT_STALE_DAYS = 30;

/** Where outbound harness feedback lands (doctrine tracker), per DECISIONS.md. */
const FEEDBACK_REPO = 'voidcorp-core/void-harness';

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
  const push = args.includes('--push');
  // A push aggregates across every registered project (a single repo's telemetry
  // is too thin to trust a "never fired" verdict); --all-projects opts in without pushing.
  const aggregate = push || args.includes('--all-projects');

  const coreSource = await findCoreSource();
  const allSkills = harnessSkills(coreSource);

  // Canonical mission events are authoritative; legacy logs preserve history.
  const projects = aggregate ? discoverProjects() : [root];
  const usage = (projects.length > 0 ? projects : [root]).flatMap((r) => loadSkillUsage(r));

  const report = auditSkills({ allSkills, usage, nowMs: Date.now(), staleDays });

  banner('audit');
  blank();
  if (aggregate) {
    line(`${c.dim('scope')} ${projects.length} registered project(s) ${c.dim(glyph.dot)} ${c.dim('~/.void index')}`);
  } else if (
    loadCanonicalEventBody(root) === ''
    && !existsSync(join(root, '.void', 'activations.jsonl'))
    && usage.length === 0
  ) {
    line(
      c.yellow('  no mission events yet - the activation hook populates .void/runs/*/events.jsonl.'),
    );
  }
  line(
    `${c.dim('skills')} ${allSkills.length} ${c.dim(glyph.dot)} ${c.green(`${report.active.length} active`)} ${c.dim(glyph.dot)} ${c.yellow(`${report.stale.length} stale`)} ${c.dim(glyph.dot)} ${c.dim(`${report.never.length} never`)} ${c.dim(`(stale > ${staleDays}d)`)}`,
  );

  reportSection('stale (used, but not in the window)', report.stale);
  reportSection('never fired', report.never);

  blank();
  if (push) {
    await pushFindings(report, projects.length, args.includes('--dry-run'));
    return;
  }
  if (report.stale.length === 0 && report.never.length === 0) {
    footer(c.dim('every harness skill has fired recently — nothing to propose.'));
  } else {
    footer(
      c.dim(
        'proposals are HITL: a stale/never skill is a candidate for deprecation, not an auto-action. `void-harness audit --push` files them as issues (dry-run by default).',
      ),
    );
  }
}

/** gh issue titles already carrying our label, so a re-run updates instead of duplicating. */
function existingFeedbackTitles(repo: string): Set<string> {
  const raw = execFileSync(
    'gh',
    ['issue', 'list', '--repo', repo, '--label', 'harness-feedback', '--state', 'all', '--limit', '200', '--json', 'title'],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(raw) as { title?: string }[];
  return new Set(parsed.map((i) => i.title ?? '').filter((t) => t !== ''));
}

/**
 * File the audit's deprecation-candidate findings as GitHub issues. HITL and safe
 * by construction: dry-run prints the plan and stops; a real push needs the human
 * to confirm the create/update plan first. A missing/unauthenticated gh fails LOUD
 * (never a silent no-op).
 */
async function pushFindings(report: AuditReportLike, projectCount: number, forceDryRun: boolean): Promise<void> {
  const drafts = auditFindings(report, projectCount).map(findingToIssue);
  if (drafts.length === 0) {
    footer(c.dim('no stale/never skills — nothing to file.'));
    return;
  }
  const gh = checkGh();
  if (!gh.ok) {
    line(c.red(`  cannot push: ${gh.message}`));
    if (gh.fix) line(c.dim(`  fix: ${gh.fix}`));
    return;
  }
  const existing = existingFeedbackTitles(FEEDBACK_REPO);
  const { create, update } = reconcileIssues(drafts, existing);
  line(c.bold(`  push plan -> ${FEEDBACK_REPO}`));
  for (const d of create) line(`    ${c.green('+ create')}  ${d.title}`);
  for (const d of update) line(`    ${c.yellow('~ exists')}  ${d.title}`);
  blank();
  if (forceDryRun) {
    footer(c.dim('dry-run: nothing was pushed. Re-run `--push` without `--dry-run` to file (you will be asked to confirm).'));
    return;
  }
  const ok = await p.confirm({
    message: `File ${create.length} new issue(s) to ${FEEDBACK_REPO}? (${update.length} already exist, left untouched)`,
  });
  if (p.isCancel(ok) || !ok) {
    footer(c.dim('aborted — nothing pushed.'));
    return;
  }
  for (const d of create) createIssue(FEEDBACK_REPO, d);
  footer(c.dim(`filed ${create.length} issue(s). HITL: triage them on the tracker.`));
}

function createIssue(repo: string, d: IssueDraft): void {
  execFileSync(
    'gh',
    ['issue', 'create', '--repo', repo, '--title', d.title, '--body', d.body, ...d.labels.flatMap((l) => ['--label', l])],
    { stdio: 'ignore' },
  );
}

/** Structural subset of AuditReport that auditFindings needs. */
type AuditReportLike = Parameters<typeof auditFindings>[0];

function reportSection(title: string, items: readonly SkillAudit[]): void {
  if (items.length === 0) return;
  blank();
  line(c.bold(`  ${title}`));
  for (const item of items) {
    const when = item.daysSince !== undefined ? c.dim(`${item.daysSince}d ago`) : c.dim('never');
    line(`    ${c.dim(glyph.dot)} ${item.skill.padEnd(40)} ${when}`);
  }
}
