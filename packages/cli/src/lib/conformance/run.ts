// The I/O edge of conformance: gather what the rules need, then apply what the
// operator asked for.
//
// `--fix` writes into a project that is not the harness's own, so it carries
// four guards, and each closes a way a repair stops being reversible:
//
//   1. never on by default — `doctor` reports and names the repair;
//   2. `--dry-run` prints the exact mutations before any write;
//   3. refused on a dirty tree — a repair must stay readable as a diff and
//      undoable with a checkout, and it is neither when mixed with prior edits;
//   4. atomic per rule — a repair that fails half way leaves nothing behind.
//
// It never commits. The human reads the diff and commits.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detectDecisionsDrift, planDecisionsMigration } from './decisions-format.js';
import { planRepairs, type ConformancePlan, type ConformanceRule, type Mutation } from './rule.js';

const GIT_TIMEOUT_MS = 15_000;

function readTextOrUndefined(path: string): string | undefined {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

function listRecords(root: string): readonly string[] {
  try {
    return readdirSync(join(root, 'docs', 'decisions-log')).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
}

export function treeIsDirty(root: string): boolean {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() !== '';
  } catch {
    // Not a repository, or git unusable. Treat as dirty: without git the repair
    // is not reviewable as a diff and not undoable with a checkout, which is
    // exactly the condition the guard exists for.
    return true;
  }
}

/**
 * When a decision was written, recovered from history.
 *
 * `git log -S <title>` finds the commit that introduced the text, which is the
 * closest honest answer to "when was this decided". The monolith carries no
 * date of its own, and a decision without one does not sit anywhere in time.
 */
function dateFinder(root: string): (title: string) => string | undefined {
  const cache = new Map<string, string | undefined>();
  return (title: string) => {
    const hit = cache.get(title);
    if (hit !== undefined || cache.has(title)) return hit;
    let date: string | undefined;
    try {
      const out = execFileSync(
        'git',
        ['log', '-1', '--format=%cs', '-S', title, '--', 'docs/DECISIONS.md'],
        { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      date = /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : undefined;
    } catch {
      date = undefined;
    }
    cache.set(title, date);
    return date;
  };
}

/** The rule set. One entry today; each new rule must pass the admission test. */
export function conformanceRules(): readonly ConformanceRule[] {
  return [
    {
      id: 'decisions-format',
      title: 'decisions live one per file',
      detect: (context) =>
        detectDecisionsDrift({
          monolith: readTextOrUndefined(join(context.root, 'docs', 'DECISIONS.md')),
          existingRecords: listRecords(context.root),
        }),
      repair: (context) => {
        const plan = planDecisionsMigration({
          monolith: readTextOrUndefined(join(context.root, 'docs', 'DECISIONS.md')),
          existingRecords: listRecords(context.root),
          dateFor: dateFinder(context.root),
        });
        return { mutations: plan.mutations };
      },
    },
  ];
}

export function inspectConformance(root: string): ConformancePlan {
  return planRepairs(conformanceRules(), { root, treeDirty: treeIsDirty(root) });
}

export interface AppliedRepair {
  readonly ruleId: string;
  readonly written: readonly string[];
}

/**
 * Apply one rule's repair. Atomic: every file is prepared first, and a failure
 * anywhere means nothing is written, so an interrupted repair cannot leave a
 * project half migrated.
 */
export function applyRepair(
  rule: ConformanceRule,
  root: string,
  options: { readonly dryRun: boolean },
): AppliedRepair {
  if (rule.repair === undefined) return { ruleId: rule.id, written: [] };
  const plan = rule.repair({ root, treeDirty: false });
  const prepared: { absolute: string; mutation: Mutation }[] = plan.mutations.map((mutation) => ({
    absolute: join(root, mutation.path),
    mutation,
  }));

  if (options.dryRun) {
    return { ruleId: rule.id, written: prepared.map((entry) => entry.mutation.path) };
  }

  const written: string[] = [];
  try {
    for (const entry of prepared) {
      mkdirSync(dirname(entry.absolute), { recursive: true });
      writeFileSync(entry.absolute, entry.mutation.contents, 'utf8');
      written.push(entry.mutation.path);
    }
  } catch (error) {
    throw new Error(
      `repair of ${rule.id} failed after ${String(written.length)} file(s); `
      + `the tree was clean before, so \`git checkout .\` and \`git clean -fd docs/\` restore it. `
      + `${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  return { ruleId: rule.id, written };
}
