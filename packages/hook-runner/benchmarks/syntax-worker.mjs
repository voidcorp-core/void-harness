// Measure the actual shipped worker in fresh processes, including Node startup.
// Optional argv[2] is a local source file; its contents never enter the report.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = process.env.VOID_BENCHMARK_WORKER
  ?? fileURLToPath(new URL('../../core/hooks/_syntax-worker.cjs', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'syntax-profile-'));
const profiler = join(directory, 'profile.cjs');
// Observe CPU and peak RSS without modifying the shipped worker. The preloader
// adds no source/config loading and preserves the stdout protocol byte for byte.
writeFileSync(profiler, `const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (...args) {
  process.stderr.write(JSON.stringify({cpu: process.cpuUsage(), rssKiB: process.resourceUsage().maxRSS}));
  return write(...args);
};\n`);
const cases = [
  { name: 'typescript', path: 'view.ts', source: 'test.only("case", () => {});', expected: 'inspected' },
  { name: 'tsx', path: 'view.tsx', source: 'const view = <div>{test.only("case", () => {})}</div>;', expected: 'inspected' },
  { name: 'large', path: 'large.ts', source: Array.from({ length: 2_000 }, (_, i) => `const v${i} = ${i};`).join('\n'), expected: 'inspected' },
  { name: 'invalid-source', path: 'invalid.ts', source: 'const = ;', expected: 'invalid-source' },
  { name: 'invalid-request', path: 'large.ts', source: ' '.repeat(65_537), expected: 'invalid-request' },
];
if (process.argv[2]) cases.push({ name: 'external-source', path: process.argv[2],
  source: readFileSync(process.argv[2], 'utf8'), expected: 'inspected' });
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
let failures = 0;
try {
  process.stdout.write(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    workerSha256: createHash('sha256').update(readFileSync(worker)).digest('hex'), samplesPerCase: 30 }) + '\n');
  for (const fixture of [{ name: 'node-baseline' }, ...cases]) {
    const samples = [];
    for (let sample = 0; sample < 30; sample++) {
      const args = fixture.name === 'node-baseline'
        ? ['--require', profiler, '--eval', 'process.stdout.write("{}")']
        : ['--max-old-space-size=128', '--require', profiler, worker];
      const started = performance.now();
      const child = spawnSync(process.execPath, args, { env: {}, encoding: 'utf8', timeout: 5_000,
        killSignal: 'SIGKILL', maxBuffer: 65_536,
        input: JSON.stringify({ version: 1, path: fixture.path, source: fixture.source, purpose: 'focused-tests' }) });
      const wallMs = performance.now() - started;
      let cpuMs; let rssKiB; let valid = false;
      try {
        const metrics = JSON.parse(child.stderr);
        cpuMs = (metrics.cpu.user + metrics.cpu.system) / 1_000;
        rssKiB = metrics.rssKiB;
        valid = child.status === 0 && (fixture.name === 'node-baseline'
          || JSON.parse(child.stdout).kind === fixture.expected);
      } catch { valid = false; }
      if (!valid) failures++;
      samples.push({ wallMs, cpuMs, rssKiB, valid, error: child.error?.code });
    }
    const successful = samples.filter((sample) => sample.valid);
    process.stdout.write(JSON.stringify({ case: fixture.name, bytes: Buffer.byteLength(fixture.source ?? ''),
      failures: samples.length - successful.length,
      wallP50Ms: percentile(samples.map((s) => s.wallMs), .5),
      wallP95Ms: percentile(samples.map((s) => s.wallMs), .95),
      wallP99Ms: percentile(samples.map((s) => s.wallMs), .99),
      successfulCpuP95Ms: percentile(successful.map((s) => s.cpuMs), .95),
      successfulRssP95KiB: percentile(successful.map((s) => s.rssKiB), .95), samples }) + '\n');
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
if (failures > 0) process.exitCode = 1;
