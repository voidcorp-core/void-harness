export function readFrontmatter(text: string): { description: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  return { description };
}

export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}
