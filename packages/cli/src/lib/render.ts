// Terminal render layer for the void-harness CLI.
//
// Goals:
//   - A distinctive "void" signature (violet→cyan wordmark) without noise.
//   - Three fidelity tiers, each degrading cleanly:
//       truecolor (COLORTERM=truecolor)  → the full hex palette + gradient
//       16-color  (TTY, no truecolor)    → nearest ANSI basic colors
//       none      (NO_COLOR / non-TTY)   → plain text
//   - ASCII glyph fallback when the locale is not UTF-8.
//   - Zero dependencies: ANSI codes inlined. Width-adaptive dividers.
//
// Interactive prompts (multiselect, confirm) still use @clack/prompts — this
// module owns only the *output* side. The `c.*` API is stable; commands render
// through it, so palette/banner changes here propagate everywhere.

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
// 16-color fallbacks (used when the terminal lacks truecolor).
const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const;

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '') return true;
  return process.stdout.isTTY === true;
}

function truecolorEnabled(): boolean {
  if (!colorEnabled()) return false;
  const ct = (process.env.COLORTERM ?? '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return true;
  // Common truecolor terminals that don't always set COLORTERM.
  const term = (process.env.TERM_PROGRAM ?? '').toLowerCase();
  return term === 'iterm.app' || term === 'apple_terminal' || term === 'vscode' || term === 'ghostty';
}

function utfEnabled(): boolean {
  if (process.env.VOIDHARNESS_ASCII === '1') return false;
  const lang = (process.env.LC_ALL ?? process.env.LANG ?? '').toLowerCase();
  if (lang === '') return process.platform !== 'win32';
  return lang.includes('utf-8') || lang.includes('utf8');
}

const COLOR = colorEnabled();
const TRUECOLOR = truecolorEnabled();
const UTF = utfEnabled();

interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

// The palette. Each role has a truecolor value and a 16-color fallback code.
// The signature runs violet → cyan; the rest is a tuned semantic set kept muted
// so the accent and the status marks are what the eye lands on.
const PALETTE = {
  accent: { rgb: rgb(157, 124, 255), ansi: ANSI.magenta }, // void violet
  accent2: { rgb: rgb(34, 211, 238), ansi: ANSI.cyan }, // electric cyan
  muted: { rgb: rgb(125, 125, 138), ansi: ANSI.gray }, // cool gray
  green: { rgb: rgb(74, 222, 128), ansi: ANSI.green },
  yellow: { rgb: rgb(251, 191, 36), ansi: ANSI.yellow },
  red: { rgb: rgb(251, 113, 133), ansi: ANSI.red },
} as const;

function tc(color: RGB, text: string): string {
  return `\x1b[38;2;${color.r};${color.g};${color.b}m${text}${RESET}`;
}

function paint(role: keyof typeof PALETTE, text: string): string {
  if (!COLOR) return text;
  const { rgb: value, ansi } = PALETTE[role];
  return TRUECOLOR ? tc(value, text) : `${ansi}${text}${RESET}`;
}

function wrap(code: string, text: string): string {
  return COLOR ? `${code}${text}${RESET}` : text;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * The `void-harness` signature: a per-character violet→cyan gradient in
 * truecolor, a solid accent in 16-color, plain text otherwise. Applied to the
 * wordmark in the banner — the one place the brand gets to shine.
 */
export function brand(text: string): string {
  if (!COLOR) return text;
  if (!TRUECOLOR) return `${BOLD}${PALETTE.accent.ansi}${text}${RESET}`;
  const from = PALETTE.accent.rgb;
  const to = PALETTE.accent2.rgb;
  const chars = [...text];
  const n = Math.max(1, chars.length - 1);
  const out = chars
    .map((ch, i) => {
      const t = i / n;
      return tc(rgb(lerp(from.r, to.r, t), lerp(from.g, to.g, t), lerp(from.b, to.b, t)), ch);
    })
    .join('');
  return `${BOLD}${out}`;
}

export const c = {
  bold: (s: string) => wrap(BOLD, s),
  dim: (s: string) => wrap(DIM, s),
  // Semantic + brand roles (truecolor-aware).
  red: (s: string) => paint('red', s),
  green: (s: string) => paint('green', s),
  yellow: (s: string) => paint('yellow', s),
  accent: (s: string) => paint('accent', s),
  accent2: (s: string) => paint('accent2', s),
  muted: (s: string) => paint('muted', s),
  // Back-compat: `cyan` now maps to the cyan accent role.
  cyan: (s: string) => paint('accent2', s),
};

export const glyph = UTF
  ? { arrow: '◆', dash: '─', check: '✓', up: '↑', dot: '·', to: '→', emdash: '—', bullet: '●' }
  : { arrow: '>', dash: '-', check: '[OK]', up: '[!]', dot: '-', to: '->', emdash: '--', bullet: '*' };

export function termWidth(): number {
  const w = process.stdout.columns;
  if (!w || w < 40) return 80;
  return Math.min(w, 100);
}

function visibleLen(s: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ANSI ESC (\x1b) is the whole point; we strip color codes to measure visible width.
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(s: string, n: number): string {
  const diff = n - visibleLen(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

/** Asymmetric banner: `  ◆ void-harness  <cmd>          v<version>` with a
 *  gradient wordmark and a faint accent tick. */
export function banner(cmd: string, version?: string): void {
  const left = `  ${c.accent(glyph.arrow)} ${brand('void-harness')}  ${c.muted(cmd)}`;
  if (version) {
    const w = termWidth();
    const right = c.muted(`v${version}`);
    const gap = Math.max(2, w - visibleLen(left) - visibleLen(right));
    process.stdout.write(`${left}${' '.repeat(gap)}${right}\n`);
  } else {
    process.stdout.write(`${left}\n`);
  }
  divider();
}

export function divider(): void {
  const w = termWidth();
  process.stdout.write(`  ${c.muted(glyph.dash.repeat(w - 2))}\n`);
}

export function blank(): void {
  process.stdout.write('\n');
}

/** Free-form line with 2-space indent. */
export function line(text: string): void {
  process.stdout.write(`  ${text}\n`);
}

/** Accented section heading with a blank line above for breathing room. */
export function heading(text: string): void {
  process.stdout.write(`\n  ${c.accent(c.bold(text))}\n`);
}

/** `  key  value` style metadata, with key muted. */
export function meta(key: string, value: string): void {
  process.stdout.write(`  ${c.muted(pad(key, 12))}${value}\n`);
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
    info: c.muted(glyph.dot),
  } as const;
  const mark = marks[opts.mark];
  const label = pad(opts.label, 18);
  let cols = '';
  if (opts.versions) {
    const [from, to] = opts.versions;
    cols = `${pad(from, 6)} ${c.muted(glyph.to)} ${pad(to, 6)}  `;
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
