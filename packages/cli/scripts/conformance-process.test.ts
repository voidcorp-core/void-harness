import { existsSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  conformanceEnvironment,
  packageManagerCommand,
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
    expect(result.outcome).not.toEqual({ kind: 'exited', code: 0 });
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
  it('forwards only the portable allowlist plus explicit fixture values', () => {
    const environment = conformanceEnvironment(
      { VOID_FIXTURE_ROOT: '/fixture' },
      { PATH: '/bin', HOME: '/private/home', API_TOKEN: 'secret-canary' },
    );

    expect(environment).toEqual({ PATH: '/bin', VOID_FIXTURE_ROOT: '/fixture' });
  });

  it('redacts credentials and bounds diagnostics', () => {
    const diagnostic = safeConformanceDiagnostic(
      `authorization=secret-canary token=another-canary ${'x'.repeat(4096)}`,
      256,
    );

    expect(diagnostic).not.toContain('secret-canary');
    expect(diagnostic).not.toContain('another-canary');
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
