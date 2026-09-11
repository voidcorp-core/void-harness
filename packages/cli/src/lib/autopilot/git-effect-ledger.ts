import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

interface SqliteStatement { readonly get: (...parameters: readonly unknown[]) => unknown; readonly run: (...parameters: readonly unknown[]) => { readonly changes?: number }; }
interface SqliteDatabase { readonly exec: (sql: string) => void; readonly prepare: (sql: string) => SqliteStatement; readonly close: () => void; }
interface SqliteModule { readonly DatabaseSync: new (path: string, options?: { readonly timeout?: number }) => SqliteDatabase; }
export interface GitEffectRequestInput { readonly runId: string; readonly unitId: string; readonly revision: number; readonly ordinal: number; readonly declaredFiles: readonly string[]; readonly payload: string; }
export interface GitEffectRequest extends GitEffectRequestInput { readonly effectId: string; }
export interface GitEffectProof { readonly effectId: string; readonly baseSha: string; readonly headSha: string; readonly treeSha: string; readonly sourceSha: string; readonly files: readonly string[]; }
export type GitEffectState = 'claimed' | 'applied' | 'ambiguous';
export interface GitEffectRecord { readonly state: GitEffectState; readonly effectId: string; readonly fence: number; readonly proof?: GitEffectProof; readonly detail?: string; }
export interface GitEffectLedger { readonly database: SqliteDatabase; readonly read: (effectId: string) => GitEffectRecord | undefined; readonly close: () => void; }

const isSqliteModule = (value: unknown): value is SqliteModule => typeof value === 'object' && !!value && typeof Reflect.get(value, 'DatabaseSync') === 'function';
const sqlite = (): SqliteModule => { const value: unknown = createRequire(import.meta.url)('node:sqlite'); if (!isSqliteModule(value)) throw new Error('node:sqlite is unavailable'); return value; };
const isEffectState = (value: unknown): value is GitEffectState => value === 'claimed' || value === 'applied' || value === 'ambiguous';
const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const canonical = (input: GitEffectRequestInput): string => [input.runId, input.unitId, input.revision, input.ordinal, [...input.declaredFiles].sort(), input.payload].map((part) => `${JSON.stringify(part).length}:${JSON.stringify(part)}`).join('|');
const validSha = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);
const sortedFiles = (files: readonly string[]): string[] => [...files].sort();
const row = (value: unknown, key: string): unknown => typeof value === 'object' && value ? Reflect.get(value, key) : undefined;
const isProof = (value: unknown): value is GitEffectProof => typeof value === 'object' && value && typeof row(value, 'effectId') === 'string' && typeof row(value, 'baseSha') === 'string';
const parseProof = (value: string): GitEffectProof => { const parsed: unknown = JSON.parse(value); if (!isProof(parsed)) throw new Error('effect proof is invalid'); return parsed; };
const readRecord = (value: unknown): GitEffectRecord | undefined => {
  const effectId = row(value, 'effect_id'); const state = row(value, 'state'); const fence = row(value, 'fence');
  if (typeof effectId !== 'string' || !isEffectState(state) || typeof fence !== 'number') return undefined;
  const proofJson = row(value, 'proof_json'); const detail = row(value, 'detail');
  return { effectId, state, fence, ...(typeof proofJson === 'string' ? { proof: parseProof(proofJson) } : {}), ...(typeof detail === 'string' ? { detail } : {}) };
};

export const createGitEffectRequest = (input: GitEffectRequestInput): GitEffectRequest => {
  if (!input.runId || !input.unitId || !input.payload) throw new Error('effect identifiers and payload are required');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0 || !Number.isSafeInteger(input.ordinal) || input.ordinal < 0) throw new Error('effect coordinates are invalid');
  const declaredFiles = sortedFiles(input.declaredFiles); if (declaredFiles.some((file) => file.length === 0)) throw new Error('effect footprint is invalid');
  const normalized = { ...input, declaredFiles }; return { ...normalized, effectId: `effect-v1:sha256:${digest(canonical(normalized))}` };
};

export const openGitEffectLedger = (databasePath: string): GitEffectLedger => {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new (sqlite().DatabaseSync)(databasePath, { timeout: 5000 });
  database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS git_effects (effect_id TEXT PRIMARY KEY, request_json TEXT NOT NULL, state TEXT NOT NULL, fence INTEGER NOT NULL, proof_json TEXT, detail TEXT) STRICT;');
  return { database, read: (effectId) => readRecord(database.prepare('SELECT effect_id, state, fence, proof_json, detail FROM git_effects WHERE effect_id = ?').get(effectId)), close: () => database.close() };
};

export const claimGitEffect = (ledger: GitEffectLedger, request: GitEffectRequest, fence: number): GitEffectRecord => {
  if (!Number.isSafeInteger(fence) || fence < 0) throw new Error('fence is invalid');
  const existing = ledger.read(request.effectId);
  if (existing) {
    if (existing.state === 'ambiguous') throw new Error('effect is ambiguous');
    if (existing.fence !== fence || existing.state === 'applied') throw new Error('stale fence');
    return existing;
  }
  ledger.database.prepare('INSERT OR REPLACE INTO git_effects (effect_id, request_json, state, fence) VALUES (?, ?, ?, ?)').run(request.effectId, JSON.stringify(request), 'claimed', fence);
  return { effectId: request.effectId, state: 'claimed', fence };
};

export const markGitEffectAmbiguous = (ledger: GitEffectLedger, effectId: string, fence: number, detail: string): void => {
  const record = ledger.read(effectId); if (!record || record.fence !== fence) throw new Error('stale fence'); if (record.state === 'applied') return;
  ledger.database.prepare('UPDATE git_effects SET state = ?, detail = ? WHERE effect_id = ? AND fence = ?').run('ambiguous', detail, effectId, fence);
};

export const applyGitEffect = (ledger: GitEffectLedger, effectId: string, fence: number, proof: GitEffectProof): GitEffectRecord => {
  const record = ledger.read(effectId); if (!record || record.state === 'ambiguous') throw new Error(record?.state === 'ambiguous' ? 'effect is ambiguous' : 'effect is not claimed');
  if (record.fence !== fence) throw new Error('stale fence'); if (record.state === 'applied') return record;
  if (proof.effectId !== effectId || !validSha(proof.baseSha) || !validSha(proof.headSha) || !validSha(proof.treeSha) || !validSha(proof.sourceSha)) throw new Error('effect proof is invalid');
  const requestRow = ledger.database.prepare('SELECT request_json FROM git_effects WHERE effect_id = ?').get(effectId); const requestJson = row(requestRow, 'request_json');
  if (typeof requestJson !== 'string') throw new Error('effect request is missing');
  const request: unknown = JSON.parse(requestJson); const declaredFiles = row(request, 'declaredFiles');
  if (!Array.isArray(declaredFiles) || JSON.stringify(sortedFiles(proof.files)) !== JSON.stringify(sortedFiles(declaredFiles.filter((file): file is string => typeof file === 'string')))) throw new Error('effect proof widens footprint');
  ledger.database.prepare('UPDATE git_effects SET state = ?, proof_json = ? WHERE effect_id = ? AND fence = ? AND state = ?').run('applied', JSON.stringify(proof), effectId, fence, 'claimed');
  return { effectId, state: 'applied', fence, proof };
};
