// Test host, not a production entry: the production mission composition over the real
// file journal, with one boundary condition made deterministic by its mode:
//   crash-after:<kind>      SIGKILL as soon as the journal confirms a record of that kind
//   unconfirm-after:<kind>  report that confirmed record as linked but not durable
//   deadline-after-entry    fire the synthesis deadline once the native child has entered
//   contract:<value>        compose with another contract digest
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startNoteMission } from '../../src/application/note-mission.js';
import { claudeMissionDependencies } from '../../src/application/runtime-note.js';
import type { Clock } from '../../src/runtime/execution.js';
import type { MissionJournal } from '../../src/runtime/journal.js';

const [store, missionId, inputPath, cwd, executable, mode] = process.argv.slice(2);
if (store === undefined || missionId === undefined || inputPath === undefined || cwd === undefined
  || executable === undefined || mode === undefined) {
  process.stderr.write('usage: note-mission-host <store> <mission> <input> <cwd> <executable> <mode>\n');
  process.exit(2);
}
const separator = mode.indexOf(':');
const action = separator < 0 ? mode : mode.slice(0, separator);
const argument = separator < 0 ? '' : mode.slice(separator + 1);

// The first deadline (extraction) never fires; the second fires once the held child is in.
let scheduled = 0;
const entryClock: Clock = {
  schedule(_delayMs, fire) {
    scheduled += 1;
    if (scheduled === 1) return () => { /* Extraction runs without a deadline here. */ };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = (): void => {
      const log = join(cwd, 'calls.log');
      if (existsSync(log) && readFileSync(log, 'utf8').includes('fixture-hold')) fire();
      else timer = setTimeout(poll, 10);
    };
    poll();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  },
};

const base = claudeMissionDependencies({ executable, cwd, store, missionId,
  env: { PATH: process.env['PATH'] ?? '' },
  ...(action === 'deadline-after-entry' ? { clock: entryClock } : {}) });
const journal: MissionJournal = {
  read: base.journal.read,
  append: async (id, expected, record) => {
    const result = await base.journal.append(id, expected, record);
    const kind = typeof record === 'object' && record !== null && 'kind' in record ? record.kind : undefined;
    if (result.kind !== 'appended' || kind !== argument) return result;
    if (action === 'crash-after') process.kill(process.pid, 'SIGKILL');
    if (action === 'unconfirm-after') {
      return { kind: 'unconfirmed', revision: result.revision, reason: 'mission directory could not be synchronized' };
    }
    return result;
  },
};
const context = { ...base, journal, ...(action === 'contract' ? { contract: argument } : {}) };
const raw: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
const receipt = await startNoteMission(raw, { extractionModel: 'fixture-extract',
  synthesisModel: action === 'deadline-after-entry' ? 'fixture-hold' : 'fixture-synthesis',
  timeoutMs: 30_000 }, context);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
process.exitCode = receipt.kind === 'stopped' ? 1 : receipt.kind === 'blocked' ? 3 : 0;
