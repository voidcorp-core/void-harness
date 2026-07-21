import type { NodeActivation, NodeTriggers } from '../model/types.js';

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

export function readFrontmatter(text: string): {
  description: string;
  triggers?: NodeTriggers;
  activation?: NodeActivation;
  owner?: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  const triggers = parseTriggers(block);
  const activation = parseActivation(block);
  const owner = parseOwner(block);
  return {
    description,
    ...(triggers ? { triggers } : {}),
    ...(activation ? { activation } : {}),
    ...(owner ? { owner } : {}),
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
