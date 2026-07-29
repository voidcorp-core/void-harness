import { describe, expect, it } from 'vitest';
import { PR_BODY_MAX_BYTES, renderPullRequestBody, type PrBodyInput } from './pr-body.js';

const BASE = '00000000000000000000000000000000000000a0';
const H1 = '00000000000000000000000000000000000000a1';
const H2 = '00000000000000000000000000000000000000a2';
const INTEGRATION = '00000000000000000000000000000000000000ff';

function input(over: Partial<PrBodyInput> = {}): PrBodyInput {
  return {
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: BASE },
    integrationSha: INTEGRATION,
    included: [
      {
        ticketId: 'DEV-1',
        title: 'Refuse a stale proof',
        url: 'https://linear.app/voidcorp/issue/DEV-1',
        range: { baseSha: BASE, headSha: H1, commits: [H1] },
      },
      {
        ticketId: 'DEV-2',
        title: 'Bound the verify output',
        url: 'https://linear.app/voidcorp/issue/DEV-2',
        range: { baseSha: BASE, headSha: H2, commits: [H2] },
      },
    ],
    excluded: [],
    decisions: [],
    verification: [{ name: 'pnpm test', passed: true }],
    ci: { total: 2, honest: true, detail: '1 pushes x 2 run(s) each' },
    blockers: [],
    ...over,
  };
}

describe('renderPullRequestBody', () => {
  it('keeps per-ticket provenance: every included ticket with its exact commit range', () => {
    const body = renderPullRequestBody(input());

    expect(body).toContain('DEV-1');
    expect(body).toContain('Refuse a stale proof');
    expect(body).toContain(`${BASE.slice(0, 12)}..${H1.slice(0, 12)}`);
    expect(body).toContain(`${BASE.slice(0, 12)}..${H2.slice(0, 12)}`);
  });

  it('names the integration commit the local suite was proven against', () => {
    expect(renderPullRequestBody(input())).toContain(INTEGRATION.slice(0, 12));
  });

  it('lists an excluded ticket with its cause and its resume action, never as included', () => {
    const body = renderPullRequestBody(
      input({
        included: [input().included[0]!],
        excluded: [
          {
            ticketId: 'DEV-3',
            reason: 'unverified-range',
            detail: 'the range carries a commit the worker never declared',
            resume: 'rerun DEV-3 from a clean worktree',
          },
        ],
      }),
    );

    const excludedAt = body.indexOf('DEV-3');
    const includedSection = body.slice(0, body.indexOf('## Not in this pull request'));

    expect(excludedAt).toBeGreaterThan(-1);
    expect(includedSection).not.toContain('DEV-3');
    expect(body).toContain('the range carries a commit the worker never declared');
    expect(body).toContain('rerun DEV-3 from a clean worktree');
  });

  it('carries no keyword that would let a merge close a ticket automatically', () => {
    const body = renderPullRequestBody(
      input({ excluded: [{ ticketId: 'DEV-3', reason: 'not-green', detail: 'suite red', resume: 'rerun' }] }),
    );

    expect(body).not.toMatch(/\b(closes|fixes|resolves)\b/i);
  });

  it('states the CI budget as counted, and says so when it cannot be counted', () => {
    expect(renderPullRequestBody(input())).toContain('1 pushes x 2 run(s) each');

    const undecidable = renderPullRequestBody(
      input({ ci: { total: null, honest: false, detail: 'the trigger budget is undecidable for release.yml' } }),
    );
    expect(undecidable).toContain('undecidable');
    expect(undecidable).not.toMatch(/^\|\s*Remote runs\s*\|\s*0\s*\|/m);
  });

  it('records the conflicts the reconciler resolved and why', () => {
    const body = renderPullRequestBody(
      input({
        decisions: [
          {
            subject: 'docs/CHEATSHEET.md',
            choice: 'regenerated from the catalogue after both ranges appended',
            because: 'the file is generated; a hand-merged version diverges from its source',
          },
        ],
      }),
    );

    expect(body).toContain('docs/CHEATSHEET.md');
    expect(body).toContain('the file is generated');
  });

  it('says the merge is a human action', () => {
    expect(renderPullRequestBody(input())).toMatch(/human/i);
  });

  it('surfaces blockers instead of leaving them to the reader', () => {
    const body = renderPullRequestBody(input({ blockers: ['`enforce` failed for a reason this diff does not explain'] }));

    expect(body).toContain('## Blockers');
    expect(body).toContain('does not explain');
  });

  it('omits empty sections rather than printing headers with nothing under them', () => {
    const body = renderPullRequestBody(input());

    expect(body).not.toContain('## Not in this pull request');
    expect(body).not.toContain('## Blockers');
    expect(body).not.toContain('## Reconciliation decisions');
  });

  it('renders the same body twice for the same input', () => {
    expect(renderPullRequestBody(input())).toBe(renderPullRequestBody(input()));
  });

  it('stays within the size a pull request body accepts, and says what it dropped', () => {
    const body = renderPullRequestBody(
      input({
        included: Array.from({ length: 400 }, (_, index) => ({
          ticketId: `DEV-${index}`,
          title: 'x'.repeat(300),
          url: `https://linear.app/voidcorp/issue/DEV-${index}`,
          range: { baseSha: BASE, headSha: H1, commits: [H1] },
        })),
      }),
    );

    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(PR_BODY_MAX_BYTES);
    expect(body).toMatch(/truncated/i);
  });

  it('reports a failed local verification rather than hiding it', () => {
    const body = renderPullRequestBody(
      input({ verification: [{ name: 'pnpm test', passed: false }] }),
    );

    expect(body).toMatch(/pnpm test.*(failed|red)/i);
  });
});
