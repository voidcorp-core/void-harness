// @test-resource network-browser
import { join } from 'node:path';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { contentsDigest, doctorFixture, processTestTimeoutMs } from './doctor-fixture.js';
import { processSignals } from './process-signal.js';
import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/claude-cli-note.mjs', import.meta.url));
const hostScript = fileURLToPath(new URL('./fixtures/note-mission-host.ts', import.meta.url));
vi.setConfig({ testTimeout: processTestTimeoutMs });

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
    crashAfter, sessions,
    // Held fixtures announce their barrier here; a test awaits that event, never a file.
    listen: () => processSignals(f.root) };
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

  it('reports an unconfirmed cancellation as unknown at once and on resume, launching nothing again', async () => {
    const f = missionFixture();
    // The held child announces its barrier; nothing here waits on it.
    await f.listen();
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
    const signals = await f.listen();
    const live = f.launch(f.start('fixture-hold'));
    try {
      // The held launch is recorded before its barrier announces itself.
      await signals.received('fixture-hold');
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
  });

  it('launches synthesis once when two resumes race for the same mission', async () => {
    const f = missionFixture();
    const signals = await f.listen();
    expect(f.invoke(f.start('fixture-hold', ['--stop-after', 'extraction'])).status).toBe(0);
    const settled = [false, false];
    const runs = [f.launch(f.resume()), f.launch(f.resume())].map((run, index) =>
      run.finally(() => { settled[index] = true; }));
    try {
      // Two distinct signals, in no assumed order: the loser finishes on its own, and the
      // winner's native child has entered. The loser can settle before that child starts.
      await Promise.all([Promise.race(runs), signals.received('fixture-hold')]);
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
  });

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

type Stored = { format: string; kind: string };

function cancellationFixture() {
  const f = missionFixture();
  const cancel = () => ['note', 'cancel', '--store', f.store, '--mission', MISSION];
  const abandon = () => ['note', 'abandon', '--store', f.store, '--mission', MISSION];
  const stored = (): Stored[] => {
    const records: Stored[] = [];
    for (let revision = 1; existsSync(f.record(revision)); revision += 1) {
      records.push(JSON.parse(readFileSync(f.record(revision), 'utf8')) as Stored);
    }
    return records;
  };
  const bytes = (revision: number) => readFileSync(f.record(revision), 'utf8');
  return { ...f, cancel, abandon, stored, bytes };
}

describe('note mission cancellation and explicit abandonment', () => {
  it('refuses cancel and abandon without a valid mission identifier', () => {
    const f = cancellationFixture();
    for (const args of [['note', 'cancel', '--store', f.store], ['note', 'abandon', '--store', f.store],
      ['note', 'cancel', '--store', f.store, '--mission', '../escape']]) {
      const result = f.invoke(args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
    }
    expect(existsSync(f.store)).toBe(false);
  });

  it('confirms the stop of an idle mission, keeps its accepted extraction and never synthesizes', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction'])).status).toBe(0);
    const accepted = [1, 2, 3].map(f.bytes);
    const cancelled = f.invoke(f.cancel());
    expect(cancelled.status).toBe(1);
    expect(f.receipt(cancelled.stdout)).toMatchObject({ kind: 'cancelled', missionId: MISSION,
      stage: 'synthesis', stop: 'confirmed', usage: [{ role: 'extractor' }] });
    expect(cancelled.stderr).toBe('');
    expect([1, 2, 3].map(f.bytes)).toEqual(accepted);
    expect(f.stored().map((record) => record.kind)).toEqual(['started', 'dispatched', 'accepted', 'cancelled']);

    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(1);
    expect(resumed.stdout).toBe(cancelled.stdout);
    const again = f.invoke(f.cancel());
    expect(again.status).toBe(1);
    expect(again.stdout).toBe(cancelled.stdout);
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('reports an in-flight cancel as unconfirmed, then keeps only the late cost', async () => {
    const f = cancellationFixture();
    const signals = await f.listen();
    const live = f.launch(f.start('fixture-hold'));
    let requested: ReturnType<typeof f.invoke> | undefined;
    try {
      await signals.received('fixture-hold');
      requested = f.invoke(f.cancel());
    } finally {
      f.release();
    }
    expect(requested?.status).toBe(3);
    expect(f.receipt(requested?.stdout ?? '{}')).toMatchObject({ kind: 'cancelled',
      missionId: MISSION, stage: 'synthesis', stop: 'requested-unconfirmed', effect: 'unknown',
      usage: [{ role: 'extractor' }] });
    // The loser of the revision records the cost it observed, never its result.
    const writer = await live;
    expect(writer.status).toBe(1);
    expect(JSON.parse(writer.stdout)).toEqual({ kind: 'cancelled', missionId: MISSION,
      stage: 'synthesis', stop: 'late-result-discarded',
      usage: [expect.objectContaining({ role: 'extractor' }),
        expect.objectContaining({ role: 'synthesizer' })] });
    expect(f.stored().map((record) => [record.kind, record.format.slice(-1)])).toEqual([
      ['started', '1'], ['dispatched', '1'], ['accepted', '1'], ['dispatched', '1'],
      ['cancel-requested', '2'], ['discarded', '3']]);
    const resumed = f.invoke(f.resume());
    expect(resumed.stdout).toBe(writer.stdout);
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-hold']);
  });

  it('never synthesizes from an extraction that returns after its cancellation', async () => {
    const f = cancellationFixture();
    const signals = await f.listen();
    const live = f.launch(f.start('fixture-synthesis', [], 'fixture-extract-hold'));
    let requested: ReturnType<typeof f.invoke> | undefined;
    try {
      await signals.received('fixture-extract-hold');
      requested = f.invoke(f.cancel());
    } finally {
      f.release();
    }
    expect(f.receipt(requested?.stdout ?? '{}')).toMatchObject({ kind: 'cancelled', stage: 'extraction',
      stop: 'requested-unconfirmed', effect: 'unknown', usage: [] });
    const writer = await live;
    expect(writer.status).toBe(1);
    expect(JSON.parse(writer.stdout)).toEqual({ kind: 'cancelled', missionId: MISSION,
      stage: 'extraction', stop: 'late-result-discarded',
      usage: [expect.objectContaining({ role: 'extractor' })] });
    expect(f.stored().map((record) => record.kind))
      .toEqual(['started', 'dispatched', 'cancel-requested', 'discarded']);
    expect(f.invoke(f.resume()).stdout).toBe(writer.stdout);
    expect(f.calls()).toEqual(['fixture-extract-hold']);
  });

  it('keeps only the cost of a synthesis returning after its abandonment', async () => {
    const f = cancellationFixture();
    const signals = await f.listen();
    const live = f.launch(f.start('fixture-hold'));
    let abandoned: ReturnType<typeof f.invoke> | undefined;
    try {
      await signals.received('fixture-hold');
      abandoned = f.invoke(f.abandon());
    } finally {
      f.release();
    }
    expect(abandoned?.status).toBe(1);
    expect(f.receipt(abandoned?.stdout ?? '{}')).toMatchObject({ kind: 'abandoned',
      stage: 'synthesis', effect: 'unknown', usage: [{ role: 'extractor' }] });
    const writer = await live;
    expect(writer.status).toBe(1);
    expect(JSON.parse(writer.stdout)).toEqual({ kind: 'abandoned', missionId: MISSION,
      stage: 'synthesis', effect: 'late-result-discarded',
      usage: [expect.objectContaining({ role: 'extractor' }),
        expect.objectContaining({ role: 'synthesizer' })] });
    expect(f.stored().map((record) => [record.kind, record.format.slice(-1)])).toEqual([
      ['started', '1'], ['dispatched', '1'], ['accepted', '1'], ['dispatched', '1'],
      ['abandoned', '2'], ['discarded', '3']]);
    expect(f.invoke(f.resume()).stdout).toBe(writer.stdout);
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-hold']);
  });

  it('abandons an unknown step once, idempotently, and never runs it again under the same identifier', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-crash')).signal).toBe('SIGKILL');
    const abandoned = f.invoke(f.abandon());
    expect(abandoned.status).toBe(1);
    expect(f.receipt(abandoned.stdout)).toMatchObject({ kind: 'abandoned', missionId: MISSION,
      stage: 'synthesis', effect: 'unknown' });
    expect(f.stored().map((record) => record.kind))
      .toEqual(['started', 'dispatched', 'accepted', 'dispatched', 'abandoned']);

    const before = contentsDigest(f.directory);
    for (const args of [f.abandon(), f.resume(), f.cancel()]) {
      const again = f.invoke(args);
      expect(again.status).toBe(1);
      expect(again.stdout).toBe(abandoned.stdout);
    }
    expect(f.invoke(f.start()).status).toBe(3);
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-crash']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('abandons a requested but unconfirmed cancellation', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-crash')).signal).toBe('SIGKILL');
    expect(f.invoke(f.cancel()).status).toBe(3);
    const abandoned = f.invoke(f.abandon());
    expect(f.receipt(abandoned.stdout)).toMatchObject({ kind: 'abandoned', stage: 'synthesis', effect: 'unknown' });
    expect(f.stored().map((record) => record.kind).slice(-2)).toEqual(['cancel-requested', 'abandoned']);
  });

  it('refuses to abandon a mission that can still be cancelled or has already settled', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction'])).status).toBe(0);
    const idle = contentsDigest(f.directory);
    const refused = f.invoke(f.abandon());
    expect(refused.status).toBe(3);
    expect(f.receipt(refused.stdout)).toMatchObject({ kind: 'blocked', reason: 'not-abandonable' });
    expect(contentsDigest(f.directory)).toBe(idle);

    const completed = f.invoke(f.resume());
    expect(completed.status).toBe(0);
    const settled = contentsDigest(f.directory);
    for (const args of [f.abandon(), f.cancel()]) {
      const result = f.invoke(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(completed.stdout);
    }
    expect(contentsDigest(f.directory)).toBe(settled);
  });

  it.each([
    ['a missing mission', 'missing', () => { /* Nothing is started. */ }],
    ['corrupt bytes', 'unreadable', (f: ReturnType<typeof cancellationFixture>) => {
      writeFileSync(f.record(3), '{"format":');
    }],
    ['an unknown format version', 'incompatible', (f: ReturnType<typeof cancellationFixture>) => {
      f.edit(3, (value) => { value['format'] = 'void-machine.note-mission/9'; });
    }],
    ['a historical kind under the new format', 'unreadable', (f: ReturnType<typeof cancellationFixture>) => {
      f.edit(3, (value) => { value['format'] = 'void-machine.note-mission/2'; });
    }],
  ] as const)('refuses to cancel or abandon %s and writes nothing', (label, reason, damage) => {
    const f = cancellationFixture();
    if (label !== 'a missing mission') {
      expect(f.invoke(f.start('fixture-crash')).signal).toBe('SIGKILL');
    }
    damage(f);
    const before = existsSync(f.directory) ? contentsDigest(f.directory) : undefined;
    for (const args of [f.cancel(), f.abandon()]) {
      const result = f.invoke(args);
      expect(result.status).toBe(3);
      expect(f.receipt(result.stdout)).toMatchObject({ kind: 'blocked', reason });
    }
    expect(existsSync(f.directory) ? contentsDigest(f.directory) : undefined).toBe(before);
  });

  it('refuses a cancellation record written under the historical format', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction'])).status).toBe(0);
    expect(f.invoke(f.cancel()).status).toBe(1);
    f.edit(4, (value) => { value['format'] = 'void-machine.note-mission/1'; });
    const before = contentsDigest(f.directory);
    const resumed = f.invoke(f.resume());
    expect(resumed.status).toBe(3);
    expect(f.receipt(resumed.stdout)).toMatchObject({ kind: 'blocked', reason: 'unreadable' });
    expect(f.calls()).toEqual(['fixture-extract']);
    expect(contentsDigest(f.directory)).toBe(before);
  });

  it('keeps historical records in the first format and writes only cancellation in the second', () => {
    const f = cancellationFixture();
    expect(f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction'])).status).toBe(0);
    expect(f.stored().map((record) => record.format)).toEqual(Array(3).fill('void-machine.note-mission/1'));
    expect(f.invoke(f.cancel()).status).toBe(1);
    expect(f.stored().map((record) => record.format)).toEqual([
      ...Array(3).fill('void-machine.note-mission/1'), 'void-machine.note-mission/2']);
  });
});

describe('note mission cancellation ordered by the journal', () => {
  it('confirms a stop recorded before the dispatch intent and never spawns the step', async () => {
    const f = cancellationFixture();
    const signals = await f.listen();
    const live = f.launchScript(hostScript, [f.store, MISSION, join(f.root, 'request.json'), f.root,
      join(f.root, 'claude-fixture'), 'hold-before:dispatched']);
    let cancelled: ReturnType<typeof f.invoke> | undefined;
    try {
      await signals.received('held');
      cancelled = f.invoke(f.cancel());
    } finally {
      f.release();
    }
    expect(cancelled?.status).toBe(1);
    expect(f.receipt(cancelled?.stdout ?? '{}')).toMatchObject({ kind: 'cancelled', missionId: MISSION,
      stage: 'extraction', stop: 'confirmed', usage: [] });
    // The host lost the revision of its intent: it reads the stop instead of launching.
    const host = await live;
    expect(host.status).toBe(1);
    expect(host.stdout.trim()).toBe(cancelled?.stdout.trim() ?? '');
    expect(f.stored().map((record) => record.kind)).toEqual(['started', 'cancelled']);
    expect(f.calls()).toEqual([]);
  });
});

describe('note cancel losing its revision', () => {
  it('reports the winning state instead of a conflict when a step settles first', async () => {
    const f = cancellationFixture();
    const signals = await f.listen();
    expect(f.invoke(f.start('fixture-synthesis', ['--stop-after', 'extraction'])).status).toBe(0);
    // The cancel reads an idle mission, then waits before its append.
    const cancel = f.launchScript(hostScript, [f.store, MISSION, join(f.root, 'request.json'), f.root,
      join(f.root, 'claude-fixture'), 'cancel-held']);
    let completed: ReturnType<typeof f.invoke> | undefined;
    try {
      await signals.received('held');
      completed = f.invoke(f.resume());
    } finally {
      f.release();
    }
    expect(completed?.status).toBe(0);
    const lost = await cancel;
    expect(lost.status).toBe(0);
    expect(lost.stdout.trim()).toBe(completed?.stdout.trim() ?? '');
    expect(f.stored().map((record) => record.kind))
      .toEqual(['started', 'dispatched', 'accepted', 'dispatched', 'completed']);
    expect(f.calls()).toEqual(['fixture-extract', 'fixture-synthesis']);
  });
});
