import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireCampaignLease } from './lease.js';

describe('campaign lease', () => {
  it('allows one owner and refuses a live duplicate', () => {
    const directory = mkdtempSync(join(tmpdir(), 'void-campaign-lease-'));
    try {
      const first = acquireCampaignLease(directory, 'campaign-a');
      expect(() => acquireCampaignLease(directory, 'campaign-a')).toThrow(/already running/);
      expect(JSON.parse(readFileSync(join(directory, 'campaign-a.lease'), 'utf8')))
        .toMatchObject({ pid: process.pid, campaignId: 'campaign-a' });
      first.release();
      expect(() => acquireCampaignLease(directory, 'campaign-a')).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reclaims a dead owner lease but does not release another owner', () => {
    const directory = mkdtempSync(join(tmpdir(), 'void-campaign-lease-'));
    const path = join(directory, 'campaign-b.lease');
    try {
      writeFileSync(path, JSON.stringify({ pid: 999_999_999, campaignId: 'campaign-b' }));
      const lease = acquireCampaignLease(directory, 'campaign-b');
      writeFileSync(path, JSON.stringify({ pid: process.pid, campaignId: 'other-owner' }));
      lease.release();
      expect(readFileSync(path, 'utf8')).toContain('other-owner');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
