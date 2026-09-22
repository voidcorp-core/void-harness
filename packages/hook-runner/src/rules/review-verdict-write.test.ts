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

  // Every spelling below reached the API unrefused before the arguments were
  // normalized: glued short flags, `--flag=value`, and payloads the hook cannot
  // read before the command runs.
  it.each([
    ['glued raw fields', `gh api repos/o/r/statuses/abc -fstate=success -fcontext=${CONTEXT}`],
    ['glued typed fields', `gh api repos/o/r/statuses/abc -Fstate=success -Fcontext=${CONTEXT}`],
    ['long fields with an equals sign', `gh api repos/o/r/statuses/abc --field=state=success --raw-field=context=${CONTEXT}`],
    ['a glued method', `gh api -XPOST repos/o/r/statuses/abc -f context=${CONTEXT}`],
    ['the method spelled with an equals sign', `gh api --method=POST repos/o/r/statuses/abc -f context=${CONTEXT}`],
    ['boolean flags glued before a field', `gh api repos/o/r/statuses/abc -if context=${CONTEXT}`],
    ['a context split by quotes', `gh api repos/o/r/statuses/abc -f context=void/indep"endent"-review`],
    ['a context escaped by backslashes', `gh api repos/o/r/statuses/abc -f context=void\\/independent\\-review`],
    ['a glued body', `gh pr comment 12 -b'${MARKER}'`],
    ['a body with an equals sign', `gh pr comment 12 --body='${MARKER}'`],
    ['a status inside sh -c', `sh -c "gh api repos/o/r/statuses/abc -fcontext=${CONTEXT}"`],
    ['a status inside eval', `eval gh api repos/o/r/statuses/abc -f context=${CONTEXT}`],
    ['a status behind env', `env GH_HOST=github.com gh api repos/o/r/statuses/abc -f context=${CONTEXT}`],
    ['a status by a full path to gh', `/opt/homebrew/bin/gh api repos/o/r/statuses/abc -f context=${CONTEXT}`],
  ])('blocks %s', (_name, command) => {
    expect(reviewVerdictWrite(command, files()).allow).toBe(false);
  });

  it('blocks a verdict in a file named with an equals sign or glued to its flag', () => {
    const read = files({
      's.json': `{"state":"success","context":"${CONTEXT}"}`,
      'escaped.json': '{"context":"void\\u002findependent-review"}',
      'v.md': `${MARKER}\n{}\n`,
      'm.graphql': `mutation { addComment(input: {subjectId: "x", body: "${MARKER}"}) { clientMutationId } }`,
    });
    for (const command of [
      'gh api repos/o/r/statuses/abc --input=s.json',
      'gh api repos/o/r/statuses/abc --input escaped.json',
      'gh pr comment 12 --body-file=v.md',
      'gh pr comment 12 -Fv.md',
      'gh api repos/o/r/issues/12/comments -Fbody=@v.md',
      'curl -d@s.json https://api.github.com/repos/o/r/statuses/abc',
      'curl --data-binary=@s.json https://api.github.com/repos/o/r/statuses/abc',
      'gh api graphql -F query=@m.graphql',
    ]) {
      expect(reviewVerdictWrite(command, read).allow, command).toBe(false);
    }
  });

  it.each([
    ['a context held in a variable', `C=${CONTEXT}; gh api repos/o/r/statuses/abc -f state=success -f context=$C`],
    ['a context from a command substitution', 'gh api repos/o/r/statuses/abc -f context="$(cat ctx.txt)"'],
    ['a context in backticks', 'gh api repos/o/r/statuses/abc -f context=`cat ctx.txt`'],
    ['a whole field from a variable', 'gh api repos/o/r/statuses/abc -f state=success -f "$FIELD"'],
    ['an endpoint and a context from variables', 'gh api "$ENDPOINT" -f context="$CTX"'],
    ['a method from a variable', 'gh api -X "$M" repos/o/r/statuses/abc --input "$FILE"'],
    ['a status payload in a file that cannot be read', 'gh api repos/o/r/statuses/abc --input missing.json'],
    ['a status payload piped in', 'jq -n "$P" | gh api repos/o/r/statuses/abc --input -'],
    ['a curl payload in a variable', 'curl -d "$PAYLOAD" https://api.github.com/repos/o/r/statuses/abc'],
    ['a curl to a URL in a variable, its payload spliced', `curl -d '{"state":"success","context":"'"$CTX"'"}' "$URL"`],
    ['a comment body in a variable', 'gh pr comment 12 --body "$BODY"'],
    ['a comment body from a command substitution', 'gh pr comment 12 -b "$(cat v.md)"'],
    ['a comment body file that cannot be read', 'gh pr comment 12 --body-file missing.md'],
    ['a comment body piped in', 'cat v.md | gh pr comment 12 --body-file -'],
    ['a REST comment body in a variable', 'gh api repos/o/r/issues/12/comments -f body="$BODY"'],
    ['a GraphQL mutation whose body is a variable', `gh api graphql -F body="$(cat v.md)" -f query='mutation($body: String!) { addComment(input: {subjectId: "x", body: $body}) { clientMutationId } }'`],
    ['a GraphQL query held in a variable', 'gh api graphql -f query="$Q"'],
    ['a shell string built from a variable', 'bash -c "$CMD"'],
    ['xargs feeding gh a payload', 'echo body | xargs gh pr comment 12 --body'],
  ])('refuses %s, which it cannot read before it runs', (_name, command) => {
    const verdict = reviewVerdictWrite(command, files({ 'v.md': 'plain' }));
    expect(verdict.allow).toBe(false);
    expect(verdict.message).toContain('autopilot verdict');
  });

  it.each([
    ['reading the statuses', `gh api repos/o/r/commits/abc/statuses --jq '.[] | select(.context=="${CONTEXT}")'`],
    ['another status context', 'gh api repos/o/r/statuses/abc -f state=success -f context=ci/build'],
    ['the conflict class, which workers post', 'gh pr comment 12 --body "<!-- void-autopilot:conflict-class -->"'],
    ['searching the code for the marker', `grep -rn "${MARKER}" packages`],
    ['the one command that writes the verdict', 'void-harness autopilot verdict --pr 12 < verdict.json'],
    ['an ordinary comment', 'gh pr comment 12 --body-file notes.md'],
    ['another status context with glued flags', 'gh api repos/o/r/statuses/abc -fstate=success -fcontext=ci/build'],
    ['another context whose description is a variable', 'gh api repos/o/r/statuses/abc -f context=ci/build -f description="$D"'],
    ['a write elsewhere whose endpoint and values are variables', 'gh api "repos/$R/labels" -f name="$NAME"'],
    ['a GraphQL read whose variables are variables', `gh api graphql -F number="$N" -f query='query($number: Int!) { repository(owner: "o", name: "r") { pullRequest(number: $number) { title } } }'`],
    ['a read of the statuses with an explicit GET', 'gh api -X GET repos/o/r/commits/abc/statuses -f per_page=100'],
    ['a comment whose body is a heredoc without the marker', "gh pr comment 12 --body-file - <<'EOF'\nLooks fine.\nEOF"],
    ['a comment whose body is a variable in a script that never posts', 'echo "$BODY"'],
  ])('allows %s', (_name, command) => {
    const read = files({ 'verdict.json': '{"headSha":"a","round":1}', 'notes.md': 'Looks fine.' });
    expect(reviewVerdictWrite(command, read).allow).toBe(true);
  });
});
