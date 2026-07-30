import { describe, expect, it } from 'vitest';
import { planCiTriggers, type WorkflowSource } from './ci-trigger-plan.js';

function wf(name: string, on: string): WorkflowSource {
  return { name, text: `name: ${name}\n${on}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps: []\n` };
}

const BRANCH = 'autopilot/cluster-1';
const BASE = 'main';

function plan(workflows: readonly WorkflowSource[]) {
  return planCiTriggers(workflows, { branch: BRANCH, baseBranch: BASE });
}

function verdict(workflows: readonly WorkflowSource[], name = 'w') {
  return plan(workflows).workflows.find((w) => w.workflow === name);
}

describe('planCiTriggers', () => {
  it('classifies a pull-request-only workflow as one run', () => {
    const result = verdict([wf('w', 'on:\n  pull_request:\n    branches: [main]')]);

    expect(result).toMatchObject({ classification: 'pull-request-only', expectedRuns: 1 });
  });

  it('classifies a push-only workflow that matches the integration branch', () => {
    const result = verdict([wf('w', "on:\n  push:\n    branches: ['autopilot/**']")]);

    expect(result).toMatchObject({ classification: 'push-only', expectedRuns: 1 });
  });

  it('counts two runs when a workflow listens to both, because push then PR are separate events', () => {
    // Documented behaviour: a commit does not fire both at once, but pushing
    // the branch and then opening the PR produces one run each.
    const result = verdict([wf('w', "on:\n  push:\n    branches: ['autopilot/**']\n  pull_request:\n    branches: [main]")]);

    expect(result).toMatchObject({ classification: 'redundant', expectedRuns: 2 });
  });

  it('does not count a push run whose branch filter excludes the integration branch', () => {
    // `branches: [main]` will never see autopilot/cluster-1. Announcing a run
    // that cannot happen is as wrong as missing one.
    const result = verdict([wf('w', 'on:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]')]);

    expect(result).toMatchObject({ classification: 'pull-request-only', expectedRuns: 1 });
  });

  it('does not count a pull_request run whose base filter excludes our base', () => {
    const result = verdict([wf('w', 'on:\n  pull_request:\n    branches: [release]')]);

    expect(result).toMatchObject({ classification: 'none', expectedRuns: 0 });
  });

  it('reads the bare string form', () => {
    expect(verdict([wf('w', 'on: pull_request')])).toMatchObject({
      classification: 'pull-request-only',
      expectedRuns: 1,
    });
  });

  it('reads the array form', () => {
    expect(verdict([wf('w', 'on: [push, pull_request]')])).toMatchObject({
      classification: 'redundant',
      expectedRuns: 2,
    });
  });

  it('treats an unfiltered push as matching any branch', () => {
    expect(verdict([wf('w', 'on:\n  push:')])).toMatchObject({ classification: 'push-only', expectedRuns: 1 });
  });

  it('honours branches-ignore', () => {
    const result = verdict([wf('w', "on:\n  push:\n    branches-ignore: ['autopilot/**']")]);

    expect(result).toMatchObject({ classification: 'none', expectedRuns: 0 });
  });

  it('classifies a manual-only workflow as never firing on its own', () => {
    expect(verdict([wf('w', 'on:\n  workflow_dispatch: {}')])).toMatchObject({
      classification: 'manual',
      expectedRuns: 0,
    });
  });

  it('classifies a reusable workflow as manual, since its caller decides', () => {
    expect(verdict([wf('w', 'on:\n  workflow_call: {}')])).toMatchObject({ classification: 'manual' });
  });

  it('refuses to guess on invalid YAML', () => {
    const result = verdict([{ name: 'w', text: 'on: [push\njobs:' }]);

    expect(result).toMatchObject({ classification: 'unknown', expectedRuns: null });
    expect(result?.detail).toMatch(/yaml/i);
  });

  it('refuses to guess when a filter carries an expression it cannot evaluate', () => {
    const result = verdict([wf('w', "on:\n  push:\n    branches: ['${{ env.BRANCH }}']")]);

    expect(result).toMatchObject({ classification: 'unknown', expectedRuns: null });
  });

  it('refuses to guess on a workflow with no on: key at all', () => {
    expect(verdict([{ name: 'w', text: 'name: w\njobs: {}\n' }])).toMatchObject({ classification: 'unknown' });
  });

  it('resolves a YAML anchor rather than reporting unknown', () => {
    // Anchors are resolved by the parser; only genuinely undecidable syntax is
    // unknown, or the classification degrades into noise.
    const text = "x: &base ['autopilot/**']\non:\n  push:\n    branches: *base\njobs: {}\n";
    expect(verdict([{ name: 'w', text }])).toMatchObject({ classification: 'push-only' });
  });

  it('reports paths filters as undecidable, because the diff is not known here', () => {
    const result = verdict([wf('w', "on:\n  push:\n    paths: ['src/**']")]);

    expect(result).toMatchObject({ classification: 'unknown' });
    expect(result?.detail).toMatch(/paths/i);
  });
});

describe('the aggregate budget', () => {
  it('sums the expected runs across workflows', () => {
    const result = plan([
      wf('a', 'on:\n  pull_request:\n    branches: [main]'),
      wf('b', "on:\n  push:\n    branches: ['autopilot/**']\n  pull_request:\n    branches: [main]"),
    ]);

    expect(result.expectedRuns).toBe(3);
    expect(result.singleRunGuaranteed).toBe(false);
  });

  it('reports a guaranteed single run when every workflow fires once at most', () => {
    const result = plan([wf('a', 'on:\n  pull_request:\n    branches: [main]')]);

    expect(result.singleRunGuaranteed).toBe(true);
  });

  it('refuses to guarantee anything when one workflow is unknown', () => {
    const result = plan([wf('a', 'on:\n  pull_request:\n    branches: [main]'), { name: 'b', text: 'on: [push' }]);

    expect(result.singleRunGuaranteed).toBe(false);
    expect(result.expectedRuns).toBeNull();
    expect(result.unknowns).toEqual(['b']);
  });

  it('never proposes disabling a check, whatever the classification', () => {
    // The honest answer to "two runs will happen" is to say so, not to switch
    // one off. A required check exists because someone decided it should.
    const serialized = JSON.stringify(
      plan([wf('a', "on:\n  push:\n    branches: ['autopilot/**']\n  pull_request:\n    branches: [main]")]),
    );

    expect(serialized).not.toMatch(/disable|skip|remove|paths-ignore/i);
  });

  it('handles an empty workflow set', () => {
    const result = plan([]);

    expect(result.expectedRuns).toBe(0);
    expect(result.singleRunGuaranteed).toBe(true);
  });
});
