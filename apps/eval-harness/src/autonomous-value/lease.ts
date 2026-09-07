import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface LeaseRecord {
  readonly pid: number;
  readonly campaignId: string;
}

export interface CampaignLease {
  readonly path: string;
  readonly release: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value instanceof Object && !Array.isArray(value);
}

function ownerIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLease(path: string): LeaseRecord | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      isRecord(value)
      && typeof value['pid'] === 'number'
      && Number.isInteger(value['pid'])
      && value['pid'] > 0
      && typeof value['campaignId'] === 'string'
    ) {
      return { pid: value['pid'], campaignId: value['campaignId'] };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Acquire one process-owned campaign lease; dead or corrupt leases are recoverable. */
export function acquireCampaignLease(directory: string, campaignId: string): CampaignLease {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(campaignId)) {
    throw new Error('campaign id is invalid');
  }
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${campaignId}.lease`);
  const record: LeaseRecord = { pid: process.pid, campaignId };

  for (;;) {
    try {
      const descriptor = openSync(path, 'wx');
      try {
        writeFileSync(descriptor, JSON.stringify(record), 'utf8');
      } finally {
        closeSync(descriptor);
      }
      const release = (): void => {
        try {
          const current = readLease(path);
          if (current?.pid === record.pid && current.campaignId === record.campaignId) {
            unlinkSync(path);
          }
        } catch {
          // Cleanup is best effort; a later launch can reclaim a dead lease.
        }
      };
      return { path, release };
    } catch {
      const current = readLease(path);
      if (current !== undefined && ownerIsAlive(current.pid)) {
        throw new Error(`campaign '${campaignId}' is already running`);
      }
      if (!existsSync(path)) throw new Error(`campaign lease '${campaignId}' is unavailable`);
      unlinkSync(path);
    }
  }
}
