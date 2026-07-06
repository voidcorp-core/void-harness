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

export function readFrontmatter(text: string): {
  description: string;
  triggers?: NodeTriggers;
  activation?: NodeActivation;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  const triggers = parseTriggers(block);
  const activation = parseActivation(block);
  return {
    description,
    ...(triggers ? { triggers } : {}),
    ...(activation ? { activation } : {}),
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
