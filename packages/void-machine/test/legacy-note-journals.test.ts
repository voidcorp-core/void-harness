import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { createFileJournal } from '../src/adapters/store/file-journal.js';
import { resumeNoteMission, abandonNoteMission,
  type MissionDependencies } from '../src/application/note-mission.js';
import { claudeNoteContract } from '../src/application/runtime-note.js';
import { noteMissionDescription } from '../src/verticals/sourced-note/mission-codec.js';

const note = {
  title: 'Legacy note', summary: 'Both sources are recorded',
  evidence: [{ sourceId: 'a', quote: 'alpha material' },
    { sourceId: 'b', quote: 'beta material' }],
  limitations: [],
};

function fixtureRecords(name: string): unknown[] {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')) as unknown[];
}

function legacyJournal(records: readonly unknown[]) {
  const root = mkdtempSync(join(tmpdir(), 'machine-legacy-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const store = join(root, 'store');
  const directory = join(store, 'legacy');
  mkdirSync(directory, { recursive: true });
  const paths = records.map((record, index) => {
    const path = join(directory, `${String(index + 1).padStart(6, '0')}.json`);
    writeFileSync(path, JSON.stringify(record));
    return path;
  });
  const bytes = () => paths.map((path) => readFileSync(path, 'utf8'));
  const calls: string[] = [];
  const context: MissionDependencies = {
    journal: createFileJournal({ root: store }), missionId: 'legacy',
    contract: claudeNoteContract, executionId: () => 'new-synthesis',
    clock: { schedule: () => () => {} },
    runtime: () => ({
      extract: async () => { calls.push('extraction'); throw new Error('unexpected extraction'); },
      synthesize: async (request) => {
        calls.push('synthesis');
        return { kind: 'result', executionId: request.executionId, payload: note };
      },
      drainUsage: () => [],
    }),
  };
  return { context, calls, bytes, directory };
}

it('resumes a note-mission/1 without repeating extraction or rewriting records', async () => {
  const f = legacyJournal(fixtureRecords('note-mission-v1.json'));
  const before = f.bytes();
  const result = await resumeNoteMission(f.context);
  expect(result).toMatchObject({ kind: 'completed', note: { title: 'Legacy note' } });
  expect(f.calls).toEqual(['synthesis']);
  expect(f.bytes()).toEqual(before);
  expect(JSON.parse(readFileSync(join(f.directory, '000005.json'), 'utf8')))
    .toMatchObject({ format: 'void-machine.note-mission/1', kind: 'completed' });
  expect(await resumeNoteMission(f.context)).toEqual(result);
  expect(f.calls).toEqual(['synthesis']);
});

it('reads note-mission/2 cancellation and abandons without launching a step', async () => {
  const f = legacyJournal(fixtureRecords('note-mission-v2.json'));
  const before = f.bytes();
  expect(await resumeNoteMission(f.context)).toMatchObject({
    kind: 'cancelled', stage: 'synthesis', stop: 'requested-unconfirmed',
  });
  expect(f.bytes()).toEqual(before);
  expect(f.calls).toEqual([]);
  expect(await abandonNoteMission(f.context)).toMatchObject({
    kind: 'abandoned', stage: 'synthesis', effect: 'unknown',
  });
  expect(JSON.parse(readFileSync(join(f.directory, '000006.json'), 'utf8')))
    .toMatchObject({ format: 'void-machine.note-mission/2', kind: 'abandoned' });
  expect(f.calls).toEqual([]);
});

it('writes a rejected step in note-mission/3 only and replays it without a call', async () => {
  const { codec } = noteMissionDescription;
  const encoded = codec.encode({ kind: 'rejected', step: 'extraction',
    usage: [{ role: 'extractor' }] }, 3);
  if (encoded.kind !== 'encoded') throw new Error('Expected an encoded rejection');
  expect(encoded.record).toMatchObject({ format: 'void-machine.note-mission/3', revision: 3 });
  for (const format of ['void-machine.note-mission/1', 'void-machine.note-mission/2']) {
    expect(codec.decode({ ...Object(encoded.record), format }, 3))
      .toEqual({ kind: 'unreadable' });
  }
  const [started, dispatched] = fixtureRecords('note-mission-v1.json');
  const f = legacyJournal([started, dispatched, encoded.record]);
  const before = f.bytes();
  const receipt = await resumeNoteMission(f.context);
  expect(receipt).toEqual({ kind: 'rejected', missionId: 'legacy', stage: 'extraction',
    usage: [{ role: 'extractor' }] });
  expect(await resumeNoteMission(f.context)).toEqual(receipt);
  expect(f.bytes()).toEqual(before);
  expect(f.calls).toEqual([]);
});
