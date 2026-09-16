// @test-resource subprocess
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const worker = fileURLToPath(new URL('../../../core/hooks/_syntax-worker.cjs', import.meta.url));
function inspect(input: unknown) {
  expect(existsSync(worker), 'the delivered worker must exist independently of the hook').toBe(true);
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', worker], {
    input: JSON.stringify(input), encoding: 'utf8', env: {}, timeout: 5_000,
    killSignal: 'SIGKILL', maxBuffer: 65_536,
  });
  expect(child.status).toBe(0);
  return JSON.parse(child.stdout);
}
describe('official TypeScript worker contract', () => {
  it.each([
    ['view.js', 'test.only("case", () => {});'],
    ['view.jsx', 'const view = <div>{test.only("case", () => {})}</div>;'],
  ])('inspects JavaScript syntax in %s through the same worker', (path, source) => {
    expect(inspect({ version: 1, path, source, purpose: 'focused-tests' }))
      .toEqual({ version: 1, kind: 'inspected', lines: [1] });
  });
  it('uses official syntactic diagnostics without imposing semantic errors', () => {
    expect(inspect({ version: 1, path: 'a.ts', source: 'export const value;', purpose: 'focused-tests' }))
      .toEqual({ version: 1, kind: 'inspected', lines: [] });
  });
  it('returns syntax facts without deciding whether an edit is allowed', () => {
    expect(inspect({ version: 1, path: 'view.test.ts', source: 'test.only("case", () => {});', purpose: 'focused-tests' }))
      .toEqual({ version: 1, kind: 'inspected', lines: [1] });
  });
  it('refuses invalid source instead of emitting partial syntax evidence', () => {
    expect(inspect({ version: 1, path: 'view.test.ts', source: 'const = ;', purpose: 'focused-tests' }))
      .toEqual({ version: 1, kind: 'invalid-source' });
  });
  it.each([
    { version: 2, path: 'a.ts', source: '', purpose: 'focused-tests' },
    { version: 1, path: 'a.ts', source: '', purpose: 'unknown' },
    { version: 1, path: 'a.ts', source: ' '.repeat(65_537), purpose: 'declarations' },
  ])('refuses an invalid or oversized request', (input) => {
    expect(inspect(input)).toEqual({ version: 1, kind: 'invalid-request' });
  });
});
