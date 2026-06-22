// Durable run state for backlog-autopilot — the on-disk machine that makes a
// multi-hour run resumable after a crash. Lives at `.void/autopilot/<runId>/`.
// The cluster STATUSES are the resume cursor (no separate index that can drift).
//
// Two correctness rules from the autoplan review (M3):
//   - Atomic writes (temp + rename) so a crash mid-write never corrupts the file.
//   - On resume, RECONCILE against the remote reality (`gh pr list`) rather than
//     replaying a stale cursor: a PR we remember opening but that is gone from the
//     remote has merged since; external actions stay idempotent.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ClusterStatus = 'pending' | 'in-progress' | 'pr-open' | 'merged' | 'blocked';

export interface ClusterState {
  readonly id: string;
  readonly status: ClusterStatus;
  readonly branch: string;
  readonly base: string;
  readonly pr?: string;
  /** For a blocked cluster: why (shown by `explain-blocked`). */
  readonly detail?: string;
}

export interface RunState {
  readonly runId: string;
  readonly base: string;
  readonly clusters: readonly ClusterState[];
}

export interface ClusterInit {
  readonly id: string;
  readonly base: string;
}

export function initRunState(runId: string, base: string, clusters: readonly ClusterInit[]): RunState {
  return {
    runId,
    base,
    clusters: clusters.map((c) => ({ id: c.id, status: 'pending', branch: `cluster/${c.id}`, base: c.base })),
  };
}

export function serializeState(state: RunState): string {
  return JSON.stringify(state, null, 2);
}

export function deserializeState(json: string): RunState {
  return JSON.parse(json) as RunState;
}

export function markCluster(state: RunState, id: string, patch: Partial<ClusterState>): RunState {
  return { ...state, clusters: state.clusters.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function nextPending(state: RunState): ClusterState | undefined {
  return state.clusters.find((c) => c.status === 'pending');
}

export interface OpenPr {
  readonly cluster: string;
  readonly pr: string;
}

export function reconcile(state: RunState, openPrs: readonly OpenPr[]): RunState {
  const openByCluster = new Map(openPrs.map((p) => [p.cluster, p.pr]));
  return {
    ...state,
    clusters: state.clusters.map((c) => {
      if (c.status === 'merged' || c.status === 'blocked') return c; // terminal, idempotent
      const remotePr = openByCluster.get(c.id);
      if (remotePr !== undefined) return { ...c, status: 'pr-open', pr: remotePr };
      if (c.status === 'pr-open') return { ...c, status: 'merged' }; // PR gone from remote → merged since
      return c;
    }),
  };
}

const STATE_FILE = 'state.json';

/** Write the state atomically (temp + rename); a crash mid-write can't corrupt it. */
export function writeStateAtomic(dir: string, state: RunState): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${STATE_FILE}.${process.pid}.tmp`);
  writeFileSync(tmp, serializeState(state));
  renameSync(tmp, join(dir, STATE_FILE));
}

export function readState(dir: string): RunState | undefined {
  const file = join(dir, STATE_FILE);
  if (!existsSync(file)) return undefined;
  return deserializeState(readFileSync(file, 'utf8'));
}
