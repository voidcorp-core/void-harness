import { join } from 'node:path';
import { chmodSync, writeFileSync } from 'node:fs';
import { doctorFixture } from './doctor-fixture.js';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/claude-cli-note.mjs', import.meta.url));

const request = {
  requestId: 'request-1', question: 'Compare both sources',
  sources: [
    { sourceId: 'a', title: 'Alpha', text: 'alpha material' },
    { sourceId: 'b', title: 'Beta', text: 'beta material' },
  ],
};

function executable(f: ReturnType<typeof doctorFixture>): string {
  const wrapper = join(f.root, 'claude-fixture');
  writeFileSync(wrapper, `#!/bin/sh\nexec ${process.execPath} ${fixture} "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

describe('note CLI argument and input failures', () => {
  it('returns usage 2 without JSON noise when required options are absent', () => {
    const f = doctorFixture();
    const result = f.invoke(['note']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('usage: void-machine note');
  });

  it('returns usage 2 for an unreadable or malformed input file', () => {
    const f = doctorFixture();
    const result = f.invoke([
      'note', '--input', join(f.root, 'missing.json'), '--cwd', f.root,
      '--extraction-model', 'haiku', '--synthesis-model', 'sonnet', '--timeout-ms', '90000',
    ]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unable to read or parse the note input file');
  });

  it('runs completed extraction and synthesis through a supplied executable', () => {
    const f = doctorFixture();
    const command = executable(f);
    const input = join(f.root, 'request.json');
    writeFileSync(input, JSON.stringify(request));
    const result = f.invoke([
      'note', '--input', input, '--cwd', f.root, '--executable', command,
      '--extraction-model', 'fixture-extract', '--synthesis-model', 'fixture-synthesis', '--timeout-ms', '1000',
    ]);
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout) as { kind: string; usage: Array<{ role: string; modelUsage: { model: string; envKeys: string[] } }> };
    expect(receipt.kind).toBe('completed');
    expect(receipt.usage.map((value) => value.role)).toEqual(['extractor', 'synthesizer']);
    expect(receipt.usage.map((value) => value.modelUsage.model)).toEqual(['fixture-extract', 'fixture-synthesis']);
    expect(receipt.usage[0]?.modelUsage.envKeys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('returns a stopped receipt and exit 1 for a native refusal', () => {
    const f = doctorFixture();
    const command = executable(f);
    const input = join(f.root, 'request.json');
    writeFileSync(input, JSON.stringify(request));
    const result = f.invoke([
      'note', '--input', input, '--cwd', f.root, '--executable', command,
      '--extraction-model', 'fixture-extract', '--synthesis-model', 'fixture-fail', '--timeout-ms', '1000',
    ]);
    expect(result.status).toBe(1);
    const receipt = JSON.parse(result.stdout) as { kind: string; stage: string; issue: { code: string }; usage: Array<{ role: string }> };
    expect(receipt).toMatchObject({ kind: 'stopped', stage: 'synthesis', issue: { code: 'execution.failed' }, usage: [{ role: 'extractor' }] });
    expect(result.stderr).toBe('');
  });
});
