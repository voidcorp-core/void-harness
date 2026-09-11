import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire as createNodeRequire } from 'node:module';
import { dirname } from 'node:path';

interface SqliteStatement {
  readonly get: (...parameters: readonly unknown[]) => unknown;
  readonly run: (...parameters: readonly unknown[]) => unknown;
}

interface SqliteDatabase {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => SqliteStatement;
  readonly close: () => void;
}

interface SqliteModule {
  readonly DatabaseSync: new (path: string, options?: { readonly timeout?: number }) => SqliteDatabase;
}

export type RunPhase = 'reserved' | 'running' | 'completed' | 'aborted';
export type RunEventKind = 'start' | 'heartbeat' | 'complete' | 'abort';

export interface DurableRunState {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly phase: RunPhase;
  readonly revision: number;
  readonly leaseToken: string;
  readonly budgetRemaining: number;
  readonly proofDigest?: string;
  readonly authoritativeEffects: 0;
}

export interface DurableRunEvent {
  readonly kind: RunEventKind;
  readonly leaseToken: string;
  readonly proofInput?: string;
  readonly workerSuccess?: boolean;
}

export interface DurableRunResult {
  readonly state: DurableRunState;
  readonly event: DurableRunEvent;
  readonly eventDigest: string;
}

export type CrashPoint = 'before-transaction' | 'after-transaction';

export interface DurableRunStore {
  readonly read: (runId: string) => DurableRunState | undefined;
  readonly evidence: (runId: string) => DurableRunEvidence | undefined;
  readonly append: (runId: string, event: DurableRunEvent, crash?: CrashPoint) => DurableRunResult;
  readonly close: () => void;
}

export interface DurableRunEvidence {
  readonly state: DurableRunState;
  readonly eventCount: number;
  readonly outboxCount: number;
}

const digest = (input: string): string => `sha256:${createHash('sha256').update(input, 'utf8').digest('hex')}`;
const encode = (value: unknown): string => JSON.stringify(value);
const property = (value: object, name: string): unknown => Reflect.get(value, name);
const isSqliteModule = (value: unknown): value is SqliteModule => typeof value === 'object' && !!value && typeof Reflect.get(value, 'DatabaseSync') === 'function';
const sqliteModule = (): SqliteModule => {
  const loaded: unknown = createNodeRequire(import.meta.url)('node:sqlite');
  if (!isSqliteModule(loaded)) throw new Error('node:sqlite is unavailable');
  return loaded;
};

const isState = (value: unknown): value is DurableRunState => {
  if (typeof value !== 'object' || !value) return false;
  const phase = property(value, 'phase');
  const proofDigest = property(value, 'proofDigest');
  return property(value, 'schemaVersion') === 1 && typeof property(value, 'runId') === 'string' &&
    ['reserved', 'running', 'completed', 'aborted'].includes(String(phase)) &&
    typeof property(value, 'revision') === 'number' && typeof property(value, 'leaseToken') === 'string' &&
    typeof property(value, 'budgetRemaining') === 'number' &&
    (proofDigest === undefined || typeof proofDigest === 'string') && property(value, 'authoritativeEffects') === 0;
};

const parseState = (value: string): DurableRunState => {
  const parsed: unknown = JSON.parse(value);
  if (!isState(parsed)) throw new Error('durable run state is invalid');
  return parsed;
};

const rowText = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || !value) return undefined;
  const state = property(value, 'state_json');
  return typeof state === 'string' ? state : undefined;
};

const rowNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'object' || !value) return undefined;
  const count = property(value, 'count');
  return typeof count === 'number' ? count : undefined;
};

const transition = (state: DurableRunState, event: DurableRunEvent): DurableRunState => {
  if (state.leaseToken !== event.leaseToken) throw new Error('stale supervisor lease');
  if (event.kind === 'start' && state.phase !== 'reserved') throw new Error('run is not reserved');
  if (event.kind === 'heartbeat' && state.phase !== 'running') throw new Error('run is not running');
  if (event.kind === 'complete' && (state.phase !== 'running' || event.proofInput === undefined)) throw new Error('run completion requires a running run and proof input');
  if (event.kind === 'complete' && event.workerSuccess === true) throw new Error('worker success is not authoritative proof');
  if (event.kind === 'abort' && !['reserved', 'running'].includes(state.phase)) throw new Error('run cannot be aborted from its terminal phase');
  const phase: RunPhase = event.kind === 'start' ? 'running' : event.kind === 'complete' ? 'completed' : event.kind === 'abort' ? 'aborted' : state.phase;
  return { ...state, phase, revision: state.revision + 1, ...(event.kind === 'complete' ? { proofDigest: digest(event.proofInput ?? '') } : {}) };
};

export const createDurableRun = (runId: string, leaseToken: string, budgetRemaining: number): DurableRunState => ({
  schemaVersion: 1, runId, phase: 'reserved', revision: 0, leaseToken, budgetRemaining, authoritativeEffects: 0,
});

export const applyDurableEvent = (state: DurableRunState, event: DurableRunEvent): DurableRunResult => ({
  state: transition(state, event), event, eventDigest: digest(encode(event)),
});

export const openDurableRunStore = (databasePath: string, initial?: DurableRunState): DurableRunStore => {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new (sqliteModule().DatabaseSync)(databasePath, { timeout: 5000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS run_state (run_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, revision INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS run_events (event_digest TEXT PRIMARY KEY, run_id TEXT NOT NULL, revision INTEGER NOT NULL, event_json TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS run_outbox (intent_key TEXT PRIMARY KEY, run_id TEXT NOT NULL, intent_json TEXT NOT NULL) STRICT;
  `);
  const existing = initial === undefined ? undefined : rowText(database.prepare('SELECT state_json FROM run_state WHERE run_id = ?').get(initial.runId));
  if (initial !== undefined && existing === undefined) database.prepare('INSERT INTO run_state (run_id, state_json, revision) VALUES (?, ?, ?)').run(initial.runId, encode(initial), initial.revision);
  return {
    read: (runId) => {
      const state = rowText(database.prepare('SELECT state_json FROM run_state WHERE run_id = ?').get(runId));
      return state === undefined ? undefined : parseState(state);
    },
    evidence: (runId) => {
      const state = rowText(database.prepare('SELECT state_json FROM run_state WHERE run_id = ?').get(runId));
      if (state === undefined) return undefined;
      const eventCount = rowNumber(database.prepare('SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?').get(runId));
      const outboxCount = rowNumber(database.prepare('SELECT COUNT(*) AS count FROM run_outbox WHERE run_id = ?').get(runId));
      if (eventCount === undefined || outboxCount === undefined) throw new Error('durable run evidence is invalid');
      return { state: parseState(state), eventCount, outboxCount };
    },
    append: (runId, event, crash) => {
      const current = rowText(database.prepare('SELECT state_json FROM run_state WHERE run_id = ?').get(runId));
      if (current === undefined) throw new Error('run does not exist');
      const eventDigest = digest(encode(event));
      const recorded = database.prepare('SELECT event_digest FROM run_events WHERE event_digest = ?').get(eventDigest);
      if (recorded !== undefined) return { state: parseState(current), event, eventDigest };
      const result = applyDurableEvent(parseState(current), event);
      if (crash === 'before-transaction') throw new Error('injected crash before transaction');
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('UPDATE run_state SET state_json = ?, revision = ? WHERE run_id = ? AND revision = ?').run(encode(result.state), result.state.revision, runId, result.state.revision - 1);
        database.prepare('INSERT INTO run_events (event_digest, run_id, revision, event_json) VALUES (?, ?, ?, ?)').run(eventDigest, runId, result.state.revision, encode(event));
        database.prepare('INSERT OR IGNORE INTO run_outbox (intent_key, run_id, intent_json) VALUES (?, ?, ?)').run(eventDigest, runId, encode({ kind: 'no-effect', revision: result.state.revision }));
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      if (crash === 'after-transaction') throw new Error('injected crash after transaction');
      return { ...result, eventDigest };
    },
    close: () => database.close(),
  };
};
