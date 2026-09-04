import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFORMANCE_PACK_TIMEOUT_MS,
  conformanceEnvironment,
  conformanceFailureDiagnostic,
  packageManagerCommand,
  resolveConformanceFixtureRoot,
  resolveConformanceTarball,
  runConformanceProcess,
  safeConformanceDiagnostic,
} from './conformance-process.mjs';

describe('packageManagerCommand', () => {
  it('runs pnpm through its JavaScript entrypoint on Windows', () => {
    const command = packageManagerCommand('pnpm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: {
        npm_execpath: 'C:\\pnpm\\pnpm.cjs',
      },
      isFile: (candidate) => candidate === 'C:\\pnpm\\pnpm.cjs',
    });

    expect(command).toEqual({
      executable: 'C:\\node\\node.exe',
      prefixArguments: ['C:\\pnpm\\pnpm.cjs'],
    });
  });

  it('runs the npm JavaScript CLI shipped beside Node on Windows', () => {
    const npmCli = 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js';
    const command = packageManagerCommand('npm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: { PATH: 'C:\\node;C:\\Windows' },
      isFile: (candidate) => candidate === npmCli,
    });

    expect(command).toEqual({
      executable: 'C:\\node\\node.exe',
      prefixArguments: [npmCli],
    });
  });

  it('fails with an actionable error instead of spawning a cmd shim', () => {
    expect(() => packageManagerCommand('pnpm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: {},
      isFile: () => false,
    })).toThrow('cannot resolve pnpm JavaScript entrypoint');
  });

  it('uses native executables on POSIX', () => {
    expect(packageManagerCommand('npm', {
      platform: 'linux',
      nodeExecutable: '/usr/bin/node',
      environment: {},
      isFile: () => false,
    })).toEqual({ executable: 'npm', prefixArguments: [] });
  });
});

describe('runConformanceProcess', () => {
  it('distinguishes exited, signaled, and spawn-error outcomes', async () => {
    const exited = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd(),
    });
    const signaled = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', "process.kill(process.pid, 'SIGTERM')"],
      cwd: process.cwd(),
    });
    const spawnError = await runConformanceProcess({
      command: join(tmpdir(), 'void-missing-conformance-command'),
      args: [],
      cwd: process.cwd(),
    });

    expect(exited.outcome).toEqual({ kind: 'exited', code: 7 });
    expect(signaled.outcome).toMatchObject({ kind: 'signaled' });
    expect(spawnError.outcome).toEqual({ kind: 'spawn-error' });
  });

  it('bounds each output stream and never reports overflow as success', async () => {
    const result = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', "process.stdout.write('a'.repeat(4096)); process.stderr.write('b'.repeat(4096))"],
      cwd: process.cwd(),
      maxOutputBytes: 1024,
    });

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(1024);
    expect(result.outputExceeded).toBe(true);
    expect(result.outcome).toEqual({ kind: 'output-exceeded' });
  });

  it('times out and terminates the complete process tree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-process-tree-'));
    const marker = join(root, 'survived.txt');
    const source = [
      "const { spawn } = require('node:child_process')",
      `spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 800)`) }])`,
      'setInterval(() => {}, 1000)',
    ].join(';');

    const result = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', source],
      cwd: root,
      timeoutMs: 100,
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));

    expect(result.outcome).toEqual({ kind: 'timed-out' });
    expect(existsSync(marker)).toBe(false);
  });
});

describe('conformance diagnostics and environment', () => {
  it('gives cold packaging a bounded five-minute budget', () => {
    expect(CONFORMANCE_PACK_TIMEOUT_MS).toBe(5 * 60_000);
  });

  it('forwards only the portable allowlist plus explicit fixture values', () => {
    const environment = conformanceEnvironment(
      { VOID_FIXTURE_ROOT: '/fixture' },
      { PATH: '/bin', HOME: '/private/home', API_TOKEN: 'secret-canary' },
    );

    expect(environment).toEqual({ PATH: '/bin', VOID_FIXTURE_ROOT: '/fixture' });
  });

  it('redacts credentials and bounds diagnostics', () => {
    const diagnostic = safeConformanceDiagnostic(
      [
        'authorization=secret-canary',
        'token=another-canary',
        'NPM_TOKEN=npm-canary',
        'OPENAI_API_KEY=openai-canary',
        'ANTHROPIC_API_KEY=anthropic-canary',
        '//registry.npmjs.org/:_authToken=registry-canary',
        'https://example.test/failure?token=query-canary',
        'x-api-key=header-canary',
        'Bearer bearer-canary',
        'x'.repeat(4096),
      ].join(' '),
      256,
    );

    for (const canary of [
      'secret-canary',
      'another-canary',
      'npm-canary',
      'openai-canary',
      'anthropic-canary',
      'registry-canary',
      'query-canary',
      'header-canary',
      'bearer-canary',
    ]) {
      expect(diagnostic).not.toContain(canary);
    }
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(256);
  });

  it('keeps a truncated UTF-8 diagnostic within its byte ceiling', () => {
    const diagnostic = safeConformanceDiagnostic(`${'a'.repeat(255)}é`, 256);

    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(256);
    expect(diagnostic).not.toContain('\uFFFD');
  });

  it('surfaces bounded redacted process output when an evidence command fails', () => {
    const diagnostic = conformanceFailureDiagnostic({
      stdout: 'FAIL collision assertion\n',
      stderr: `D:\\private\\checkout token=secret-canary ${'x'.repeat(2048)}`,
    }, 256, ['D:\\private\\checkout']);

    expect(diagnostic).toContain('FAIL collision assertion');
    expect(diagnostic).toContain('[PATH]');
    expect(diagnostic).not.toContain('D:\\private\\checkout');
    expect(diagnostic).not.toContain('secret-canary');
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(256);
  });

  it('keeps the failure tail when verbose output exceeds the diagnostic budget', () => {
    const diagnostic = conformanceFailureDiagnostic({
      stdout: `RUN legacy-collisions\n${'setup noise\n'.repeat(100)}`,
      stderr: 'AssertionError: receipt ownership differs on win32',
    }, 256);

    expect(diagnostic).toContain('RUN legacy-collisions');
    expect(diagnostic).toContain('AssertionError: receipt ownership differs on win32');
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(256);
  });
});

describe('resolveConformanceTarball', () => {
  it('accepts only an absolute regular tarball supplied by the trusted runner', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-conformance-tarball-'));
    const tarball = join(root, 'voidharness.tgz');
    writeFileSync(tarball, 'packed');

    expect(resolveConformanceTarball({ VOID_CONFORMANCE_TARBALL: tarball })).toBe(tarball);
    expect(() => resolveConformanceTarball({ VOID_CONFORMANCE_TARBALL: 'relative.tgz' }))
      .toThrow('absolute regular .tgz');
  });

  it('rejects symlinks and non-tarball files', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-conformance-tarball-'));
    const target = join(root, 'artifact.tgz');
    const alias = join(root, 'alias.tgz');
    writeFileSync(target, 'packed');
    symlinkSync(target, alias);

    expect(() => resolveConformanceTarball({ VOID_CONFORMANCE_TARBALL: alias }))
      .toThrow('absolute regular .tgz');
    expect(() => resolveConformanceTarball({ VOID_CONFORMANCE_TARBALL: join(root, 'artifact.zip') }))
      .toThrow('absolute regular .tgz');
  });
});

describe('resolveConformanceFixtureRoot', () => {
  it('accepts only an existing absolute regular directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-conformance-fixtures-'));

    expect(resolveConformanceFixtureRoot({ VOID_CONFORMANCE_FIXTURE_ROOT: root })).toBe(root);
    expect(() => resolveConformanceFixtureRoot({ VOID_CONFORMANCE_FIXTURE_ROOT: 'relative' }))
      .toThrow('existing absolute regular directory');
    expect(() => resolveConformanceFixtureRoot({
      VOID_CONFORMANCE_FIXTURE_ROOT: join(root, 'missing'),
    })).toThrow('existing absolute regular directory');
  });

  it('rejects symlinked directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-conformance-fixtures-'));
    const target = join(root, 'target');
    const alias = join(root, 'alias');
    mkdirSync(target);
    symlinkSync(target, alias);

    expect(() => resolveConformanceFixtureRoot({ VOID_CONFORMANCE_FIXTURE_ROOT: alias }))
      .toThrow('existing absolute regular directory');
  });
});
