import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestJudgment, renderJudgmentComment } from './judgment-comment.js';

// A judgment is posted as a pull request comment so that a restart finds it on
// GitHub rather than in a session that is gone. The block is delimited by two
// HTML comments, invisible once rendered, around a fenced JSON value; it is
// admitted when it is written and admitted again when the kernel reads it.

const HEAD = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
const verdict = { headSha: HEAD, round: 1, blocking: [], advisory: [] };
const conflict = { headSha: HEAD, class: 'mechanical', reason: 'Both sides appended to one list.' };

/** Real comment bodies of this repository, from a `gh pr view --json comments` capture. */
const realBodies = (): string[] =>
  (
    JSON.parse(
      readFileSync(new URL('./__fixtures__/gh/pr-view-comments.json', import.meta.url), 'utf8'),
    ) as { comments: { body: string }[] }
  ).comments.map((comment) => comment.body);

const block = (kind: string, json: string): string =>
  `Reviewed.\n\n<!-- void-autopilot:${kind} -->\n\`\`\`json\n${json}\n\`\`\`\n<!-- /void-autopilot:${kind} -->\n`;

describe('renderJudgmentComment', () => {
  it('renders an admitted judgment as the block the kernel reads back', () => {
    const body = renderJudgmentComment('review-verdict', verdict);
    expect(body).toContain('<!-- void-autopilot:review-verdict -->');
    expect(body).toContain('<!-- /void-autopilot:review-verdict -->');
    expect(latestJudgment([body], 'review-verdict')).toEqual(verdict);
  });

  it('refuses to render a judgment its kind does not admit', () => {
    expect(() => renderJudgmentComment('review-verdict', { round: 1, blocking: [], advisory: [] })).toThrow(
      /headSha/,
    );
    expect(() => renderJudgmentComment('conflict-class', { ...conflict, class: 'trivial' })).toThrow(/class/);
  });
});

describe('latestJudgment', () => {
  it('finds nothing in comments that carry no block', () => {
    expect(latestJudgment(realBodies(), 'review-verdict')).toBeUndefined();
  });

  it('returns the last block of the kind asked, among other comments and kinds', () => {
    const older = { ...verdict, round: 1 };
    const newer = { ...verdict, round: 2 };
    const bodies = [
      ...realBodies(),
      block('review-verdict', JSON.stringify(older)),
      block('conflict-class', JSON.stringify(conflict)),
      block('review-verdict', JSON.stringify(newer)),
    ];
    expect(latestJudgment(bodies, 'review-verdict')).toEqual(newer);
    expect(latestJudgment(bodies, 'conflict-class')).toEqual(conflict);
  });

  it('hands a block that is not JSON on as text, for the admission to refuse', () => {
    expect(latestJudgment([block('review-verdict', '{ round: 1')], 'review-verdict')).toBe('{ round: 1');
  });
});
