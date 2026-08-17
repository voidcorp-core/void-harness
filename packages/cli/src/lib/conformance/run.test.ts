import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRepair, conformanceRules, inspectConformance, treeIsDirty } from './run.js';

/**
 * The guards around `--fix` matter more than any single rule: this writes into
 * a project that is not the harness's own, and every guard closes one way a
 * repair stops being reversible.
 */

let root: string;

const MONOLITH = `# Architecture Decisions

### 01. First real choice

Context: something.

### 02. Second real choice

Context: something else.
`;

function repo(options: { monolith?: string } = {}): void {
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 't@t.io'],
    ['config', 'user.name', 'T'],
    ['config', 'commit.gpgsign', 'false'],
  ]) {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  }
  mkdirSync(join(root, 'docs'), { recursive: true });
  if (options.monolith !== undefined) {
    writeFileSync(join(root, 'docs', 'DECISIONS.md'), options.monolith);
  }
  writeFileSync(join(root, 'README.md'), '# x\n');
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: root, stdio: 'ignore' });
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'void-conf-')));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('treeIsDirty', () => {
  it('is false on a clean repository', () => {
    repo();

    expect(treeIsDirty(root)).toBe(false);
  });

  it('is true once a file is changed', () => {
    repo();
    writeFileSync(join(root, 'README.md'), '# changed\n');

    expect(treeIsDirty(root)).toBe(true);
  });

  // Without git the repair is neither reviewable as a diff nor undoable with a
  // checkout, which is exactly what the guard protects.
  it('treats a directory that is not a repository as dirty', () => {
    expect(treeIsDirty(root)).toBe(true);
  });
});

describe('inspectConformance', () => {
  it('finds nothing to do in a project with no monolith', () => {
    repo();

    expect(inspectConformance(root).findings).toEqual([]);
  });

  it('reports the drift and offers the repair on a clean tree', () => {
    repo({ monolith: MONOLITH });

    const plan = inspectConformance(root);

    expect(plan.findings[0]?.ruleId).toBe('decisions-format');
    expect(plan.repairable).toEqual(['decisions-format']);
    expect(plan.blocked).toBe(undefined);
  });

  it('withholds the repair on a dirty tree and says why', () => {
    repo({ monolith: MONOLITH });
    writeFileSync(join(root, 'README.md'), '# changed\n');

    const plan = inspectConformance(root);

    expect(plan.findings).toHaveLength(1);
    expect(plan.repairable).toEqual([]);
    expect(plan.blocked).toContain('uncommitted');
  });
});

describe('applyRepair', () => {
  const rule = () => conformanceRules()[0] as ReturnType<typeof conformanceRules>[number];

  it('writes nothing in dry-run, and names what it would write', () => {
    repo({ monolith: MONOLITH });

    const applied = applyRepair(rule(), root, { dryRun: true });

    expect(applied.written.length).toBeGreaterThan(0);
    expect(readdirSync(join(root, 'docs'))).toEqual(['DECISIONS.md']);
  });

  it('writes one record per decision, plus the frozen monolith', () => {
    repo({ monolith: MONOLITH });

    applyRepair(rule(), root, { dryRun: false });

    const records = readdirSync(join(root, 'docs', 'decisions-log'));
    expect(records).toHaveLength(2);
    expect(readFileSync(join(root, 'docs', 'DECISIONS.md'), 'utf8')).toContain(
      'Frozen legacy snapshot',
    );
  });

  it('carries each decision body through unchanged', () => {
    repo({ monolith: MONOLITH });

    applyRepair(rule(), root, { dryRun: false });

    const dir = join(root, 'docs', 'decisions-log');
    const bodies = readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8'));
    expect(bodies.join('\n')).toContain('Context: something.');
    expect(bodies.join('\n')).toContain('Context: something else.');
  });

  // The marker the repair writes is the signal detection reads, so a second run
  // must find nothing left to do.
  it('is idempotent: a second inspection reports no drift', () => {
    repo({ monolith: MONOLITH });
    applyRepair(rule(), root, { dryRun: false });

    execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['commit', '-qm', 'migrate'], { cwd: root, stdio: 'ignore' });

    expect(inspectConformance(root).findings).toEqual([]);
  });

  it('leaves an existing record untouched', () => {
    repo({ monolith: MONOLITH });
    applyRepair(rule(), root, { dryRun: false });
    const dir = join(root, 'docs', 'decisions-log');
    const [first] = readdirSync(dir);
    writeFileSync(join(dir, first as string), 'HAND EDITED\n');

    applyRepair(rule(), root, { dryRun: false });

    expect(readFileSync(join(dir, first as string), 'utf8')).toBe('HAND EDITED\n');
  });
});
