import type { NodeTriggers } from '../model/types.js';

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

export function readFrontmatter(text: string): { description: string; triggers?: NodeTriggers } {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  const triggers = parseTriggers(block);
  return triggers ? { description, triggers } : { description };
}

export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}
