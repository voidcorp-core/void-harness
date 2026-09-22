import { describe, expect, it } from 'vitest';
import { reviewVerdictWrite } from './review-verdict-write.js';

// The review verdict reaches a pull request through `void-harness autopilot
// verdict` alone. By hand, an agent can post the status and the comment in any
// order, on any head, with nothing checking what it approves.

const MARKER = '<!-- void-autopilot:review-verdict -->';
const CONTEXT = 'void/independent-review';

/** A reader over a fixed set of files, standing in for the checkout. */
function files(contents: Record<string, string> = {}) {
  return (path: string): string | undefined => contents[path];
}

describe('reviewVerdictWrite', () => {
  it.each([
    ['a status posted with gh api', `gh api repos/{owner}/{repo}/statuses/abc123 -f state=success -f context=${CONTEXT}`],
    ['a status with the method spelled out', `gh api -X POST repos/o/r/statuses/abc123 -f "context=${CONTEXT}"`],
    ['a status posted with curl', `curl -X POST https://api.github.com/repos/o/r/statuses/abc -d '{"state":"success","context":"${CONTEXT}"}'`],
    ['a comment carrying the verdict block', `gh pr comment 12 --body "${MARKER} {}"`],
    ['an issue comment on the pull request', `gh issue comment 12 --body '${MARKER}'`],
    ['a heredoc piped into a comment', `gh pr comment 12 --body-file - <<'EOF'\n${MARKER}\n{}\nEOF`],
    ['a REST comment', `gh api repos/o/r/issues/12/comments -f body='${MARKER}'`],
    ['a GraphQL comment', `gh api graphql -f query='mutation { addComment(input: {subjectId: "x", body: "${MARKER}"}) { clientMutationId } }'`],
    ['a curl comment', `curl -d '{"body":"${MARKER}"}' https://api.github.com/repos/o/r/issues/12/comments`],
  ])('blocks %s', (_name, command) => {
    const verdict = reviewVerdictWrite(command, files());
    expect(verdict.allow).toBe(false);
    expect(verdict.message).toContain('autopilot verdict');
  });

  it('blocks a verdict carried in a file the command posts', () => {
    const read = files({ 'verdict.md': `${MARKER}\n{}\n`, 'status.json': `{"context":"${CONTEXT}"}` });
    for (const command of [
      'gh pr comment 12 --body-file verdict.md',
      'gh pr comment 12 -F verdict.md',
      'gh pr comment 12 --body-file - < verdict.md',
      'gh api repos/o/r/issues/12/comments -F body=@verdict.md',
      'curl --data @status.json https://api.github.com/repos/o/r/statuses/abc',
      'gh api repos/o/r/statuses/abc --input status.json',
    ]) {
      expect(reviewVerdictWrite(command, read).allow, command).toBe(false);
    }
  });

  it.each([
    ['reading the statuses', `gh api repos/o/r/commits/abc/statuses --jq '.[] | select(.context=="${CONTEXT}")'`],
    ['another status context', 'gh api repos/o/r/statuses/abc -f state=success -f context=ci/build'],
    ['the conflict class, which workers post', 'gh pr comment 12 --body "<!-- void-autopilot:conflict-class -->"'],
    ['searching the code for the marker', `grep -rn "${MARKER}" packages`],
    ['the one command that writes the verdict', 'void-harness autopilot verdict --pr 12 < verdict.json'],
    ['an ordinary comment', 'gh pr comment 12 --body-file notes.md'],
  ])('allows %s', (_name, command) => {
    const read = files({ 'verdict.json': '{"headSha":"a","round":1}', 'notes.md': 'Looks fine.' });
    expect(reviewVerdictWrite(command, read).allow).toBe(true);
  });
});
