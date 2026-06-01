// Minimal terminal render layer for void-harness CLI output.
//
// Goals:
//   - Asymmetric banner + thin divider, dense rows (one per line, no @clack
//     gaps).
//   - Graceful degradation: respects NO_COLOR, disables color when stdout
//     is not a TTY (CI / pipes), falls back to ASCII glyphs when the locale
//     is not UTF-8.
//   - Zero dependencies: ANSI codes inlined.
//   - Width-adaptive: dividers fit terminal width, capped at 80 cols.
//
// Interactive prompts (multiselect, confirm) still use @clack/prompts —
// this module replaces only the *output* side (intro/log/outro flow).

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '') return true;
  return process.stdout.isTTY === true;
}

function utfEnabled(): boolean {
  if (process.env.VOIDHARNESS_ASCII === '1') return false;
  const lang = (process.env.LC_ALL ?? process.env.LANG ?? '').toLowerCase();
  if (lang === '') return process.platform !== 'win32';
  return lang.includes('utf-8') || lang.includes('utf8');
}

const COLOR = colorEnabled();
const UTF = utfEnabled();

function wrap(code: string, text: string): string {
  return COLOR ? `${code}${text}${RESET}` : text;
}

export const c = {
  bold: (s: string) => wrap(BOLD, s),
  dim: (s: string) => wrap(DIM, s),
  red: (s: string) => wrap(RED, s),
  green: (s: string) => wrap(GREEN, s),
  yellow: (s: string) => wrap(YELLOW, s),
  cyan: (s: string) => wrap(CYAN, s),
};

export const glyph = UTF
  ? { arrow: '▸', dash: '─', check: '✓', up: '↑', dot: '·', to: '→', emdash: '—' }
  : { arrow: '>', dash: '-', check: '[OK]', up: '[!]', dot: '-', to: '->', emdash: '--' };

export function termWidth(): number {
  const w = process.stdout.columns;
  if (!w || w < 40) return 80;
  return Math.min(w, 100);
}

function pad(s: string, n: number): string {
  // Pad respecting visible length (strip ANSI for measurement).
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = n - visible.length;
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

/** Asymmetric banner: `  ▸ void-harness  <cmd>          v<version>` */
export function banner(cmd: string, version?: string): void {
  const left = `  ${c.cyan(glyph.arrow)} ${c.bold('void-harness')}  ${cmd}`;
  if (version) {
    const w = termWidth();
    const right = c.dim(`v${version}`);
    const leftVisible = `  ${glyph.arrow} void-harness  ${cmd}`.length;
    const rightVisible = `v${version}`.length;
    const gap = Math.max(2, w - leftVisible - rightVisible);
    process.stdout.write(`${left}${' '.repeat(gap)}${right}\n`);
  } else {
    process.stdout.write(`${left}\n`);
  }
  divider();
}

export function divider(): void {
  const w = termWidth();
  process.stdout.write(`  ${c.dim(glyph.dash.repeat(w - 2))}\n`);
}

export function blank(): void {
  process.stdout.write('\n');
}

/** Free-form line with 2-space indent. */
export function line(text: string): void {
  process.stdout.write(`  ${text}\n`);
}

/** `  key  value` style metadata, with key dimmed. */
export function meta(key: string, value: string): void {
  process.stdout.write(`  ${c.dim(pad(key, 12))}${value}\n`);
}

export interface RowOptions {
  readonly mark: 'ok' | 'warn' | 'err' | 'info';
  readonly label: string;
  /** `[from, to]` for transitions like local→remote versions; rendered with arrow. */
  readonly versions?: readonly [string, string];
  readonly suffix?: string;
}

export function row(opts: RowOptions): void {
  const marks = {
    ok: c.green(glyph.check),
    warn: c.yellow(glyph.up),
    err: c.red('x'),
    info: c.dim(glyph.dot),
  } as const;
  const mark = marks[opts.mark];
  const label = pad(opts.label, 18);
  let cols = '';
  if (opts.versions) {
    const [from, to] = opts.versions;
    cols = `${pad(from, 6)} ${c.dim(glyph.to)} ${pad(to, 6)}  `;
  }
  const suffix = opts.suffix ?? '';
  process.stdout.write(`  ${mark}  ${label}${cols}${suffix}\n`);
}

/** Closing footer with thin divider above. */
export function footer(text: string): void {
  divider();
  process.stdout.write(`  ${text}\n`);
}

/** Inline status (no divider above), useful for short commands. */
export function status(text: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const colored = kind === 'ok' ? c.green(text) : kind === 'warn' ? c.yellow(text) : c.red(text);
  process.stdout.write(`  ${colored}\n`);
}
