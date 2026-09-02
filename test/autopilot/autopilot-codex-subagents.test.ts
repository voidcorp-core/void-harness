/**
 * Parity between the two adapters, over the same fixtures.
 *
 * Scope, stated plainly: this pins CONTRACT parity — both adapters consume the
 * same OrchestrationPlan, derive execution from it rather than re-deriving it,
 * carry the same worker instruction and the same prohibitions. Behavioural
 * parity of a real Codex run needs an execution conformance gate, which belongs
 * to the certification range, not here. Asserting more than that from a
 * markdown file would be theatre.
 *
 * What this does catch, and it is the failure that actually happens: the two
 * adapters drifting until one of them decides something the other does not.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOrchestrationPlan } from '../../packages/cli/src/lib/autopilot/orchestration-plan.js';

const WORKFLOW = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/workflows/autopilot.workflow.js', import.meta.url),
  'utf8',
);
const CODEX = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/references/codex-subagents.md', import.meta.url),
  'utf8',
);

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

const FIXTURES = {
  'four disjoint tickets': { parallel: ['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4'], sequential: [] },
  'two and two': { parallel: ['DEV-1', 'DEV-2'], sequential: ['DEV-3', 'DEV-4'] },
  'a lone migration': { parallel: [], sequential: ['DEV-1'] },
} as const;

function planFor(fixture: { parallel: readonly string[]; sequential: readonly string[] }) {
  return buildOrchestrationPlan({
    runId: 'run-a',
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: SHA },
    parallel: fixture.parallel,
    sequential: fixture.sequential,
    clusterSize: 4,
    planPath: 'plans/p.md',
    specPath: 'docs/specs/s.md',
  });
}

describe('one plan, two adapters', () => {
  it.each(Object.entries(FIXTURES))('%s produces one unambiguous execution order', (_name, fixture) => {
    const plan = planFor(fixture);

    // The order both adapters must follow is a property of the PLAN, not of
    // either runtime: parallel lane first, then sequential by ascending order.
    const expected = [
      ...plan.assignments.filter((a) => a.lane === 'parallel').map((a) => a.ticketId),
      ...plan.assignments
        .filter((a) => a.lane === 'sequential')
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((a) => a.ticketId),
    ];

    expect(expected).toEqual([...fixture.parallel, ...fixture.sequential]);
    expect(plan.concurrency).toBe(Math.max(1, fixture.parallel.length));
  });

  it('gives every ticket its own worktree and branch in every fixture', () => {
    for (const fixture of Object.values(FIXTURES)) {
      const plan = planFor(fixture);
      const paths = new Set(plan.assignments.map((a) => a.worktreePath));
      const branches = new Set(plan.assignments.map((a) => a.branch));

      expect(paths.size).toBe(plan.assignments.length);
      expect(branches.size).toBe(plan.assignments.length);
      expect([...paths].every((path) => path.startsWith('.void/autopilot/run-a/worktrees/'))).toBe(true);
    }
  });
});

describe('the Codex adapter executes rather than plans', () => {
  it('forbids re-deriving the lanes it was given', () => {
    expect(CODEX).toMatch(/Do not re-derive lanes/i);
    expect(CODEX).toMatch(/do not reorder/i);
  });

  it('honours the same lane semantics as the workflow', () => {
    expect(CODEX).toMatch(/lane: "parallel"/);
    expect(CODEX).toMatch(/lane: "sequential"/);
    expect(CODEX).toMatch(/plan\.concurrency/);
    expect(CODEX).toMatch(/ascending `order`/);

    expect(WORKFLOW).toMatch(/lane === 'parallel'/);
    expect(WORKFLOW).toMatch(/lane === 'sequential'/);
    expect(WORKFLOW).toMatch(/a\.order - b\.order/);
  });

  it('requires the pre-created worktree and refuses the main checkout, like the workflow', () => {
    const flatCodex = CODEX.replace(/\s+/g, ' ');
    expect(flatCodex).toMatch(/worktrees already exist/i);
    expect(flatCodex).toMatch(/do not fall back to the main checkout/i);
    expect(WORKFLOW).toMatch(/worktreePath/);
  });

  it('reports unsupported-runtime instead of improvising a missing capability', () => {
    expect(CODEX).toMatch(/unsupported-runtime/);
  });
});

describe('both adapters carry the same worker contract', () => {
  const clauses: readonly [string, RegExp][] = [
    ['runs implement whole and once', /whole and once/i],
    ['re-fetches the complete ticket', /never work from a summary|Never work from a summary/i],
    ['keeps migrations to dev/local', /dev\/local/i],
    ['forbids pushing', /push/i],
    ['forbids opening a pull request', /pull request/i],
    ['forbids merging', /merge/i],
    ['forbids moving the ticket', /In Review/i],
    ['forbids writing what the repository shares', /shares across its worktrees/i],
    ['names the shared stack that bit', /refs\/stash/],
    ['gives the replacement gesture', /git diff/i],
    ['requires a WorkerResult', /WorkerResult/],
  ];

  // Both sources are prose that reflows; the clauses are about wording.
  const flat = (source: string): string => source.replace(/\s+/g, ' ');

  it.each(clauses)('%s — in the Claude workflow', (_clause, pattern) => {
    expect(flat(WORKFLOW)).toMatch(pattern);
  });

  it.each(clauses)('%s — in the Codex instruction', (_clause, pattern) => {
    expect(flat(CODEX)).toMatch(pattern);
  });

  // Prose parity is checked by wording above; this one is checked by shape. A
  // prohibition added to the plan reaches the Claude workflow for free, because
  // it renders them; the Codex reference is written by hand, and on 2026-09-01
  // a new refusal reached one adapter and not the other while the reference went
  // on claiming both received the same instruction.
  it('names every prohibition the plan carries, in both adapters', () => {
    const plan: Record<string, unknown> = planFor(FIXTURES['two and two']);
    const flags = Object.keys(plan).filter((key) => key.startsWith('workerMay'));

    expect(flags.length).toBeGreaterThan(3);
    for (const flag of flags) {
      expect(WORKFLOW, `${flag} in the Claude workflow`).toContain(flag);
      expect(CODEX, `${flag} in the Codex reference`).toContain(flag);
    }
  });

  // The generic check above holds the FIELD in both briefs. This one holds the
  // gesture: `mission prune` reads as housekeeping, and a worker that only sees
  // a flag name it does not recognise runs the command the flag is about.
  it('names the mission journals a worker may not prune, in both adapters', () => {
    for (const source of [WORKFLOW, CODEX]) {
      expect(flat(source)).toMatch(/mission prune/);
      expect(source).toContain('workerMayPruneMissions');
    }
  });

  it('makes neither adapter a writer of state or tracker comments', () => {
    expect(CODEX).toMatch(/writes no run state/i);
    expect(WORKFLOW).toMatch(/never writes run state/i);
    // Neither may reach for a remote effect itself.
    for (const source of [WORKFLOW, CODEX]) {
      expect(source).not.toMatch(/git push|gh pr create|--auto-merge/);
    }
  });
});
