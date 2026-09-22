import type { RuleVerdict } from '../enforcement/types.js';
import { allow, block } from './verdict.js';

// The review verdict has one writer, `void-harness autopilot verdict`: it binds
// the verdict to the head the pull request has now and writes the comment and
// the `void/independent-review` status together. This rule refuses the same
// writes typed by hand. It is a tripwire against a mistaken or injected command,
// not a boundary: an agent holding the credentials can still reach the API from
// code this string match never sees.

const STATUS_CONTEXT = 'void/independent-review';
const VERDICT_MARKER = 'void-autopilot:review-verdict';

const API_CLIENT = /\b(?:gh\s+api|curl)\b/;
const STATUS_ENDPOINT = /\/statuses\/[^\s/'"]/;
// Without one of these, `gh api` sends a GET and curl sends nothing.
const WRITES = /(?:^|\s)(?:-[fFdX]|--(?:field|raw-field|input|method|request|data[a-z-]*|json))(?:[\s=]|$)/;
const COMMENT_WRITE = [
  /\bgh\s+(?:pr|issue)\s+comment\b/,
  /\bgh\s+api\b[^\n]*\/comments\b/,
  /\bgh\s+api\s+graphql\b[^\n]*\baddComment\b/,
  /\bcurl\b[^\n]*\/comments\b/,
];

/** Flags whose next word names a file the command sends. */
const FILE_FLAGS = new Set(['--body-file', '-F', '--input', '<', 'cat']);

function unquote(text: string): string {
  return text.replaceAll('"', '').replaceAll("'", '');
}

/** The files a command sends: flag arguments, `@path` and `field=@path` references. */
function sentFiles(command: string): string[] {
  const words = unquote(command).split(/\s+/).filter(Boolean);
  return words.flatMap((word, index) => {
    const previous = words[index - 1];
    if (previous !== undefined && FILE_FLAGS.has(previous) && !word.includes('=')) return [word];
    const reference = /(?:^|=)@(.+)$/.exec(word)?.[1];
    return reference === undefined ? [] : [reference];
  }).filter((path) => path !== '-');
}

function carries(command: string, needle: string, read: (path: string) => string | undefined) {
  if (unquote(command).includes(needle)) return true;
  return sentFiles(command).some((path) => read(path)?.includes(needle) === true);
}

function violation(command: string, read: (path: string) => string | undefined) {
  const text = unquote(command);
  const statusWrite = API_CLIENT.test(text) && STATUS_ENDPOINT.test(text) && WRITES.test(text);
  if (statusWrite && carries(command, STATUS_CONTEXT, read)) {
    return `a ${STATUS_CONTEXT} status written by hand`;
  }
  const commentWrite = COMMENT_WRITE.some((pattern) => pattern.test(text));
  if (commentWrite && carries(command, VERDICT_MARKER, read)) {
    return 'a review verdict comment posted by hand';
  }
  return undefined;
}

/**
 * Refuses a shell command that writes the review verdict outside its one
 * command. `read` returns a file's text, or undefined when it cannot.
 */
export function reviewVerdictWrite(
  command: string,
  read: (path: string) => string | undefined,
): RuleVerdict {
  const evidence = violation(command, read);
  return evidence === undefined
    ? allow()
    : block(
        'REVIEW_VERDICT_WRITE',
        'refusing to write the review verdict by hand; pipe it into'
          + ' `void-harness autopilot verdict --pr <number>`, which binds it to the head'
          + ' and writes the comment and the status together',
        [evidence],
      );
}
