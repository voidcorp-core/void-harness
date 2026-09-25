import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, writeFreshnessCache } from './cache.js';
import { PRODUCT_IDENTITY } from '../identity.js';
import { freshnessNotice, freshnessRelay, resolveFreshness } from './notice.js';

const tempEnv = async (): Promise<{ XDG_CACHE_HOME: string }> => ({
  XDG_CACHE_HOME: await mkdtemp(join(tmpdir(), 'void-notice-')),
});

const serving = (latest: string): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify({ latest }), { status: 200 })) as unknown as typeof fetch;

const offline = (): typeof fetch =>
  vi.fn(async () => {
    throw new Error('ENETDOWN');
  }) as unknown as typeof fetch;

describe('resolveFreshness', () => {
  it('reads the registry when no cache exists, and remembers the answer', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.1.0');
    const first = await resolveFreshness({ installed: '0.17.0', env, now: 1_000, fetchImpl });
    expect(first).toMatchObject({ verdict: 'behind', latest: '2.1.0' });

    const second = await resolveFreshness({ installed: '0.17.0', env, now: 2_000, fetchImpl });
    expect(second).toMatchObject({ verdict: 'behind', latest: '2.1.0' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('goes back to the registry once the cached answer expires', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.2.0');
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 0 });
    const result = await resolveFreshness({ installed: '2.1.0', env, now: CACHE_TTL_MS + 1, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ verdict: 'behind', latest: '2.2.0' });
  });

  it('never touches the network when the caller forbids it', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.1.0');
    const result = await resolveFreshness({
      installed: '0.17.0',
      env,
      now: 1_000,
      fetchImpl,
      allowNetwork: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.verdict).toBe('unknown');
  });

  it('answers from cache alone when the network is forbidden but an entry is fresh', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('9.9.9');
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    const result = await resolveFreshness({
      installed: '0.17.0',
      env,
      now: 1_500,
      fetchImpl,
      allowNetwork: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ verdict: 'behind', latest: '2.1.0' });
  });

  it('degrades to unknown with the network reason when the registry is unreachable', async () => {
    const env = await tempEnv();
    const result = await resolveFreshness({ installed: '0.17.0', env, now: 1_000, fetchImpl: offline() });
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/network/i);
  });

  it('never reports up-to-date when the registry could not be read', async () => {
    const env = await tempEnv();
    const result = await resolveFreshness({ installed: '2.1.0', env, now: 1_000, fetchImpl: offline() });
    expect(result.verdict).not.toBe('up-to-date');
  });

  it('does not cache a failed lookup, so a transient outage is retried', async () => {
    const env = await tempEnv();
    await resolveFreshness({ installed: '2.1.0', env, now: 1_000, fetchImpl: offline() });
    const recovered = serving('2.2.0');
    const result = await resolveFreshness({ installed: '2.1.0', env, now: 1_100, fetchImpl: recovered });
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ verdict: 'behind' });
  });
});

describe('freshnessNotice', () => {
  it('names both versions and the exact command when an npm install is behind', () => {
    const notice = freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local');
    expect(notice).toContain('0.17.0');
    expect(notice).toContain('2.1.0');
    expect(notice).toContain('void-machine update');
  });

  it.each(['up-to-date', 'ahead', 'unknown'] as const)('stays silent on the %s verdict', (verdict) => {
    expect(freshnessNotice({ verdict, installed: '2.1.0', latest: '2.1.0' }, 'local')).toBeUndefined();
  });

  it('stays silent for a marketplace install, whose update path is not this command', () => {
    expect(
      freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'marketplace'),
    ).toBeUndefined();
  });

  it('stays silent when the install source is unknown rather than advising blindly', () => {
    expect(freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, undefined)).toBeUndefined();
  });

  it('is a single line, so a session banner never turns into a wall of text', () => {
    const notice = freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local') ?? '';
    expect(notice).not.toContain('\n');
  });

  // `update` acts on the directory it is typed in. A caller that measured an
  // install elsewhere (a linked worktree reading the main checkout) says where,
  // and the notice puts that in front of the command; without one it names nothing.
  it('puts the directory the caller names in front of the command', () => {
    const behind = { verdict: 'behind', installed: '0.17.0', latest: '2.1.0' } as const;
    expect(freshnessNotice(behind, 'local', 'in /srv/main: ')).toContain('Run in /srv/main: `void-machine update`');
    expect(freshnessNotice(behind, 'local')).toContain('Run `void-machine update`');
  });
});

// A SessionStart hook cannot write to the user: `additionalContext` is model-only,
// `systemMessage` is discarded for the event, and `terminalSequence` carries escape
// codes, not prose. So the only surface that reaches a person is the agent's own
// reply -- and this session proved the gap, receiving the upgrade line at startup
// and never passing it on. The relay wording is what closes it.
describe('freshnessRelay', () => {
  const behind = { verdict: 'behind', installed: '0.17.0', latest: '2.1.0' } as const;

  it('carries both versions and the exact command, like the terminal line does', () => {
    const relay = freshnessRelay(behind, 'local') ?? '';
    expect(relay).toContain('0.17.0');
    expect(relay).toContain('2.1.0');
    expect(relay).toContain('void-machine update');
  });

  it('asks the agent to offer the update near the first reply', () => {
    const relay = freshnessRelay(behind, 'local') ?? '';
    expect(relay).toMatch(/tell the user/i);
    expect(relay).toMatch(/first reply/i);
    expect(relay).toMatch(/offer to run.*`void-machine update`/i);
  });

  it('requires explicit human permission for project writes even in autonomous mode', () => {
    const relay = freshnessRelay(behind, 'local') ?? '';
    expect(relay).toMatch(/writes project files/i);
    expect(relay).toMatch(/wait for explicit human (?:permission|approval).*before (?:running|executing)/i);
    expect(relay).toMatch(/even (?:in autonomous mode|when operating autonomously)/i);
  });

  it('links public release notes so breaking changes can be reviewed before approval', () => {
    const relay = freshnessRelay(behind, 'local') ?? '';
    expect(relay).toContain(`${PRODUCT_IDENTITY.repositoryUrl}/releases`);
    expect(relay).toMatch(/breaking changes/i);
  });

  it('continues the task without updating or repeating the offer after refusal or silence', () => {
    const relay = freshnessRelay(behind, 'local') ?? '';
    expect(relay).toMatch(/once/i);
    expect(relay).toMatch(/declines|refuses/i);
    expect(relay).toMatch(/does not (?:reply|answer)|silence/i);
    expect(relay).toMatch(/continue (?:the|their) task without updating/i);
    expect(relay).toMatch(/do not (?:repeat|offer again).*session/i);
  });

  it('reads differently from the terminal line, which needs no relaying', () => {
    // `status` and `doctor` print straight to a person. Handing them an
    // instruction addressed to an agent would be nonsense on their surface.
    expect(freshnessRelay(behind, 'local')).not.toBe(freshnessNotice(behind, 'local'));
  });

  it.each(['up-to-date', 'ahead', 'unknown'] as const)('stays silent on the %s verdict', (verdict) => {
    expect(freshnessRelay({ verdict, installed: '2.1.0', latest: '2.1.0' }, 'local')).toBeUndefined();
  });

  it.each(['marketplace', undefined] as const)('stays silent for the %s source', (source) => {
    // Same rule as the notice: advising `void-machine update` to someone whose
    // install this command cannot update is confidently wrong.
    expect(freshnessRelay(behind, source)).toBeUndefined();
  });
});
