import { describe, expect, it } from 'vitest';
import { latestJudgment } from '../../packages/cli/src/lib/autopilot/judgment-comment.js';
import { admitReviewVerdict } from '../../packages/cli/src/lib/autopilot/judgments.js';
import {
  admitVerdict,
  conclusionOf,
  decideStart,
  previousBlocking,
  renderVerdictComment,
  roundOf,
} from '../../scripts/independent-review-run.mjs';

const repository = 'voidcorp-core/void-harness';
const head = 'a'.repeat(40);

function event(pull: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pull_request: {
      number: 12,
      draft: false,
      head: { sha: head, ref: 'work/dev-1', repo: { full_name: repository } },
      base: { ref: 'develop' },
      user: { login: 'folpe', id: 1, type: 'User' },
      ...pull,
    },
  };
}

const blocking = { location: 'src/a.ts:3', scenario: 'A pushed head merges unread.', correction: 'Read it.' };

describe('which head the review job reviews', () => {
  it('reviews a ready pull request from this repository', () => {
    expect(decideStart({ event: event(), repository })).toEqual({ number: 12, headSha: head, kind: 'review' });
  });

  // A draft gets no check at all, so it stays unmergeable until marked ready.
  it('leaves a draft without a check, and a fork to a person', () => {
    expect(decideStart({ event: event({ draft: true }), repository }).kind).toBe('draft');
    const fork = event({ head: { sha: head, ref: 'x', repo: { full_name: 'someone/void-harness' } } });
    expect(decideStart({ event: fork, repository }).kind).toBe('fork');
  });

  // The exemption rests on the commits, not on the author: a lookalike is reviewed.
  it('exempts the release back-merge only when its commits prove it', () => {
    const backMerge = event({
      head: { sha: head, ref: 'chore/back-merge-main', repo: { full_name: repository } },
      user: { login: 'voidcorp-release[bot]', id: 311374965, type: 'Bot' },
    });
    const proven = (args: readonly string[]) => (args[0] === 'merge-base' ? '' : '');
    expect(decideStart({ event: backMerge, repository, git: proven }).kind).toBe('exempt');
    const unreadable = (): string => {
      throw new Error('fatal: bad object');
    };
    expect(decideStart({ event: backMerge, repository, git: unreadable }).kind).toBe('review');
    expect(decideStart({ event: backMerge, repository }).kind).toBe('review');
  });

  it('refuses an event with no pull request head', () => {
    expect(() => decideStart({ event: {}, repository })).toThrow(/no pull request/);
  });
});

describe('what the reviewer returned', () => {
  it('binds the verdict to the head and round the job read, not to what the model says', () => {
    const admission = admitVerdict(JSON.stringify({ blocking: [], advisory: [] }), { headSha: head, round: 1 });
    expect(admission).toEqual({ ok: true, verdict: { headSha: head, round: 1, blocking: [], advisory: [] } });
    const claimed = admitVerdict(JSON.stringify({ headSha: 'b'.repeat(40), blocking: [], advisory: [] }), {
      headSha: head,
      round: 1,
    });
    expect(claimed.ok).toBe(false);
  });

  it('refuses every verdict it cannot admit, so none is read as approval', () => {
    for (const output of [
      undefined,
      '',
      'not json',
      '[]',
      JSON.stringify({ blocking: [] }),
      JSON.stringify({ blocking: [{ ...blocking, location: 'src/a.ts' }], advisory: [] }),
      JSON.stringify({ blocking: [{ ...blocking, scenario: ' ' }], advisory: [] }),
      JSON.stringify({ blocking: [], advisory: [{ note: 'x'.repeat(501) }] }),
      JSON.stringify({ blocking: Array.from({ length: 33 }, () => blocking), advisory: [] }),
    ]) {
      const admission = admitVerdict(output, { headSha: head, round: 1 });
      expect(admission.ok, String(output)).toBe(false);
      expect(conclusionOf(admission).conclusion).toBe('failure');
    }
  });

  it('passes the check only on a verdict with no blocking finding', () => {
    const clean = admitVerdict(JSON.stringify({ blocking: [], advisory: [{ note: 'Consider it.' }] }), {
      headSha: head,
      round: 1,
    });
    expect(conclusionOf(clean).conclusion).toBe('success');
    const refused = admitVerdict(JSON.stringify({ blocking: [blocking], advisory: [] }), { headSha: head, round: 1 });
    expect(conclusionOf(refused)).toMatchObject({ conclusion: 'failure', title: '1 blocking finding(s)' });
  });

  // The contract with the loop: what this script posts, the kernel reads and admits.
  it('posts the verdict in the block the loop admits', () => {
    const admission = admitVerdict(JSON.stringify({ blocking: [blocking], advisory: [] }), { headSha: head, round: 2 });
    if (!admission.ok) throw new Error(admission.reason);
    const read = latestJudgment([renderVerdictComment(admission.verdict)], 'review-verdict');
    expect(admitReviewVerdict(read)).toEqual({ ok: true, value: admission.verdict });
  });

  it('counts a second round once another head of the pull request was blocked', () => {
    const earlier = renderVerdictComment({ headSha: 'b'.repeat(40), round: 1, blocking: [blocking], advisory: [] });
    const clean = renderVerdictComment({ headSha: 'c'.repeat(40), round: 1, blocking: [], advisory: [] });
    expect(roundOf([], head)).toBe(1);
    expect(roundOf([clean], head)).toBe(1);
    expect(roundOf([earlier], head)).toBe(2);
  });

  // Round 2 reads only what round 1 blocked on, on the latest blocked head.
  it('hands round 2 the blocking findings of the latest other blocked head', () => {
    const first = renderVerdictComment({ headSha: 'b'.repeat(40), round: 1, blocking: [blocking], advisory: [] });
    const second = { ...blocking, location: 'src/b.ts:9' };
    const later = renderVerdictComment({ headSha: 'c'.repeat(40), round: 2, blocking: [second], advisory: [] });
    expect(previousBlocking([], head)).toBeUndefined();
    expect(previousBlocking([first, later], head)).toEqual([second]);
    expect(previousBlocking([later], 'c'.repeat(40))).toBeUndefined();
  });
});
