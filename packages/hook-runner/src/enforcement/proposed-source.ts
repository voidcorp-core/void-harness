import { resolve } from 'node:path';

export type ProposedSource =
  | { readonly kind: 'source'; readonly content: string }
  | { readonly kind: 'unresolved'; readonly reason: string };

export const MAX_SOURCE_BYTES = 65_536;
const unresolved = (reason: string): ProposedSource => ({ kind: 'unresolved', reason });

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function source(content: string): ProposedSource {
  return Buffer.byteLength(content) <= MAX_SOURCE_BYTES
    ? { kind: 'source', content } : unresolved('proposed file exceeds 64 KiB');
}

function replace(existing: string | undefined, input: Record<string, unknown>): ProposedSource {
  const before = input['old_string'];
  const after = input['new_string'];
  if (existing === undefined || typeof before !== 'string' || before === '' || typeof after !== 'string') {
    return unresolved('Edit requires an existing file and a nonempty old_string');
  }
  const first = existing.indexOf(before);
  if (first < 0) return unresolved('old_string no longer matches the file');
  if (input['replace_all'] === true) {
    let count = 0;
    for (let index = first; index >= 0; index = existing.indexOf(before, index + before.length)) count += 1;
    // UTF-8 needs at least as many bytes as UTF-16 code units. Bound allocation
    // first, then source() checks actual UTF-8 bytes after this small join. This
    // also handles replacements that split or combine surrogate pairs correctly.
    const length = existing.length + count * (after.length - before.length);
    if (length > MAX_SOURCE_BYTES) return unresolved('replacement exceeds the 64 KiB source limit');
    return source(existing.split(before).join(after));
  }
  if (existing.indexOf(before, first + 1) >= 0) return unresolved('old_string matches more than once');
  return source(existing.slice(0, first) + after + existing.slice(first + before.length));
}

function update(existing: string, patch: readonly string[]): ProposedSource {
  let lines = existing.replaceAll('\r\n', '\n').split('\n');
  let cursor = 0;
  let index = 0;
  let hunks = 0;
  let comparisons = 0;
  while (index < patch.length) {
    if (++hunks > 128 || !patch[index]?.startsWith('@@')) return unresolved('unsupported patch hunk');
    index += 1;
    const before: string[] = [];
    const after: string[] = [];
    while (index < patch.length && !patch[index]?.startsWith('@@')) {
      const line = patch[index++] ?? '';
      if (line === '*** End of File') {
        if (index !== patch.length) return unresolved('misplaced end-of-file marker');
        break;
      }
      if (![' ', '+', '-'].includes(line[0] ?? '')) return unresolved('unsupported patch line');
      if (!line.startsWith('+')) before.push(line.slice(1));
      if (!line.startsWith('-')) after.push(line.slice(1));
    }
    if (before.length === 0) return unresolved('patch insertion has no exact context');
    const matches: number[] = [];
    for (let start = cursor; start + before.length <= lines.length; start += 1) {
      comparisons += before.length;
      if (comparisons > 1_000_000) return unresolved('patch matching exceeds its comparison limit');
      if (before.every((line, offset) => lines[start + offset] === line)) matches.push(start);
      if (matches.length > 1) break;
    }
    const start = matches[0];
    if (matches.length !== 1 || start === undefined) return unresolved('patch context is stale or ambiguous');
    lines = [...lines.slice(0, start), ...after, ...lines.slice(start + before.length)];
    cursor = start + after.length;
    if (Buffer.byteLength(lines.join('\n')) > MAX_SOURCE_BYTES) return unresolved('proposed file exceeds 64 KiB');
  }
  return source(lines.join('\n'));
}

function fromPatch(patch: string, root: string, target: string, existing: string | undefined): ProposedSource {
  if (Buffer.byteLength(patch) > 1024 * 1024) return unresolved('patch exceeds input limit');
  const lines = patch.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '*** Begin Patch' || !patch.trimEnd().endsWith('*** End Patch')) {
    return unresolved('patch requires complete begin and end markers');
  }
  const sections: { kind: string; lines: string[] }[] = [];
  let active: { kind: string; lines: string[] } | undefined;
  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header !== null) {
      active = resolve(root, header[2] ?? '') === target ? { kind: header[1] ?? '', lines: [] } : undefined;
      if (active !== undefined) sections.push(active);
    } else if (line === '*** End Patch') {
      active = undefined;
    } else if (active !== undefined) active.lines.push(line);
  }
  const section = sections[0];
  if (sections.length !== 1 || section === undefined) return unresolved('patch must name the file exactly once');
  if (section.kind === 'Add') {
    if (existing !== undefined || section.lines.some((line) => !line.startsWith('+'))) {
      return unresolved('Add File requires a new file and literal added lines');
    }
    return source(`${section.lines.map((line) => line.slice(1)).join('\n')}\n`);
  }
  if (section.kind !== 'Update' || existing === undefined) return unresolved('patch requires an existing file');
  return update(existing, section.lines);
}

/** Read the original intent, before normalization discards context. Never writes. */
export function proposedSource(raw: unknown, root: string, path: string, existing: string | undefined): ProposedSource {
  const call = object(raw);
  const input = object(call['tool_input']);
  if (call['tool_name'] === 'Write' && typeof input['content'] === 'string') return source(input['content']);
  if (call['tool_name'] === 'Edit') return replace(existing, input);
  for (const key of ['patch', 'input', 'content', 'command']) {
    const value = input[key];
    if (typeof value === 'string' && value.includes('*** Begin Patch')) {
      return fromPatch(value, root, resolve(root, path), existing);
    }
  }
  return unresolved('tool input does not describe a reconstructable file');
}
