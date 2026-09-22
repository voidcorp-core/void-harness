import {
  type ShellCommand,
  shellCommands,
  type ShellStdin,
  type ShellWord,
} from '../enforcement/shell-words.js';
import type { RuleVerdict } from '../enforcement/types.js';
import { allow, block } from './verdict.js';

// The review verdict has one writer, `void-harness autopilot verdict`: it binds
// the verdict to the head the pull request has now and writes the comment and
// the `void/independent-review` status together. This rule refuses the same
// writes typed by hand, and refuses a write it cannot read before it runs: a
// status whose context, or a comment whose body, comes from a variable, a
// command substitution, a pipe or a file it cannot open.
//
// It is a guard against a mistaken or injected command, not a boundary: an
// agent holding the credentials can still reach the API from a program this
// rule never parses (a script, another HTTP client). A command whose program
// name is itself a variable is read only inside `sh -c` and `eval`, where
// hiding the program is the point; at top level (`"$PYTHON" x.py`) it is too
// common to refuse.

const STATUS_CONTEXT = 'void/independent-review';
const VERDICT_MARKER = 'void-autopilot:review-verdict';
const STATUS_WHAT = `a ${STATUS_CONTEXT} status written by hand`;
const COMMENT_WHAT = 'a review verdict comment posted by hand';

type Read = (path: string) => string | undefined;
type Finding = { readonly kind: 'forged' | 'unknown'; readonly evidence: string };
type Target = 'status' | 'comment' | 'graphql';
/** A payload as far as it can be read: its text, or why it cannot be. */
type Content = { readonly text: string } | { readonly unknown: string };

interface Option {
  readonly name: string;
  readonly value?: ShellWord;
}

interface OptionSpec {
  readonly long: ReadonlySet<string>;
  readonly short: ReadonlySet<string>;
}

interface Field {
  /** Undefined when the key itself is decided at run time. */
  readonly key: string | undefined;
  readonly value: Content;
}

const GH_API: OptionSpec = {
  long: new Set(['field', 'raw-field', 'input', 'method', 'header', 'jq', 'template',
    'preview', 'hostname', 'cache']),
  short: new Set(['f', 'F', 'X', 'H', 'q', 't', 'p']),
};
const GH_COMMENT: OptionSpec = {
  long: new Set(['body', 'body-file', 'repo']),
  short: new Set(['b', 'F', 'R']),
};
const CURL: OptionSpec = {
  long: new Set(['data', 'data-raw', 'data-binary', 'data-ascii', 'data-urlencode', 'json',
    'form', 'form-string', 'request', 'header', 'output', 'user', 'upload-file', 'url',
    'cookie', 'cookie-jar', 'user-agent', 'referer', 'config', 'write-out', 'proxy',
    'max-time', 'connect-timeout', 'retry', 'output-dir', 'variable']),
  short: new Set(['d', 'F', 'X', 'H', 'o', 'u', 'T', 'b', 'c', 'A', 'e', 'K', 'w', 'x', 'm',
    'r', 'C', 'U', 'Y', 'y', 'z', 'E']),
};
const CURL_PAYLOAD = new Set(['d', 'data', 'data-raw', 'data-binary', 'data-ascii',
  'data-urlencode', 'json', 'F', 'form', 'form-string', 'T', 'upload-file']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'nohup', 'time', 'sudo', 'builtin', 'nice']);
const ALL_TARGETS: readonly Target[] = ['status', 'comment', 'graphql'];
const NESTING_MAX = 4;

const unknown = (reason: string): Content => ({ unknown: reason });
const isDynamic = (text: string): boolean => /[$`]/.test(text);
const decoded = (hex: string): string => String.fromCharCode(Number.parseInt(hex, 16));

/** What a payload says once its encodings are undone: JSON, URL and shell escapes. */
function normalized(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_all, hex: string) => decoded(hex))
    .replace(/%([0-9a-fA-F]{2})/g, (_all, hex: string) => decoded(hex))
    .replaceAll('\\', '')
    .replaceAll('"', '')
    .replaceAll("'", '');
}

/** Options and positional words, glued short flags and `--flag=value` split apart. */
function parseOptions(words: readonly ShellWord[], spec: OptionSpec) {
  const options: Option[] = [];
  const positionals: ShellWord[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as ShellWord;
    const { text } = word;
    if (text === '--') {
      positionals.push(...words.slice(index + 1));
      break;
    }
    if (text.startsWith('--')) {
      const equals = text.indexOf('=');
      const name = equals === -1 ? text.slice(2) : text.slice(2, equals);
      if (equals !== -1) {
        options.push({ name, value: { text: text.slice(equals + 1), dynamic: word.dynamic } });
      } else if (spec.long.has(name)) {
        index += 1;
        options.push(withValue(name, words[index]));
      } else options.push({ name });
    } else if (text.startsWith('-') && text.length > 1) {
      index = shortOptions(words, index, spec, options);
    } else positionals.push(word);
  }
  return { options, positionals };
}

const withValue = (name: string, value: ShellWord | undefined): Option =>
  value === undefined ? { name } : { name, value };

/** `-abc`: boolean letters until one that takes a value, glued or in the next word. */
function shortOptions(
  words: readonly ShellWord[],
  index: number,
  spec: OptionSpec,
  options: Option[],
): number {
  const word = words[index] as ShellWord;
  for (let at = 1; at < word.text.length; at += 1) {
    const name = word.text[at] as string;
    if (!spec.short.has(name)) {
      options.push({ name });
      continue;
    }
    const rest = word.text.slice(at + 1);
    if (rest !== '') {
      options.push({ name, value: { text: rest, dynamic: word.dynamic } });
      return index;
    }
    options.push(withValue(name, words[index + 1]));
    return index + 1;
  }
  return index;
}

function stdinContent(stdin: ShellStdin, read: Read): Content {
  if (stdin.kind === 'text') {
    return stdin.word.dynamic ? unknown('input built at run time') : { text: stdin.word.text };
  }
  if (stdin.kind === 'file') return fileContent(stdin.word, stdin, read);
  return unknown(stdin.kind === 'pipe' ? 'input piped from another command' : 'no input given');
}

function fileContent(path: ShellWord, stdin: ShellStdin, read: Read): Content {
  if (path.text === '-') return stdinContent(stdin, read);
  if (path.dynamic && isDynamic(path.text)) return unknown(`a file named at run time (${path.text})`);
  const text = read(path.text);
  return text === undefined ? unknown(`a file that cannot be read (${path.text})`) : { text };
}

/** A value, or the file an `@path` value names where the program reads one. */
function valueContent(
  value: ShellWord | undefined,
  files: boolean,
  stdin: ShellStdin,
  read: Read,
): Content {
  if (value === undefined) return unknown('a flag without its value');
  if (files && value.text.startsWith('@')) {
    return fileContent({ text: value.text.slice(1), dynamic: value.dynamic }, stdin, read);
  }
  return value.dynamic && isDynamic(value.text)
    ? unknown(`a value built at run time (${value.text})`)
    : { text: value.text };
}

/** Forged when a piece carries the needle; otherwise unknown when a piece cannot be read. */
function judge(pieces: readonly Content[], needle: string, what: string): Finding | undefined {
  for (const piece of pieces) {
    if ('text' in piece && normalized(piece.text).includes(needle)) {
      return { kind: 'forged', evidence: what };
    }
  }
  for (const piece of pieces) {
    if ('unknown' in piece) {
      return { kind: 'unknown', evidence: `${what}, unreadable before it runs: ${piece.unknown}` };
    }
  }
  return undefined;
}

/** What an endpoint or URL may write; one decided at run time may write anything. */
function targetsOf(endpoint: ShellWord): Target[] {
  if (endpoint.dynamic && isDynamic(endpoint.text)) return [...ALL_TARGETS];
  const text = normalized(endpoint.text);
  const targets: Target[] = [];
  if (/(?:^|\/)statuses\//.test(text)) targets.push('status');
  if (/\/comments\b/.test(text)) targets.push('comment');
  if (text === 'graphql' || /\/graphql\b/.test(text)) targets.push('graphql');
  return targets;
}

function ghFields(options: readonly Option[], stdin: ShellStdin, read: Read): Field[] {
  return options.flatMap((option): Field[] => {
    const typed = option.name === 'F' || option.name === 'field';
    if (!typed && option.name !== 'f' && option.name !== 'raw-field') return [];
    const text = option.value?.text ?? '';
    const dynamic = option.value?.dynamic === true;
    const equals = text.indexOf('=');
    const key = equals === -1 ? text : text.slice(0, equals);
    if (equals === -1 || (dynamic && isDynamic(key))) {
      return [{ key: undefined, value: unknown(`a field built at run time (${text})`) }];
    }
    const value = { text: text.slice(equals + 1), dynamic };
    return [{ key, value: valueContent(value, typed, stdin, read) }];
  });
}

/** A GraphQL write: an unreadable query may be a mutation, and a mutation's variables its body. */
function graphql(fields: readonly Field[], inputs: readonly Content[]): Finding | undefined {
  const every = judge([...fields.map((f) => f.value), ...inputs], VERDICT_MARKER, COMMENT_WHAT);
  if (every?.kind === 'forged') return every;
  const query = [
    ...fields.filter((f) => f.key === 'query' || f.key === undefined).map((f) => f.value),
    ...inputs,
  ];
  const unreadQuery = judge(query, VERDICT_MARKER, COMMENT_WHAT);
  if (unreadQuery !== undefined) return unreadQuery;
  const mutation = query.some((piece) => 'text' in piece && /\bmutation\b/.test(piece.text));
  return mutation ? every : undefined;
}

function ghApi(words: readonly ShellWord[], stdin: ShellStdin, read: Read): Finding | undefined {
  const { options, positionals } = parseOptions(words, GH_API);
  const method = options.filter((o) => o.name === 'X' || o.name === 'method').at(-1)?.value;
  const fields = ghFields(options, stdin, read);
  const inputs = options
    .filter((o) => o.name === 'input')
    .map((o) => (o.value === undefined ? unknown('--input alone') : fileContent(o.value, stdin, read)));
  const readOnly = method !== undefined && !method.dynamic && /^(?:GET|HEAD)$/i.test(method.text);
  const writes = fields.length > 0 || inputs.length > 0 || method !== undefined;
  if (!writes || readOnly) return undefined;
  const [endpoint] = positionals;
  const targets = positionals.length > 1 ? [...ALL_TARGETS] : endpoint ? targetsOf(endpoint) : [];
  const keyed = (key: string) =>
    fields.filter((f) => f.key === undefined || f.key === key).map((f) => f.value);
  for (const target of targets) {
    const finding =
      target === 'status'
        ? judge([...keyed('context'), ...inputs], STATUS_CONTEXT, STATUS_WHAT)
        : target === 'comment'
          ? judge([...keyed('body'), ...inputs], VERDICT_MARKER, COMMENT_WHAT)
          : graphql(fields, inputs);
    if (finding !== undefined) return finding;
  }
  return undefined;
}

function ghComment(words: readonly ShellWord[], stdin: ShellStdin, read: Read) {
  const { options } = parseOptions(words, GH_COMMENT);
  const bodies = options.flatMap((option): Content[] => {
    if (option.name === 'b' || option.name === 'body') {
      return [valueContent(option.value, false, stdin, read)];
    }
    if (option.name !== 'F' && option.name !== 'body-file') return [];
    return [option.value === undefined ? unknown('--body-file alone') : fileContent(option.value, stdin, read)];
  });
  return judge(bodies, VERDICT_MARKER, COMMENT_WHAT);
}

/** The file a curl payload flag sends, per its own syntax, or none. */
function curlFile(name: string, text: string): string | undefined {
  if (name === 'F' || name === 'form') return /^[^=]*=[@<]([^;]+)/.exec(text)?.[1];
  if (name === 'T' || name === 'upload-file') return text;
  if (name === 'data-urlencode') return /^[^=@]*@(.+)$/.exec(text)?.[1];
  if (name === 'data-raw' || name === 'form-string') return undefined;
  return text.startsWith('@') ? text.slice(1) : undefined;
}

function curl(words: readonly ShellWord[], stdin: ShellStdin, read: Read): Finding | undefined {
  const { options, positionals } = parseOptions(words, CURL);
  const urls = [...positionals, ...options.flatMap((o) => (o.name === 'url' && o.value ? [o.value] : []))];
  const method = options.filter((o) => o.name === 'X' || o.name === 'request').at(-1)?.value;
  const payload = options.filter((o) => CURL_PAYLOAD.has(o.name)).map((o) => {
    const file = o.value === undefined ? undefined : curlFile(o.name, o.value.text);
    return file === undefined || o.value === undefined
      ? valueContent(o.value, false, stdin, read)
      : fileContent({ text: file, dynamic: o.value.dynamic }, stdin, read);
  });
  const config = options.some((o) => o.name === 'K' || o.name === 'config');
  const pieces = [...payload, ...(config ? [unknown('a curl config file')] : [])];
  const readOnly = method !== undefined && !method.dynamic && /^GET$/i.test(method.text);
  if (readOnly || (pieces.length === 0 && method === undefined)) return undefined;
  for (const target of new Set(urls.flatMap(targetsOf))) {
    const finding =
      target === 'status'
        ? judge(pieces, STATUS_CONTEXT, STATUS_WHAT)
        : judge(pieces, VERDICT_MARKER, COMMENT_WHAT);
    if (finding !== undefined) return finding;
  }
  return undefined;
}

/** The program and its arguments past assignments and wrappers; `xargs` appends run-time words. */
function unwrap(words: readonly ShellWord[]): ShellWord[] {
  let rest = [...words];
  while (rest.length > 0) {
    const first = rest[0] as ShellWord;
    const name = first.text.split('/').at(-1) ?? '';
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first.text)) rest = rest.slice(1);
    else if (WRAPPERS.has(name)) {
      rest = rest.slice(1);
      while (rest[0]?.text.startsWith('-') === true) rest = rest.slice(rest[0].text === '-u' ? 2 : 1);
    } else if (name === 'timeout') rest = rest.slice(2);
    else if (name === 'xargs') {
      rest = rest.slice(1);
      while (rest[0]?.text.startsWith('-') === true) rest = rest.slice(1);
      return [...rest, { text: '$XARGS', dynamic: true }];
    } else break;
  }
  return rest;
}

function inspect(command: ShellCommand, read: Read, depth: number): Finding | undefined {
  const [program, ...args] = unwrap(command.words);
  if (program === undefined) return undefined;
  if (depth > 0 && program.dynamic && isDynamic(program.text)) {
    const evidence = `a nested command whose program is decided at run time (${program.text})`;
    return { kind: 'unknown', evidence };
  }
  const name = program.text.split('/').at(-1) ?? '';
  if (name === 'eval') return inspectLine(args.map((w) => w.text).join(' '), read, depth + 1);
  if (SHELLS.has(name)) {
    const flag = args.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w.text));
    const script = flag === -1 ? undefined : args[flag + 1];
    return script === undefined ? undefined : inspectLine(script.text, read, depth + 1);
  }
  if (name === 'curl') return curl(args, command.stdin, read);
  if (name !== 'gh') return undefined;
  const [sub, verb, ...rest] = args;
  if (sub?.text === 'api') return ghApi(args.slice(1), command.stdin, read);
  const commenting = (sub?.text === 'pr' || sub?.text === 'issue') && verb?.text === 'comment';
  return commenting ? ghComment(rest, command.stdin, read) : undefined;
}

function inspectLine(line: string, read: Read, depth: number): Finding | undefined {
  if (depth > NESTING_MAX) return { kind: 'unknown', evidence: 'a command nested too deep to read' };
  const commands = shellCommands(line);
  if (commands === undefined) return { kind: 'unknown', evidence: 'a command too long to read' };
  for (const command of commands) {
    const finding = inspect(command, read, depth);
    if (finding !== undefined) return finding;
  }
  return undefined;
}

/**
 * Refuses a shell command that writes the review verdict outside its one
 * command, or that writes a status or comment it cannot read before it runs.
 * `read` returns a file's text, or undefined when it cannot.
 */
export function reviewVerdictWrite(command: string, read: Read): RuleVerdict {
  const finding = inspectLine(command, read, 0);
  return finding === undefined
    ? allow()
    : block(
        'REVIEW_VERDICT_WRITE',
        'refusing to write the review verdict by hand; pipe it into'
          + ' `void-harness autopilot verdict --pr <number>`, which binds it to the head'
          + ' and writes the comment and the status together',
        [finding.evidence],
      );
}
