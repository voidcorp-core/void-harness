import type { EnforcementTier, EvalTarget, NodeActivation, NodeEnforcement, NodeTriggers } from '../model/types.js';

const ENFORCEMENT_TIERS: ReadonlySet<string> = new Set(['pretooluse', 'active', 'ci-only', 'n/a']);
const isTier = (v: string): v is EnforcementTier => ENFORCEMENT_TIERS.has(v);
const indentOf = (line: string): number => line.length - line.trimStart().length;
/** Strip a single **matched** pair of surrounding quotes (`"x"` / `'x'`). A dangling or lone quote
 * is left intact — never independently stripped — so a malformed value stays visibly malformed
 * (and `owner: "` collapses to nothing only via a real empty pair, not a half-strip). */
const stripQuotes = (s: string): string => {
  const v = s.trim();
  const paired =
    v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")));
  return paired ? v.slice(1, -1).trim() : v;
};

/** Read an optional scalar frontmatter field by key. Strips a single pair of surrounding quotes;
 * a vacuous value — empty, quoted-empty, or a YAML nil token — counts as **absent** (so a governed
 * field like `owner:` still fails closed on `owner: ""`). Shared by every scalar field. */
function parseScalar(block: string, key: string): string | undefined {
  const prefix = `${key}:`;
  const line = block.split('\n').find((l) => l.startsWith(prefix));
  if (!line) return undefined;
  const value = stripQuotes(line.slice(prefix.length));
  const nil = value === '' || value === '~' || /^null$/i.test(value); // allow-null: matches the YAML nil keyword as text, not a nullish value
  return nil ? undefined : value;
}

/** Read an optional YAML list field by key, in either the flow form (`[a, b]`, comma- or
 * space-separated) or the block form (`- a` on following indented lines). Returns [] when absent
 * or empty. Shared by `runtimes:` and `eval_targets:` so the two cannot diverge on list parsing. */
function parseList(block: string, key: string): string[] {
  const lines = block.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (idx < 0) return [];
  const raw = (lines[idx] ?? '').slice(`${key}:`.length).trim();
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(/[\s,]+/).map(stripQuotes).filter((s) => s !== '');
  }
  if (raw !== '') return []; // an unrecognized scalar form is not a list
  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const m = (lines[i] ?? '').match(/^\s+-\s*(.+?)\s*$/);
    if (!m?.[1]) break; // the list ends at the first non-item line (e.g. the next key)
    items.push(stripQuotes(m[1]));
  }
  return items.filter((s) => s !== '');
}

/** Parse an opt-in `triggers:` block: indented `globs|extensions|tools: [json array]`. Tolerant. */
function parseTriggers(block: string): NodeTriggers | undefined {
  const lines = block.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'triggers:');
  if (start < 0) return undefined;
  const out: { globs?: string[]; extensions?: string[]; tools?: string[] } = {};
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!/^\s/.test(line)) break; // dedent ends the block
    const m = line.match(/^\s+(globs|extensions|tools):\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1] as 'globs' | 'extensions' | 'tools';
    try {
      const val: unknown = JSON.parse(m[2] ?? '');
      if (Array.isArray(val)) {
        const arr = val.filter((v): v is string => typeof v === 'string');
        if (arr.length > 0) out[key] = arr;
      }
    } catch {
      // tolerant: a malformed dimension is dropped, never crashes the build
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Parse the opt-in `activation:` scalar. Only the two known modes are accepted; anything
 * else (or absent) is dropped, so the consumer applies its on-demand default. */
function parseActivation(block: string): NodeActivation | undefined {
  const line = block.split('\n').find((l) => l.startsWith('activation:'));
  if (!line) return undefined;
  const value = line.slice('activation:'.length).trim();
  return value === 'always' || value === 'on-demand' ? value : undefined;
}

/** Parse the opt-in `eval_targets:` list of `runtime/provider/tier` slugs into structured cells.
 * A slug that is not exactly three non-empty parts is dropped (tolerant). */
function parseEvalTargets(block: string): EvalTarget[] | undefined {
  const targets = parseList(block, 'eval_targets')
    .map((slug) => slug.split('/'))
    .filter((p) => p.length === 3 && p.every((x) => x !== ''))
    .map((p) => ({ runtime: p[0] ?? '', provider: p[1] ?? '', tier: p[2] ?? '' }));
  return targets.length > 0 ? targets : undefined;
}

/** Parse the opt-in `runtimes:` list (flow or block form). Empty/absent -> undefined so governance
 * flags it; distinguishing a valid block list from absence avoids a false `missing-runtimes` error. */
function parseRuntimes(block: string): string[] | undefined {
  const items = parseList(block, 'runtimes');
  return items.length > 0 ? items : undefined;
}

/** Parse the opt-in nested `enforcement:` block (floor + per-runtime inline tiers). Unlike
 * `parseTriggers` (one flat level), this handles two indent levels — `floor`/`inline` under
 * `enforcement:`, then `<runtime>` under `inline:` — so it tracks indent explicitly. Assumes the
 * canonical space-indented YAML the generator emits (YAML forbids tab indentation). `floor` is
 * required for a valid block; an unknown inline tier is dropped, never thrown (tolerant). */
function parseEnforcement(block: string): NodeEnforcement | undefined {
  const lines = block.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'enforcement:');
  if (start < 0) return undefined;
  const baseIndent = indentOf(lines[start] ?? '');
  const sub: { line: string; ind: number }[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const ind = indentOf(line);
    if (ind <= baseIndent) break; // dedent ends the block
    sub.push({ line, ind });
  }
  const inlineIdx = sub.findIndex((s) => s.line.trim() === 'inline:');
  const inlineIndent = inlineIdx >= 0 ? (sub[inlineIdx]?.ind ?? 0) : Number.POSITIVE_INFINITY;
  let floor: 'ci' | undefined;
  const inline: Record<string, EnforcementTier> = {};
  for (let j = 0; j < sub.length; j += 1) {
    const entry = sub[j];
    if (!entry) continue;
    if (inlineIdx >= 0 && j > inlineIdx && entry.ind > inlineIndent) {
      const m = entry.line.match(/^\s*([\w-]+):\s*(.+?)\s*$/);
      const key = m?.[1];
      const tier = m?.[2];
      if (key && tier && isTier(tier)) inline[key] = tier;
      continue;
    }
    if (entry.line.match(/^\s*floor:\s*ci\s*$/i)) floor = 'ci'; // tolerant of case; only `ci` is valid
  }
  if (!floor) return undefined; // floor is the required CI-floor anchor of a valid block
  return Object.keys(inline).length > 0 ? { floor, inline } : { floor };
}

export function readFrontmatter(text: string): {
  description: string;
  triggers?: NodeTriggers;
  activation?: NodeActivation;
  owner?: string;
  runtimes?: string[];
  enforcement?: NodeEnforcement;
  evalTargets?: EvalTarget[];
  successSignal?: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  // stripQuotes so a valid-YAML quoted description (needed when the text carries a
  // colon) yields the same value as a bare one — never the surrounding quotes.
  const description = line ? stripQuotes(line.slice('description:'.length)) : '';
  const triggers = parseTriggers(block);
  const activation = parseActivation(block);
  const owner = parseScalar(block, 'owner');
  const runtimes = parseRuntimes(block);
  const enforcement = parseEnforcement(block);
  const evalTargets = parseEvalTargets(block);
  const successSignal = parseScalar(block, 'success_signal');
  return {
    description,
    ...(triggers ? { triggers } : {}),
    ...(activation ? { activation } : {}),
    ...(owner ? { owner } : {}),
    ...(runtimes ? { runtimes } : {}),
    ...(enforcement ? { enforcement } : {}),
    ...(evalTargets ? { evalTargets } : {}),
    ...(successSignal ? { successSignal } : {}),
  };
}

export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

/** Rough source-token weight (~chars/4). A deterministic proxy for a component's
 * static context cost — not a real tokenizer, just a stable, cheap estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
