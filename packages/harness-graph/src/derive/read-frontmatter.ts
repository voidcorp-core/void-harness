import type { EnforcementTier, NodeActivation, NodeEnforcement, NodeTriggers } from '../model/types.js';

const ENFORCEMENT_TIERS: ReadonlySet<string> = new Set(['pretooluse', 'active', 'ci-only', 'n/a']);
const isTier = (v: string): v is EnforcementTier => ENFORCEMENT_TIERS.has(v);
const indentOf = (line: string): number => line.length - line.trimStart().length;

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

/** Parse the opt-in `owner:` scalar (accountable maintainer). A vacuous value — empty, quoted-empty,
 * or a YAML nil token — counts as **absent** so the fail-closed governance gate still fires (a
 * template artifact like `owner: ""` must never pass as a real owner). */
function parseOwner(block: string): string | undefined {
  const line = block.split('\n').find((l) => l.startsWith('owner:'));
  if (!line) return undefined;
  let value = line.slice('owner:'.length).trim();
  // Strip a single pair of surrounding quotes so `owner: "folpe"` yields `folpe`, and `owner: ""` empties.
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1).trim();
  }
  const nil = value === '' || value === '~' || /^null$/i.test(value); // allow-null: matches the YAML nil keyword as text, not a nullish value
  return nil ? undefined : value;
}

const stripQuotes = (s: string): string => s.trim().replace(/^["']|["']$/g, '').trim();

/** Parse the opt-in `runtimes:` list in either idiomatic YAML shape: the flow form
 * `[claude, codex]` (comma- or space-separated, quoted or not) or the block form (`- claude` on
 * following indented lines). Distinguishing the two shapes matters: reading a valid block list as
 * absent would fire a false `missing-runtimes` governance error. An empty/malformed list is dropped. */
function parseRuntimes(block: string): string[] | undefined {
  const lines = block.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('runtimes:'));
  if (idx < 0) return undefined;
  const raw = (lines[idx] ?? '').slice('runtimes:'.length).trim();
  let items: string[];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    items = raw.slice(1, -1).split(/[\s,]+/).map(stripQuotes); // flow form: comma or space separated
  } else if (raw === '') {
    items = []; // block form: consume the following `- item` lines until the list dedents
    for (let i = idx + 1; i < lines.length; i += 1) {
      const m = (lines[i] ?? '').match(/^\s+-\s*(.+?)\s*$/);
      if (!m?.[1]) break;
      items.push(stripQuotes(m[1]));
    }
  } else {
    return undefined; // an unrecognized scalar form is not a runtime list
  }
  const kept = items.filter((s) => s !== '');
  return kept.length > 0 ? kept : undefined;
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
} {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  const triggers = parseTriggers(block);
  const activation = parseActivation(block);
  const owner = parseOwner(block);
  const runtimes = parseRuntimes(block);
  const enforcement = parseEnforcement(block);
  return {
    description,
    ...(triggers ? { triggers } : {}),
    ...(activation ? { activation } : {}),
    ...(owner ? { owner } : {}),
    ...(runtimes ? { runtimes } : {}),
    ...(enforcement ? { enforcement } : {}),
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
