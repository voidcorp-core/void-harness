// Idempotent patch of <project>/CLAUDE.md with a delimited harness block.
// The block contains @import references to .void/PHILOSOPHY.md and
// .void/PROJECT-DOCTRINE.md plus a short reminder of how rules are captured.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MARKETPLACE_NAME, type PackDescriptor } from './packs.js';

const BEGIN_MARKER = '<!-- void-harness:begin -->';
const END_MARKER = '<!-- void-harness:end -->';

export interface ClaudeMdBlockInputs {
  readonly enabledPlugins: readonly string[];
  readonly enabledPacks: readonly PackDescriptor[];
}

export function harnessBlock(input: ClaudeMdBlockInputs): string {
  const packLines = input.enabledPacks.map((p) => `- \`${p.name}\` — ${p.description}`);
  return [
    BEGIN_MARKER,
    '',
    `## void-harness (managed by \`void-harness init\`)`,
    '',
    `Marketplace: \`${MARKETPLACE_NAME}\` (https://github.com/voidcorp-core/void-harness). Plugins active in this project:`,
    '',
    `- \`void\` — universal craftsman skills (TDD, TypeScript strict, hexagonal, DDD, ...)`,
    ...packLines,
    '',
    `### Doctrine — loaded into every session`,
    '',
    `@.void/PHILOSOPHY.md`,
    `@.void/PROJECT-DOCTRINE.md`,
    '',
    `\`PHILOSOPHY.md\` is the universal void-harness doctrine (managed — overwritten on init). \`PROJECT-DOCTRINE.md\` holds project-specific rules: context, ADRs, in-flight decisions (created once, never overwritten by init).`,
    '',
    `To capture a new rule, just say it ("ajoute la règle…", "always X here", "never Y"). The \`capture-rule\` skill auto-invokes, classifies project-specific vs universal, proposes the wording, waits for your confirmation, then writes. Never silent.`,
    '',
    `Run \`void-harness doctor\` to verify the install.`,
    '',
    END_MARKER,
  ].join('\n');
}

function patchHarnessBlock(original: string, block: string): string {
  if (original.includes(BEGIN_MARKER) && original.includes(END_MARKER)) {
    const beginIdx = original.indexOf(BEGIN_MARKER);
    const endIdx = original.indexOf(END_MARKER) + END_MARKER.length;
    return original.slice(0, beginIdx) + block + original.slice(endIdx);
  }
  const lines = original.split('\n');
  const headerIdx = lines.findIndex((l) => l.startsWith('# '));
  if (headerIdx >= 0) {
    const before = lines.slice(0, headerIdx + 1).join('\n');
    const after = lines.slice(headerIdx + 1).join('\n');
    return `${before}\n\n${block}\n${after.startsWith('\n') ? after : `\n${after}`}`;
  }
  return `${block}\n\n${original}`;
}

export async function patchClaudeMd(
  projectRoot: string,
  input: ClaudeMdBlockInputs,
): Promise<'created' | 'patched' | 'updated' | 'unchanged'> {
  const target = join(projectRoot, 'CLAUDE.md');
  const block = harnessBlock(input);

  if (!existsSync(target)) {
    const fresh = [
      `# CLAUDE.md`,
      '',
      block,
      '',
      '<!-- Your project-specific guidance goes below. -->',
      '',
    ].join('\n');
    await writeFile(target, fresh);
    return 'created';
  }

  const original = await readFile(target, 'utf8');
  const patched = patchHarnessBlock(original, block);
  if (patched === original) return 'unchanged';
  await writeFile(target, patched);
  return original.includes(BEGIN_MARKER) ? 'updated' : 'patched';
}
