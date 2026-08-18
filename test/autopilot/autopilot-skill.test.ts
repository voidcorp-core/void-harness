/**
 * The autopilot skill is a contract, and these are the clauses that make it safe.
 *
 * Two properties are worth a gate rather than a review comment, because both
 * decay silently: that autopilot delegates the ticket cycle instead of restating
 * it, and that workers are denied every remote effect. A skill file drifts one
 * helpful paragraph at a time.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL = readFileSync(new URL('../../packages/core/skills/autopilot/SKILL.md', import.meta.url), 'utf8');
const TICKET_RUNNER = readFileSync(
  new URL('../../packages/core/skills/ticket-runner/SKILL.md', import.meta.url),
  'utf8',
);

function frontmatter(source: string): string {
  return /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
}

function body(source: string): string {
  return source.slice(source.indexOf('\n---', 4) + 4);
}

/** Markdown reflows; these assertions are about wording, not line breaks. */
function flat(source: string): string {
  return source.replace(/\s+/g, ' ');
}

describe('autopilot skill frontmatter', () => {
  it('declares both runtimes, because the plan is runtime-neutral by design', () => {
    expect(frontmatter(SKILL)).toContain('runtimes: [claude, codex]');
  });

  it('keeps its description within the discovery budget', () => {
    const description = /^description:\s*(.*)$/m.exec(frontmatter(SKILL))?.[1] ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(200);
  });

  it('stays under the skill size cap', () => {
    expect(SKILL.split('\n').length).toBeLessThanOrEqual(400);
  });
});

describe('delegation to ticket-runner', () => {
  it('names ticket-runner as the one owner of the per-ticket cycle', () => {
    expect(body(SKILL)).toMatch(/ticket-runner/);
    expect(body(SKILL)).toMatch(/owns no ticket cycle/i);
  });

  it('does not restate the quality passes ticket-runner owns', () => {
    // Autopilot may NAME the skill; it may not re-specify its passes. Two copies
    // of the cycle drift, and a ticket then gets a different standard depending
    // on how it was started.
    const passes = [
      'Architecture pass',
      'Migration safety',
      'TDD implementation',
      'Async + idempotency',
      'End-to-end tests',
      'UX/UI pass',
      'Security pass',
      'Verification before completion',
    ];
    const restated = passes.filter((pass) => body(SKILL).includes(pass));
    expect(restated).toEqual([]);

    // Sanity: those headings really are ticket-runner's, so the check above is
    // testing something real rather than passing on a typo.
    expect(passes.every((pass) => TICKET_RUNNER.includes(pass))).toBe(true);
  });

  it('does not carry a triage table of its own', () => {
    expect(body(SKILL)).not.toMatch(/\|\s*Pass\s*\|\s*Fires when/i);
  });
});

describe('remote effects are denied to workers', () => {
  it('states that workers never push, open a pull request, merge, or move a ticket', () => {
    const mayNot = /May not:([\s\S]*?)\n\n/.exec(body(SKILL))?.[1] ?? '';
    expect(mayNot).toMatch(/push/i);
    expect(mayNot).toMatch(/pull request/i);
    expect(mayNot).toMatch(/merge/i);
    expect(mayNot).toMatch(/In Review/i);
  });

  it('keeps merging a human gate with no escape hatch', () => {
    expect(body(SKILL)).toMatch(/never merges/i);
    expect(body(SKILL)).toMatch(/mergeGate: human/);
    // An auto-merge flag must not reappear as a documented capability.
    expect(body(SKILL)).not.toMatch(/--auto-merge/);
  });

  it('requires the controller to create every worktree before any spawn', () => {
    expect(flat(body(SKILL))).toMatch(/before any spawn/i);
    expect(flat(body(SKILL))).toMatch(/never chooses its own checkout and never works in the main one/i);
  });

  it('requires re-observation rather than concluding from a write that returned', () => {
    expect(flat(body(SKILL))).toMatch(/re-observe every ticket/i);
    expect(flat(body(SKILL))).toMatch(/Partial convergence releases what was taken/i);
  });

  it('keeps migrations sequential and out of production', () => {
    expect(flat(body(SKILL))).toMatch(/migration is never parallel/i);
    expect(flat(body(SKILL))).toMatch(/dev\/local/i);
  });
});

describe('provenance', () => {
  it('ships a .source next to the skill', () => {
    const source = readFileSync(new URL('../../packages/core/skills/autopilot/.source', import.meta.url), 'utf8');
    expect(source).toMatch(/backlog-autopilot/);
    expect(source).toMatch(/worktree/i);
  });

  it('records what was dropped from its predecessor, not only what was kept', () => {
    const audit = readFileSync(new URL('../../docs/plans/skill-audits/autopilot.md', import.meta.url), 'utf8');
    expect(audit).toMatch(/What was dropped/i);
    expect(audit).toMatch(/auto-merge/i);
  });
});
