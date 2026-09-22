// The words of a shell command, as far as they can be known before it runs.
//
// A rule that matches a regular expression on the raw command reads what the
// command looks like, not what it passes: `-fcontext=x`, `--field=context=x`
// and `context=$C` all reach the program as a context the pattern never saw.
// This splits a command into simple commands and each into words, the way a
// POSIX shell does for quoting, escapes, pipes and here-documents, and marks a
// word `dynamic` when an expansion (`$`, a command substitution, backticks)
// decides part of it at run time. The text of a dynamic word keeps the
// expansion as written, so a string handed to `sh -c` can be split again.
//
// It is not a shell: no globbing, no alias, no arithmetic. What it cannot read
// it reports as dynamic, and a rule treats that as unknown rather than safe.

export interface ShellWord {
  readonly text: string;
  readonly dynamic: boolean;
}

/** Where a simple command reads its standard input from. */
export type ShellStdin =
  | { readonly kind: 'none' }
  | { readonly kind: 'pipe' }
  | { readonly kind: 'text'; readonly word: ShellWord }
  | { readonly kind: 'file'; readonly word: ShellWord };

export interface ShellCommand {
  readonly words: readonly ShellWord[];
  readonly stdin: ShellStdin;
}

/** A command longer than this is not an agent's shell line; it is refused whole. */
const COMMAND_CHARS_MAX = 256 * 1024;

interface Pending {
  delimiter: string;
  quoted: boolean;
  command: MutableCommand;
}

interface MutableCommand {
  words: ShellWord[];
  stdin: ShellStdin;
}

/** The closing character of an expansion opened at `index`, or the end. */
function expansionEnd(source: string, index: number): number {
  const open = source[index + 1];
  const close = open === '(' ? ')' : open === '{' ? '}' : undefined;
  if (close === undefined) {
    const name = /^[A-Za-z_][A-Za-z0-9_]*|^[0-9@*#?$!-]/.exec(source.slice(index + 1));
    return index + (name?.[0].length ?? 0);
  }
  let depth = 0;
  for (let at = index + 1; at < source.length; at += 1) {
    if (source[at] === open) depth += 1;
    if (source[at] === close) depth -= 1;
    if (depth === 0) return at;
  }
  return source.length - 1;
}

/** The quote closing the one opened at `index` (a backtick, or `$'` ANSI-C), or the end. */
function closingQuote(source: string, index: number): number {
  const quote = source[index];
  for (let at = index + 1; at < source.length; at += 1) {
    if (source[at] === '\\') at += 1;
    else if (source[at] === quote) return at;
  }
  return source.length - 1;
}

class Splitter {
  readonly commands: MutableCommand[] = [];
  private current: MutableCommand = { words: [], stdin: { kind: 'none' } };
  private text = '';
  private dynamic = false;
  private quoted = false;
  private started = false;
  private redirect: 'in' | 'out' | 'here-string' | 'heredoc' | undefined;
  private readonly heredocs: Pending[] = [];

  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  split(): MutableCommand[] {
    const source = this.source;
    let at = 0;
    while (at < source.length) at = this.step(at);
    this.endWord();
    this.endCommand('none');
    return this.commands;
  }

  private step(at: number): number {
    const source = this.source;
    const char = source[at] ?? '';
    if (char === '\\') {
      this.quoted = true;
      if (source[at + 1] !== '\n') this.append(source[at + 1] ?? '');
      return at + 2;
    }
    if (char === "'") {
      this.quoted = true;
      const close = source.indexOf("'", at + 1);
      const end = close === -1 ? source.length : close;
      this.append(source.slice(at + 1, end));
      return end + 1;
    }
    if (char === '"') return this.doubleQuoted(at + 1);
    if (char === '$' || char === '`') return this.expansion(at);
    if (char === ' ' || char === '\t') {
      this.endWord();
      return at + 1;
    }
    if (char === '\n') {
      this.endWord();
      this.endCommand('none');
      return this.readHeredocs(at + 1);
    }
    if (char === ';' || char === '&' || char === '|' || char === '(' || char === ')') {
      return this.operator(at);
    }
    if (char === '<' || char === '>') return this.redirection(at);
    this.append(char);
    return at + 1;
  }

  private doubleQuoted(start: number): number {
    const source = this.source;
    let at = start;
    this.started = true;
    this.quoted = true;
    while (at < source.length && source[at] !== '"') {
      const char = source[at] ?? '';
      if (char === '\\' && '"$`\\'.includes(source[at + 1] ?? '')) {
        this.append(source[at + 1] ?? '');
        at += 2;
      } else if (char === '$' || char === '`') {
        at = this.expansion(at);
      } else {
        this.append(char);
        at += 1;
      }
    }
    return at + 1;
  }

  private expansion(at: number): number {
    const source = this.source;
    const last = source[at] === '`' || source[at + 1] === "'"
      ? closingQuote(source, at + (source[at] === '`' ? 0 : 1))
      : expansionEnd(source, at);
    this.append(source.slice(at, last + 1));
    // A lone `$` is a literal dollar; anything longer decides the word at run time.
    if (last > at) this.dynamic = true;
    return last + 1;
  }

  private operator(at: number): number {
    const source = this.source;
    const char = source[at];
    const next = source[at + 1];
    this.endWord();
    if (char === '|' && next !== '|') {
      this.endCommand('pipe');
      return at + (next === '&' ? 2 : 1);
    }
    this.endCommand('none');
    return at + (next === char ? 2 : 1);
  }

  private redirection(at: number): number {
    const source = this.source;
    // A descriptor glued to the operator (`2>`) is not a word.
    if (/^[0-9]+$/.test(this.text) && !this.dynamic && !this.quoted) {
      this.text = '';
      this.started = false;
    }
    this.endWord();
    if (source.startsWith('<<<', at)) {
      this.redirect = 'here-string';
      return at + 3;
    }
    if (source.startsWith('<<', at)) {
      this.redirect = 'heredoc';
      return at + (source[at + 2] === '-' ? 3 : 2);
    }
    this.redirect = source[at] === '<' ? 'in' : 'out';
    let end = at + 1;
    while ('>&|'.includes(source[end] ?? ' ')) end += 1;
    return end;
  }

  private readHeredocs(start: number): number {
    const source = this.source;
    let at = start;
    for (const pending of this.heredocs.splice(0)) {
      const lines: string[] = [];
      while (at < source.length) {
        const newline = source.indexOf('\n', at);
        const end = newline === -1 ? source.length : newline;
        const line = source.slice(at, end);
        at = end + 1;
        if (line.replace(/^\t+/, '') === pending.delimiter) break;
        lines.push(line);
      }
      const body = lines.join('\n');
      const dynamic = !pending.quoted && /[$`]/.test(body);
      pending.command.stdin = { kind: 'text', word: { text: body, dynamic } };
    }
    return at;
  }

  private append(text: string): void {
    this.text += text;
    this.started = true;
  }

  private endWord(): void {
    if (!this.started) return;
    const word = { text: this.text, dynamic: this.dynamic };
    const redirect = this.redirect;
    const quoted = this.quoted;
    this.text = '';
    this.dynamic = false;
    this.quoted = false;
    this.started = false;
    this.redirect = undefined;
    if (redirect === 'out') return;
    if (redirect === 'in') this.current.stdin = { kind: 'file', word };
    else if (redirect === 'here-string') this.current.stdin = { kind: 'text', word };
    else if (redirect === 'heredoc') {
      this.heredocs.push({ delimiter: word.text, quoted, command: this.current });
    } else this.current.words.push(word);
  }

  private endCommand(next: 'none' | 'pipe'): void {
    if (this.current.words.length > 0) this.commands.push(this.current);
    this.current = { words: [], stdin: next === 'pipe' ? { kind: 'pipe' } : { kind: 'none' } };
  }
}

/**
 * The simple commands of a shell line, each with its words and its input.
 * Undefined when the line is too long to be read at all.
 */
export function shellCommands(source: string): ShellCommand[] | undefined {
  if (source.length > COMMAND_CHARS_MAX) return undefined;
  return new Splitter(source).split();
}
