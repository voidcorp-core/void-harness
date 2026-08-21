import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const ANTI_BLOAT_CHECK = join(ROOT, 'scripts', 'anti-bloat-check.sh');
const fixtures: string[] = [];

type DescriptionOwner = 'skill' | 'agent';

function write(path: string, content: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function createFixture(owner: DescriptionOwner, descriptionLength: number): string {
  const root = mkdtempSync(join(tmpdir(), 'void-description-budget-'));
  fixtures.push(root);

  const skillDirectory = join(root, 'packages', 'core', 'skills', 'void-example');
  const skillDescription = owner === 'skill' ? 'x'.repeat(descriptionLength) : 'A short discovery description.';
  write(
    join(skillDirectory, 'SKILL.md'),
    `---\nname: void-example\ndescription: ${skillDescription}\n---\n\n# Example\n`,
  );
  write(join(skillDirectory, 'harness.yaml'), 'kind: standard\nruntimes: [claude, codex]\n');
  write(join(skillDirectory, '.source'), 'Fixture source.\n');
  write(join(root, 'docs', 'plans', 'skill-audits', 'void-example.md'), '# Fixture audit\n');

  if (owner === 'agent') {
    write(
      join(root, 'packages', 'core', 'agents', 'example-agent.md'),
      `---\nname: example-agent\ndescription: ${'x'.repeat(descriptionLength)}\n---\n\n# Example agent\n`,
    );
  }

  return root;
}

function runGate(owner: DescriptionOwner, descriptionLength: number) {
  return spawnSync('bash', [ANTI_BLOAT_CHECK], {
    cwd: createFixture(owner, descriptionLength),
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('discovery description budget', () => {
  it('accepts the 250-character target without a note', () => {
    const result = runGate('skill', 250);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('target 250 chars, hard cap 500 chars');
    expect(output).not.toContain('NOTE:');
  });

  it.each([251, 500])('accepts %i characters with a non-blocking note', (descriptionLength) => {
    const result = runGate('skill', descriptionLength);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain(
      `NOTE: packages/core/skills/void-example/SKILL.md description is ${descriptionLength} chars ` +
        '(target 250, cap 500)',
    );
  });

  it('rejects a 501-character skill description', () => {
    const result = runGate('skill', 501);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain(
      'FAIL: packages/core/skills/void-example/SKILL.md description is 501 chars (cap 500)',
    );
  });

  it('rejects a 501-character agent description', () => {
    const result = runGate('agent', 501);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain('FAIL: packages/core/agents/example-agent.md description is 501 chars (cap 500)');
  });
});
