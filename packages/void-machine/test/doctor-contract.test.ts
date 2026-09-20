// @test-resource subprocess
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentsDigest, doctorFixture } from './doctor-fixture.js';

// Exercise current TypeScript sources, independent of any previously emitted dist.
// The historical Rust comparison and its routing remain in Git and RUN evidence.
const schema: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname,
  '../../../native/void-machine/schema/doctor-v1.json'), 'utf8'));

function expectClosedReport(output: string): unknown {
  const report: unknown = JSON.parse(output);
  expect(typeof report).toBe('object');
  if (!report || typeof report !== 'object') throw new Error('doctor report must be an object');
  const required = ['schemaVersion', 'health', 'repository', 'gitCommonDirectory',
    'stateDirectory', 'cacheDirectory', 'findings'];
  expect(schema).toMatchObject({ additionalProperties: false, required });
  expect(Object.keys(report).sort()).toEqual(required.sort());
  expect(report).toMatchObject({ schemaVersion: 1, findings: expect.any(Array) });
  return report;
}

describe('doctor retained contracts and deliberate parser corrections', () => {
  it('reports an ordinary repository without changing source, state or home files', () => {
    const f = doctorFixture();
    const before = contentsDigest(f.root);
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(expectClosedReport(result.stdout)).toEqual({
      schemaVersion: 1, health: 'healthy', repository: f.repository,
      gitCommonDirectory: join(f.repository, '.git'),
      stateDirectory: join(f.repository, '.void', 'machine'),
      cacheDirectory: join(f.home, '.cache', 'void-machine'), findings: [],
    });
    expect(contentsDigest(f.root)).toBe(before);
  });

  it('discovers the linked worktree and its shared Git directory from a nested cwd', () => {
    const f = doctorFixture();
    f.git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
      'commit', '--quiet', '--allow-empty', '-m', 'fixture'], f.repository);
    const linked = join(f.root, 'linked');
    f.git(['worktree', 'add', '--quiet', '--detach', linked], f.repository);
    const nested = join(linked, 'nested');
    mkdirSync(nested);
    const before = contentsDigest(f.root);
    const result = f.invoke(['doctor', '--json'], nested);
    expect(result.status).toBe(0);
    expect(expectClosedReport(result.stdout)).toMatchObject({
      repository: linked, gitCommonDirectory: join(f.repository, '.git'),
      stateDirectory: join(linked, '.void', 'machine'), health: 'healthy',
    });
    expect(contentsDigest(f.root)).toBe(before);
  });

  it.each(['outside', 'missing-git'] as const)('renders present nullable paths for %s', (mode) => {
    const f = doctorFixture();
    const result = f.invoke(['doctor', '--json'], f.root,
      mode === 'missing-git' ? { PATH: '' } : {});
    expect(result.status).toBe(1);
    const report = expectClosedReport(result.stdout);
    expect(report).toEqual({
      schemaVersion: 1, health: 'blocked',
      repository: null, gitCommonDirectory: null, // allow-null: public v1 schema requires present keys
      stateDirectory: null, cacheDirectory: null, // allow-null: public v1 schema requires present keys
      findings: [{ code: 'git.missing', severity: 'blocked',
        problem: expect.any(String), cause: expect.any(String), repair: expect.any(String) }],
    });
  });

  it.each(['xdg', 'home', 'repository'] as const)('resolves the %s cache from explicit environment', (mode) => {
    const f = doctorFixture();
    const xdg = join(f.root, 'cache');
    const env = mode === 'xdg' ? { XDG_CACHE_HOME: xdg }
      : mode === 'repository' ? { HOME: undefined, XDG_CACHE_HOME: undefined } : {};
    const result = f.invoke(['doctor', '--json'], f.repository, env);
    const expected = mode === 'xdg' ? join(xdg, 'void-machine')
      : mode === 'home' ? join(f.home, '.cache', 'void-machine')
      : join(f.repository, '.void', 'machine', 'cache');
    expect(result.status).toBe(0);
    expect(expectClosedReport(result.stdout)).toMatchObject({ cacheDirectory: expected });
  });

  it('accepts actual TOML strings and a version-one JSON lock', () => {
    const f = doctorFixture();
    writeFileSync(join(f.repository, '.void/machine.toml'),
      `# config\nschema_version = 1\nstate_dir = "state=ok"\ncache_dir = 'cache'\n`);
    writeFileSync(join(f.repository, '.void/machine.lock.json'), '{"schemaVersion":1}');
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(0);
    expect(expectClosedReport(result.stdout)).toMatchObject({ health: 'healthy', findings: [] });
  });

  it.each([
    ['machine.lock.json', '{"schemaVersion":10}', 'machine.lock.malformed'],
    ['machine.lock.json', '{"schemaVersion":1,broken}', 'machine.lock.malformed'],
    ['machine.lock.json', '{"schemaVersion":"1"}', 'machine.lock.malformed'],
    ['machine.toml', 'schema_version = 1\nschema_version = 1', 'machine.config.malformed'],
    ['machine.toml', 'schema_version = "1"', 'machine.config.malformed'],
    ['machine.toml', 'state_dir = unquoted', 'machine.config.malformed'],
    ['machine.toml', 'unknown = 1', 'machine.config.malformed'],
  ])('degrades real repository inspection for invalid %s: %s', (name, contents, code) => {
    const f = doctorFixture();
    writeFileSync(join(f.repository, '.void', name), contents);
    const before = contentsDigest(f.root);
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(1);
    expect(expectClosedReport(result.stdout)).toMatchObject({
      health: 'degraded', findings: [{ code, severity: 'degraded' }],
    });
    expect(contentsDigest(f.root)).toBe(before);
  });

  it('keeps read failures blocked even when another file is malformed', () => {
    const f = doctorFixture();
    mkdirSync(join(f.repository, '.void/machine.toml'));
    writeFileSync(join(f.repository, '.void/machine.lock.json'), '{}');
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(1);
    expect(expectClosedReport(result.stdout)).toMatchObject({
      health: 'blocked', findings: [
        expect.objectContaining({ code: 'machine.config.unreadable', severity: 'blocked' }),
        expect.objectContaining({ code: 'machine.lock.malformed', severity: 'degraded' }),
      ],
    });
  });

  it('rejects invalid UTF-8 as malformed rather than accepting replacement characters', () => {
    const f = doctorFixture();
    writeFileSync(join(f.repository, '.void/machine.toml'), Buffer.from([0xff]));
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(1);
    expect(expectClosedReport(result.stdout)).toMatchObject({
      health: 'degraded', findings: [expect.objectContaining({ code: 'machine.config.malformed' })],
    });
  });

  it('bounds configuration input to 64 KiB and reports the refusal', () => {
    const f = doctorFixture();
    writeFileSync(join(f.repository, '.void/machine.toml'), '#'.repeat(65_537));
    const result = f.invoke(['doctor', '--json']);
    expect(result.status).toBe(1);
    expect(expectClosedReport(result.stdout)).toMatchObject({
      health: 'degraded', findings: [expect.objectContaining({ code: 'machine.config.malformed' })],
    });
  });

  it('provides text diagnostics and usage failures without JSON noise', () => {
    const f = doctorFixture();
    const text = f.invoke(['doctor']);
    expect(text.status).toBe(0);
    expect(text.stdout).toBe('void-machine doctor: healthy\n');
    const invalid = f.invoke(['doctor', '--unknown']);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr).toContain('usage: void-machine');
  });
});
