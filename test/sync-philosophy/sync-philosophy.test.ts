/**
 * Tests for scripts/sync-philosophy.sh — the docs/ <-> packages/core/ doctrine
 * parity gate.
 *
 * The harness carries the same PHILOSOPHY.md three times: docs/PHILOSOPHY.md is
 * what we read, packages/core/PHILOSOPHY.md is what we ship, and
 * packages/cli/core-assets/PHILOSOPHY.md is the npm mirror. The third is
 * GENERATED from the second by copy-core-assets.mjs and is already gated by the
 * "core-assets in sync with core" step, so this script deliberately checks only
 * the one leg nothing else covers: docs <-> core. Neither of those two generates
 * the other, so the check is byte equality, not regeneration.
 *
 * Exit 0 when identical, 1 on drift.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/sync-philosophy.sh');
let dir: string;

function run(docs: string, core: string): { status: number; output: string } {
  const d = join(dir, 'docs.md');
  const c = join(dir, 'core.md');
  writeFileSync(d, docs);
  writeFileSync(c, core);
  const result = spawnSync('bash', [SCRIPT, '--files', d, c], { encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-philo-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sync-philosophy.sh', () => {
  it('passes when the two copies are byte-identical', () => {
    const text = '# Philosophy\n\n## Three pillars\n\nSafety > Performance > DX.\n';
    expect(run(text, text).status).toBe(0);
  });

  // The drift this gate exists for was exactly this shape: one sentence reworded
  // in docs/ and never mirrored, so every consumer installed a doctrine line
  // older than the one we were reading. Headings matched throughout, which is
  // why the sister-doc gate's heading comparison would not have caught it.
  it('fails when a single sentence differs but every heading matches', () => {
    const docs = '# Philosophy\n\n## Universal hard rules\n\n- No em dashes as filler.\n';
    const core = '# Philosophy\n\n## Universal hard rules\n\n- No em dashes, ever.\n';
    const result = run(docs, core);
    expect(result.status).toBe(1);
    expect(result.output).toContain('drift');
  });

  it('fails when one copy has a section the other lacks', () => {
    const docs = '# Philosophy\n\n## Wing Chun\n\nx\n\n## Excluded\n\ny\n';
    const core = '# Philosophy\n\n## Wing Chun\n\nx\n';
    expect(run(docs, core).status).toBe(1);
  });

  it('fails on a trailing-whitespace-only difference, since the mirror is copied byte for byte', () => {
    expect(run('# Philosophy\n\ntext\n', '# Philosophy\n\ntext \n').status).toBe(1);
  });

  it('reports which file is missing rather than passing silently', () => {
    const present = join(dir, 'present.md');
    writeFileSync(present, '# Philosophy\n');
    const absent = join(dir, 'nope.md');
    const result = spawnSync('bash', [SCRIPT, '--files', present, absent], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('nope.md');
  });

  it('holds the three real repo copies in parity', () => {
    const result = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
    expect(`${result.stdout}${result.stderr}`).not.toContain('drift');
    expect(result.status).toBe(0);
  });
});
