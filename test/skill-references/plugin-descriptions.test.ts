import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function fixture(files: Readonly<Record<string, string>>) {
  const root = mkdtempSync(join(tmpdir(), 'void-plugin-references-'));
  mkdirSync(join(root, 'scripts'));
  for (const name of ['check-skill-references.mjs', 'build-skill-references.mjs']) {
    copyFileSync(new URL(`../../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  for (const [path, content] of Object.entries({
    'packages/core/data/model.json': JSON.stringify({ nodes: [{ name: 'void-tdd' }] }),
    ...files,
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return spawnSync(process.execPath, [join(root, 'scripts/check-skill-references.mjs')], {
    cwd: root, encoding: 'utf8',
  });
}

describe('plugin description CLI validation', () => {
  it.each([
    'packages/core/.claude-plugin/plugin.json',
    'packages/cli/core-assets/.claude-plugin/plugin.json',
    'packages/packs/pack-react/.claude-plugin/plugin.json',
  ])('rejects a missing explicit skill in %s', (path) => {
    const result = fixture({ [path]: JSON.stringify({ description: 'Use void-does-not-exist.' }) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain('void-does-not-exist');
  });

  it.each([
    { description: 'Use void-tdd with void-harness and harness-react; plan context testing functional.' },
    { description: '' },
    {},
  ])('accepts live references and ordinary prose: %j', (manifest) => {
    expect(fixture({ 'packages/core/.claude-plugin/plugin.json': JSON.stringify(manifest) }).status).toBe(0);
  });

  it('refuses retired names without treating historical records as live descriptions', () => {
    const history = { 'docs/decisions/retired.md': 'harness:retired and void-compounding' };
    expect(fixture(history).status).toBe(0);
    const result = fixture({
      ...history,
      'packages/core/.claude-plugin/plugin.json': '{"description":"void-compounding"}',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('void-compounding');
  });

  it('preserves the existing namespace refusal, including in plugin descriptions', () => {
    expect(fixture({ 'README.md': 'Use harness:tdd.' }).status).toBe(1);
    const result = fixture({
      'packages/core/.claude-plugin/plugin.json': '{"description":"Use harness:tdd."}',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('harness:tdd');
  });
});
