import {
  shellCommands,
  type ShellStdin,
  type ShellWord,
  substitutionBodies,
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
// It reads what a line runs, not only its simple commands: the bodies of
// `$(…)`, backticks, `<(…)` and `>(…)`; the command behind `{ ( ! if then else
// elif do while until`, a function body, a wrapper and the values of its
// options (`nice -n`, `env -C/-S`, `stdbuf`, `timeout -s/-k`, `exec -a`,
// `sudo -u`); what `find -exec` runs; the string of `sh -c`, `eval`, `env -S`
// and a gh alias; the script a shell or `source` reads from a here-document,
// a here-string or a file it can open. What it cannot read and may write is
// refused: a gh write fed words by `xargs` or `parallel`, a shell reading a
// pipe, `source` of a substitution or a variable, a gh command or verb chosen
// at run time, an imported alias file.
//
// It is a guard against a mistaken or injected command, not a boundary. It
// does not see a variable expanded unquoted into several words (flags it
// never reads), a program it does not parse (`python3 -c`, `node -e`, `hub`,
// `wget`), a script file it cannot open, an alias already in the gh
// configuration, or a program named by a variable at top level
// (`"$PYTHON" x.py`, too common to refuse). What keeps a verdict forged past
// it from arming a merge is the review seal: the loop believes a verdict only
// when its proof answers a nonce the reviewer alone was handed (see
// packages/cli/src/lib/autopilot/review-seal.ts).

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
const ALL_TARGETS: readonly Target[] = ['status', 'comment', 'graphql'];
const NESTING_MAX = 4;

const unknown = (reason: string): Content => ({ unknown: reason });
const isDynamic = (text: string): boolean => /[$`]|[<>]\(/.test(text);
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
      index = longOption(words, index, spec, options);
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
  // Lower case: a path GitHub may route whatever its case is judged the same.
  const text = normalized(endpoint.text).toLowerCase();
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

/**
 * Words that open or close a compound command, or prefix a pipeline: the
 * command they introduce is the next word. `for`, `select` and `case` open a
 * list of words, not a command, and are left to the substitution pass.
 */
const PREFIXES = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until',
  'coproc']);
const NOT_COMMANDS = new Set(['for', 'select', 'case', 'in', 'fi', 'done', 'esac']);
/** A wrapper's options that take a value, short letters then long names. */
const WRAPPER_VALUES: ReadonlyMap<string, OptionSpec> = new Map([
  ['env', { short: new Set(['u', 'C', 'S']), long: new Set(['unset', 'chdir', 'split-string']) }],
  ['nice', { short: new Set(['n']), long: new Set(['adjustment']) }],
  ['stdbuf', { short: new Set(['i', 'o', 'e']), long: new Set(['input', 'output', 'error']) }],
  ['timeout', { short: new Set(['s', 'k']), long: new Set(['signal', 'kill-after']) }],
  ['exec', { short: new Set(['a']), long: new Set() }],
  ['sudo', { short: new Set(['u', 'g', 'p', 'C', 'D', 'h', 'r', 't', 'U', 'T']),
    long: new Set(['user', 'group', 'prompt', 'close-from', 'chdir', 'host', 'role', 'type',
      'other-user', 'command-timeout']) }],
  ['ionice', { short: new Set(['c', 'n', 'p', 'P', 'u']), long: new Set(['class', 'classdata']) }],
  ['time', { short: new Set(['f', 'o']), long: new Set(['format', 'output']) }],
]);
const WRAPPERS = new Set([...WRAPPER_VALUES.keys(), 'command', 'nohup', 'builtin']);
const NO_OPTIONS: OptionSpec = { short: new Set(), long: new Set() };
const XARGS: OptionSpec = {
  short: new Set(['a', 'd', 'E', 'I', 'L', 'n', 'P', 's']),
  long: new Set(['arg-file', 'delimiter', 'eof', 'replace', 'max-lines', 'max-args',
    'max-procs', 'max-chars', 'process-slot-var']),
};
const PARALLEL: OptionSpec = {
  short: new Set(['a', 'C', 'd', 'E', 'I', 'j', 'J', 'L', 'n', 'N', 'P', 'S']),
  long: new Set(['arg-file', 'colsep', 'delimiter', 'eof', 'replace', 'jobs', 'profile',
    'max-lines', 'max-args', 'sshlogin', 'joblog', 'results', 'tmpdir']),
};
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const RUN_TIME: ShellWord = { text: '$RUN_TIME', dynamic: true };

/**
 * A command as far as it can be read: its program and arguments, whether a
 * feeding program (`xargs`, `parallel`) appends words it cannot see, or why it
 * cannot be read at all.
 */
type Unwrapped =
  | { readonly words: readonly ShellWord[]; readonly fed: boolean }
  | { readonly unknown: string };

/** `--name=value`, or `--name value` when `spec` says it takes one; the last index read. */
function longOption(
  words: readonly ShellWord[],
  index: number,
  spec: OptionSpec,
  options: Option[],
): number {
  const word = words[index] as ShellWord;
  const equals = word.text.indexOf('=');
  const name = equals === -1 ? word.text.slice(2) : word.text.slice(2, equals);
  if (equals !== -1) {
    options.push({ name, value: { text: word.text.slice(equals + 1), dynamic: word.dynamic } });
    return index;
  }
  if (!spec.long.has(name)) {
    options.push({ name });
    return index;
  }
  options.push(withValue(name, words[index + 1]));
  return index + 1;
}

/** A leading run of options, per `spec`, and the index of the first word past it. */
function leadingOptions(words: readonly ShellWord[], spec: OptionSpec) {
  const options: Option[] = [];
  let index = 0;
  while (index < words.length) {
    const { text } = words[index] as ShellWord;
    if (text === '--') return { index: index + 1, options };
    if (!text.startsWith('-') || text === '-') break;
    index = text.startsWith('--')
      ? longOption(words, index, spec, options)
      : shortOptions(words, index, spec, options);
    index += 1;
  }
  return { index, options };
}

/** `xargs -I R`: R replaced in each word; a word that is R alone may become a flag. */
function replaced(words: readonly ShellWord[], replace: string): Unwrapped {
  const standalone = words.slice(1).some((word) => word.text === replace);
  return {
    words: words.map((word) =>
      word.text.includes(replace)
        ? { text: word.text.replaceAll(replace, RUN_TIME.text), dynamic: true }
        : word),
    fed: standalone,
  };
}

function feeding(name: string, rest: readonly ShellWord[]): Unwrapped {
  const { index, options } = leadingOptions(rest, name === 'xargs' ? XARGS : PARALLEL);
  const words = rest.slice(index);
  const end = words.findIndex((word) => /^:::/.test(word.text));
  const command = end === -1 ? words : words.slice(0, end);
  const replace = options.find((o) => o.name === 'I' || o.name === 'replace' || o.name === 'i');
  if (name === 'xargs' && replace !== undefined) {
    return replaced(command, replace.value?.text ?? '{}');
  }
  return { words: command, fed: true };
}

/** The program and its arguments past assignments, prefixes and wrappers. */
function unwrap(words: readonly ShellWord[]): Unwrapped {
  let rest = [...words];
  while (rest.length > 0) {
    const first = rest[0] as ShellWord;
    const name = first.text.split('/').at(-1) ?? '';
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first.text) || PREFIXES.has(first.text)) {
      rest = rest.slice(1);
    } else if (first.text === 'function') rest = rest.slice(2);
    else if (NOT_COMMANDS.has(first.text)) return { words: [], fed: false };
    else if (WRAPPERS.has(name)) {
      const spec = WRAPPER_VALUES.get(name) ?? NO_OPTIONS;
      const { index, options } = leadingOptions(rest.slice(1), spec);
      const split = options.find((o) => o.name === 'S' || o.name === 'split-string')?.value;
      rest = rest.slice(1 + index + (name === 'timeout' ? 1 : 0));
      if (split !== undefined) {
        if (split.dynamic && isDynamic(split.text)) {
          return { unknown: 'env -S on a string built at run time' };
        }
        rest = [...(shellCommands(split.text)?.[0]?.words ?? []), ...rest];
      }
    } else if (name === 'xargs' || name === 'parallel') return feeding(name, rest.slice(1));
    else break;
  }
  return { words: rest, fed: false };
}

/** Each command `find -exec` runs, `{}` standing for a path found at run time. */
function findCommands(words: readonly ShellWord[]): ShellWord[][] {
  const commands: ShellWord[][] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (!FIND_EXEC.has((words[index] as ShellWord).text)) continue;
    const ends = (word: ShellWord) => word.text === ';' || word.text === '+';
    const end = words.findIndex((word, at) => at > index && ends(word));
    const command = words.slice(index + 1, end === -1 ? words.length : end);
    commands.push(command.map((word) =>
      word.text.includes('{}')
        ? { text: word.text.replaceAll('{}', RUN_TIME.text), dynamic: true }
        : word));
    index = end === -1 ? words.length : end;
  }
  return commands;
}

/** What a script handed to a shell or to `source` runs, read before it runs. */
function script(
  word: ShellWord | undefined,
  stdin: ShellStdin,
  read: Read,
  depth: number,
): Finding | undefined {
  const fromStdin = word === undefined || ['-', '/dev/stdin'].includes(word.text)
    || word.text.startsWith('/dev/fd/');
  if (fromStdin) {
    if (stdin.kind === 'pipe') {
      return { kind: 'unknown', evidence: 'a shell reading a script from a pipe' };
    }
    if (stdin.kind === 'text') return inspectLine(stdin.word.text, read, depth + 1, true);
    if (stdin.kind === 'file') return script(stdin.word, { kind: 'none' }, read, depth);
    return undefined;
  }
  if (word.dynamic && isDynamic(word.text)) {
    return { kind: 'unknown', evidence: `a script named at run time (${word.text})` };
  }
  const text = read(word.text);
  return text === undefined ? undefined : inspectLine(text, read, depth + 1, true);
}

/** A shell: its `-c` string, else the script it runs, else what it reads on stdin. */
function shell(args: readonly ShellWord[], stdin: ShellStdin, read: Read, depth: number) {
  const flag = args.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w.text));
  if (flag !== -1) {
    const inline = args[flag + 1];
    return inline === undefined ? undefined : inspectLine(inline.text, read, depth + 1, true);
  }
  let index = 0;
  while (index < args.length && /^[-+]/.test((args[index] as ShellWord).text)) {
    const option = (args[index] as ShellWord).text;
    index += /^[-+][a-zA-Z]*[oO]$/.test(option) || /^--(?:rcfile|init-file)$/.test(option) ? 2 : 1;
  }
  const fromStdin = args.slice(0, index).some((w) => /^-[a-zA-Z]*s/.test(w.text));
  return script(fromStdin ? undefined : args[index], stdin, read, depth);
}

/** `gh alias set`: its expansion is what a later `gh <alias>` runs. */
function ghAlias(args: readonly ShellWord[], read: Read, depth: number): Finding | undefined {
  const [verb, ...rest] = args;
  if (verb?.text === 'import') {
    return { kind: 'unknown', evidence: 'gh aliases imported from a file' };
  }
  if (verb?.text !== 'set') return undefined;
  const { options, positionals } = parseOptions(rest, { short: new Set(), long: new Set() });
  const expansion = positionals[1];
  const unreadable = expansion === undefined || expansion.text === '-'
    || (expansion.dynamic && isDynamic(expansion.text));
  if (unreadable) {
    return { kind: 'unknown', evidence: 'a gh alias whose expansion cannot be read' };
  }
  const shellAlias = options.some((o) => o.name === 's' || o.name === 'shell');
  if (shellAlias || expansion.text.startsWith('!')) {
    return inspectLine(expansion.text.replace(/^!/, ''), read, depth + 1, true);
  }
  return inspectLine(`gh ${expansion.text}`, read, depth + 1, true);
}

function gh(
  args: readonly ShellWord[],
  fed: boolean,
  stdin: ShellStdin,
  read: Read,
  depth: number,
): Finding | undefined {
  const [sub, verb, ...rest] = args;
  if (sub?.dynamic && isDynamic(sub.text)) {
    return { kind: 'unknown', evidence: `a gh command chosen at run time (${sub.text})` };
  }
  if (sub?.text === 'alias') return ghAlias(args.slice(1), read, depth);
  const commenting = (sub?.text === 'pr' || sub?.text === 'issue')
    && (verb?.text === 'comment' || (verb?.dynamic === true && isDynamic(verb.text)));
  if (fed && (sub?.text === 'api' || commenting)) {
    return { kind: 'unknown', evidence: 'a gh write fed words at run time by xargs or parallel' };
  }
  if (sub?.text === 'api') return ghApi(args.slice(1), stdin, read);
  if (commenting && verb?.text !== 'comment') {
    return { kind: 'unknown', evidence: `a gh ${sub?.text} verb chosen at run time` };
  }
  return commenting ? ghComment(rest, stdin, read) : undefined;
}

function inspectWords(words: readonly ShellWord[], stdin: ShellStdin, read: Read, depth: number,
  hidden: boolean): Finding | undefined {
  const command = unwrap(words);
  if ('unknown' in command) return { kind: 'unknown', evidence: command.unknown };
  const [program, ...args] = command.words;
  if (program === undefined) return undefined;
  if (hidden && program.dynamic && isDynamic(program.text)) {
    const evidence = `a nested command whose program is decided at run time (${program.text})`;
    return { kind: 'unknown', evidence };
  }
  const name = program.text.split('/').at(-1) ?? '';
  if (name === 'eval') return inspectLine(args.map((w) => w.text).join(' '), read, depth + 1, true);
  if (SHELLS.has(name)) return shell(args, stdin, read, depth);
  if (name === 'source' || program.text === '.') return script(args[0], stdin, read, depth);
  if (name === 'find') {
    for (const found of findCommands(args)) {
      const finding = inspectWords(found, { kind: 'none' }, read, depth, hidden);
      if (finding !== undefined) return finding;
    }
    return undefined;
  }
  if (name === 'curl') {
    return command.fed
      ? { kind: 'unknown', evidence: 'a curl fed words at run time by xargs or parallel' }
      : curl(args, stdin, read);
  }
  return name === 'gh' ? gh(args, command.fed, stdin, read, depth) : undefined;
}

/**
 * Every command of a line, then every command its substitutions run. `hidden`
 * marks a line a command hands to a shell (`sh -c`, `eval`, a script, an
 * alias), where a program chosen at run time is the point, not a habit.
 */
function inspectLine(line: string, read: Read, depth: number, hidden = false): Finding | undefined {
  if (depth > NESTING_MAX) return { kind: 'unknown', evidence: 'a command nested too deep to read' };
  const commands = shellCommands(line);
  if (commands === undefined) return { kind: 'unknown', evidence: 'a command too long to read' };
  for (const command of commands) {
    const finding = inspectWords(command.words, command.stdin, read, depth, hidden);
    if (finding !== undefined) return finding;
  }
  for (const body of substitutionBodies(line)) {
    const finding = inspectLine(body, read, depth + 1, hidden);
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
