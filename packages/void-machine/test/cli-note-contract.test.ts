import { join } from 'node:path';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { contentsDigest, doctorFixture } from './doctor-fixture.js';
import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/claude-cli-note.mjs', import.meta.url));
const hostScript = fileURLToPath(new URL('./fixtures/note-mission-host.ts', import.meta.url));

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

const MISSION = 'mission-1';
type Receipt = {
  kind: string; missionId?: string; stage?: string; reason?: string;
  note?: { title: string }; usage?: Array<{ role: string }>;
};

function missionFixture() {
  const f = doctorFixture();
  const command = executable(f);
  const input = join(f.root, 'request.json');
  writeFileSync(input, JSON.stringify(request));
  const store = join(f.root, 'store');
  const directory = join(store, MISSION);
  const log = join(f.root, 'calls.log');
  const start = (synthesisModel = 'fixture-synthesis', extra: readonly string[] = [],
    extractionModel = 'fixture-extract') => [
    'note', 'start', '--store', store, '--mission', MISSION, '--input', input, '--cwd', f.root,
    '--executable', command, '--extraction-model', extractionModel,
    // The runtime deadline is only a failure guard; barriers order the processes.
    '--synthesis-model', synthesisModel, '--timeout-ms', '30000', ...extra,
  ];
  const resume = () => ['note', 'resume', '--store', store, '--mission', MISSION,
    '--cwd', f.root, '--executable', command];
  const calls = () => existsSync(log)
    ? readFileSync(log, 'utf8').split('\n').filter((line) => line.length > 0) : [];
  const record = (revision: number) => join(directory, `${String(revision).padStart(6, '0')}.json`);
  const edit = (revision: number, change: (value: Record<string, unknown>) => void) => {
    const value = JSON.parse(readFileSync(record(revision), 'utf8')) as Record<string, unknown>;
    change(value);
    writeFileSync(record(revision), JSON.stringify(value));
  };
  const receipt = (stdout: string) => JSON.parse(stdout) as Receipt;
  const release = () => { writeFileSync(join(f.root, 'release'), ''); };
  // Starts through the production composition with one deterministic boundary condition.
  const host = (mode: string) => f.invokeScript(hostScript, [store, MISSION, input, f.root, command, mode]);
  const crashAfter = (kind: string) => host(`crash-after:${kind}`);
  const sessions = () => readFileSync(join(f.root, 'sessions.log'), 'utf8').split('\n')
    .filter((line) => line.length > 0).map((line) => line.split(' '));
  return { ...f, store, directory, start, resume, calls, record, edit, receipt, release, host,
    crashAfter, sessions };
}

describe('durable note mission across processes', () => {
  it('requires an explicit mission identifier to start', () => {
    const f = missionFixture();
    const args = f.start().filter((value, index, all) =>
      value !== '--mission' && all[index - 1] !== '--mission');
    const result = f.invoke(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(f.calls()).toEqual([]);
  });

  it('resumes synthesis from a persisted extraction in a new process without extracting again', () => {
    const f = missionFixture();
    const paused = f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction']));
    expect(paused.status).toBe(0);
    expect(f.receipt(paused.stdout)).toMatchObject({ kind: 'paused', missionId: MISSION, stage: 'extraction' });
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(statSync(f.directory).mode & 0o777).toBe(0o700);
    expect(statSync(f.record(1)).mode & 0o777).toBe(0o600);

    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(0);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'completed', missionId: MISSION,
      note: { title: 'CLI fixture note' }, usage: [{ role: 'extractor' }, { role: 'synthesizer' }] });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-synthesis']);
    expect(resumed.stderr).toBe('');
  });

  it('delivers the same completed receipt again without a model call or a write', () => {
    const f = missionFixture();
    const first = f.invoke(f.start());
    expect(first.status).toBe(0);
    const before = contentsDigest(f.directory);
    const again = f.invoke(f.resume());
    expect(again.status).toBe(0);
    expect(again.stdout).toBe(first.stdout);
    expect(f.calls()).toHaveLength(2);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('keeps an observed synthesis failure terminal instead of retrying it', () => {
    const f = missionFixture();
    const first = f.invoke(f.start('fixture-fail'));
    expect(first.status).toBe(1);
    expect(f.receipt(first.stdout)).toMatchObject({ kind: 'stopped', stage: 'synthesis' });
    const again = f.invoke(f.resume());
    expect(again.status).toBe(1);
    expect(again.stdout).toBe(first.stdout);
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-fail']);
  });

  it('resumes after a host killed right after the durable extraction acceptance, without extracting again', () => {
    const f = missionFixture();
    const crashed = f.crashAfter('accepted');
    expect(crashed.signal).toBe('SIGKILL');
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(existsSync(f.record(3))).toBe(true);
    expect(existsSync(f.record(4))).toBe(false);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(0);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'completed', missionId: MISSION,
      usage: [{ role: 'extractor' }, { role: 'synthesizer' }] });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-synthesis']);
  });

  it('delivers a note accepted right before a host crash without calling a model again', () => {
    const f = missionFixture();
    const crashed = f.crashAfter('completed');
    expect(crashed.signal).toBe('SIGKILL');
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-synthesis']);
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(0);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'completed', note: { title: 'CLI fixture note' } });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-synthesis']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('correlates each native session with the dispatch intent recorded before it', () => {
    const f = missionFixture();
    const completed = f.invoke(f.start());
    expect(completed.status).toBe(0);
    const intents = [2, 4].map((revision) =>
      (JSON.parse(readFileSync(f.record(revision), 'utf8')) as { executionId: string }).executionId);
    expect(f.sessions()).toEqual([['fixture-extract', intents[0]], ['fixture-synthesis', intents[1]]]);
    const receipt = JSON.parse(completed.stdout) as { usage: Array<{ sessionId: string }> };
    expect(receipt.usage.map((value) => value.sessionId)).toEqual(intents);
  });

  it('reports an unconfirmed cancellation as unknown at once and on resume, launching nothing again', () => {
    const f = missionFixture();
    const first = f.host('deadline-after-entry');
    expect(first.status).toBe(3);
    expect(f.receipt(first.stdout)).toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-hold']);
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(3);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-hold']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('launches nothing after a record whose durability the journal cannot confirm', () => {
    const f = missionFixture();
    const result = f.host('unconfirm-after:dispatched');
    expect(result.status).toBe(3);
    const receipt = f.receipt(result.stdout) as Receipt & { diagnostic?: string };
    expect(receipt).toMatchObject({ kind: 'blocked', reason: 'storage' });
    expect(receipt.diagnostic).toContain('durability is unconfirmed');
    expect(f.calls()).toEqual([]);
  });

  it('writes nothing when a record would not match the mission format', () => {
    const f = missionFixture();
    const result = f.host(`contract:sha256:${'x'.repeat(300)}`);
    expect(result.status).toBe(3);
    expect(f.receipt(result.stdout)).toMatchObject({ kind: 'blocked', reason: 'unrecordable' });
    expect(f.calls()).toEqual([]);
    expect(existsSync(f.directory)).toBe(false);
  });

  it('reports an in-flight step after a host crash as unknown and never launches it again', () => {
    const f = missionFixture();
    const crashed = f.invoke(f.start('fixture-crash'));
    expect(crashed.signal).toBe('SIGKILL');
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-crash']);
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(3);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-crash']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('lets the live writer accept its result after another resume observed it in flight', async () => {
    const f = missionFixture();
    const live = f.launch(f.start('fixture-hold'));
    try {
      // Signal read only: the held launch is recorded before the barrier.
      await vi.waitFor(() => { expect(f.calls()).toContain('fixture-hold'); },
        { timeout: 5000, interval: 20 });
      const observer = f.invoke(f.resume());
      expect(observer.status).toBe(3);
      expect(f.receipt(observer.stdout)).toMatchObject({ kind: 'blocked', reason: 'outcome-unknown' });
    } finally {
      f.release();
    }
    const writer = await live;
    expect(writer.status).toBe(0);
    expect(f.receipt(writer.stdout)).toMatchObject({ kind: 'completed', missionId: MISSION });
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-hold']);
  }, 15_000);

  it('launches synthesis once when two resumes race for the same mission', async () => {
    const f = missionFixture();
    expect(f.invoke(f.start('fixture-hold', ['--stop-after', 'extraction'])).status).toBe(0);
    const settled = [false, false];
    const runs = [f.launch(f.resume()), f.launch(f.resume())].map((run, index) =>
      run.finally(() => { settled[index] = true; }));
    try {
      // Two distinct signals, in no assumed order: the loser finishes on its own, and the
      // winner's native child has entered. The loser can settle before that child starts.
      await vi.waitFor(() => { expect(settled.some(Boolean)).toBe(true); },
        { timeout: 8000, interval: 20 });
      await vi.waitFor(() => { expect(f.calls()).toContain('fixture-hold'); },
        { timeout: 8000, interval: 20 });
      expect(settled.filter(Boolean)).toHaveLength(1);
      expect(f.calls().filter((model) => model === 'fixture-hold')).toHaveLength(1);
    } finally {
      f.release();
    }
    const results = await Promise.all(runs);
    expect(f.calls().filter((model) => model === 'fixture-hold')).toHaveLength(1);
    expect(results.map((result) => result.status).sort()).toEqual([0, 3]);
    const loser = results.find((result) => result.status === 3);
    expect(['conflict', 'outcome-unknown']).toContain(f.receipt(loser?.stdout ?? '{}').reason);
  }, 15_000);

  it('refuses to start a mission identifier that already exists', () => {
    const f = missionFixture();
    expect(f.invoke(f.start()).status).toBe(0);
    const before = contentsDigest(f.directory);
    const again = f.invoke(f.start());
    expect(again.status).toBe(3);
    expect(f.receipt(again.stdout)).toMatchObject({ kind: 'blocked', reason: 'conflict' });
    expect(f.calls()).toHaveLength(2);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('re-admits a persisted extraction against the persisted input before synthesis', () => {
    const f = missionFixture();
    f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction']));
    f.edit(3, (value) => {
      value['value'] = { evidence: [{ sourceId: 'a', quote: 'absent quotation' },
        { sourceId: 'b', quote: 'beta' }], limitations: [] };
    });
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(3);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'blocked', reason: 'inadmissible' });
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it.each([
    ['corrupt bytes', 'unreadable', (f: ReturnType<typeof missionFixture>) => {
      writeFileSync(f.record(3), '{"format":');
    }],
    ['an unknown format version', 'incompatible', (f: ReturnType<typeof missionFixture>) => {
      f.edit(1, (value) => { value['format'] = 'void-machine.note-mission/9'; });
    }],
    ['a changed execution contract', 'context-changed', (f: ReturnType<typeof missionFixture>) => {
      f.edit(1, (value) => { value['contract'] = `sha256:${'0'.repeat(64)}`; });
    }],
  ] as const)('preserves %s and dispatches nothing', (_label, reason, damage) => {
    const f = missionFixture();
    f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction']));
    damage(f);
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(3);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'blocked', reason });
    expect(resumed.stdout).not.toContain('alpha material');
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('dispatches nothing when the store cannot be created', () => {
    const f = missionFixture();
    writeFileSync(f.store, 'not a directory');
    const result = f.invoke(f.start());
    expect(result.status).toBe(3);
    expect(f.receipt(result.stdout)).toMatchObject({ kind: 'blocked', reason: 'storage' });
    expect(f.calls()).toEqual([]);
    expect(readFileSync(f.store, 'utf8')).toBe('not a directory');
  });

  // Permission bits do not bind a root process, so the failure cannot be produced there.
  it.skipIf(process.getuid?.() === 0)('refuses synthesis when the accepted extraction cannot be saved', () => {
    const f = missionFixture();
    let result: ReturnType<typeof f.invoke>;
    // Restore before the fixture removes its root, whatever the hook order.
    try { result = f.invoke(f.start('fixture-synthesis', [], 'fixture-extract-lock')); }
    finally { if (existsSync(f.directory)) chmodSync(f.directory, 0o700); }
    expect(result.status).toBe(3);
    expect(f.receipt(result.stdout)).toMatchObject({ kind: 'blocked', reason: 'storage' });
    expect(f.calls()).toEqual(['fixture-extract-lock']);
  });
});
