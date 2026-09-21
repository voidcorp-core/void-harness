// Test host, not a production entry: the production mission composition over the real
// file journal, with one boundary condition made deterministic by its mode:
//   crash-after:<kind>      SIGKILL as soon as the journal confirms a record of that kind
//   unconfirm-after:<kind>  report that confirmed record as linked but not durable
//   deadline-after-entry    fire the synthesis deadline once the native child has entered
//   contract:<value>        compose with another contract digest
//   hold-before:<kind>      signal ./held, then append that record only once ./release exists
//   cancel-held             run note cancel instead, holding its append the same way
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cancelNoteMission, startNoteMission } from '../../src/application/note-mission.js';
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

// Explicit barrier: the test orders the other process while this append waits.
const held = async (): Promise<void> => {
  writeFileSync(join(cwd, 'held'), '');
  const deadline = Date.now() + 8000;
  while (!existsSync(join(cwd, 'release'))) {
    if (Date.now() > deadline) throw new Error('hold-before barrier was never released');
    await new Promise((resume) => { setTimeout(resume, 10); });
  }
};

const base = claudeMissionDependencies({ executable, cwd, store, missionId,
  env: { PATH: process.env['PATH'] ?? '' },
  ...(action === 'deadline-after-entry' ? { clock: entryClock } : {}) });
const journal: MissionJournal = {
  read: base.journal.read,
  append: async (id, expected, record) => {
    const kind = typeof record === 'object' && record !== null && 'kind' in record ? record.kind : undefined;
    if ((action === 'hold-before' && kind === argument) || action === 'cancel-held') await held();
    const result = await base.journal.append(id, expected, record);
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
const receipt = action === 'cancel-held' ? await cancelNoteMission(context) : await startNoteMission(raw, { extractionModel: 'fixture-extract',
  synthesisModel: action === 'deadline-after-entry' ? 'fixture-hold' : 'fixture-synthesis',
  timeoutMs: 30_000 }, context);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
// Same mapping as the CLI: an unconfirmed cancellation leaves an outcome to attend to.
const unresolved = receipt.kind === 'blocked'
  || (receipt.kind === 'cancelled' && receipt.stop === 'requested-unconfirmed');
process.exitCode = unresolved ? 3 : receipt.kind === 'completed' || receipt.kind === 'paused' ? 0 : 1;
