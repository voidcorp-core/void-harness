// Idempotent patch of the project's agent-doc(s) with a delimited harness block.
// The block points the agent at .void/PHILOSOPHY.md and .void/PROJECT-DOCTRINE.md
// plus a short reminder of how rules are captured.
//
// Two runtimes share one doctrine:
//   - Claude Code reads CLAUDE.md and supports `@path` imports.
//   - Codex reads AGENTS.md; it has no `@import`, so the block lists the files
//     with a "read at session start" instruction instead.
// Keeping both files in sync is the "sister doc" rule (scripts/sync-agent-docs.sh).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MARKETPLACE_NAME, type PackDescriptor } from './packs.js';

const BEGIN_MARKER = '<!-- void-harness:begin -->';
const END_MARKER = '<!-- void-harness:end -->';

export type Runtime = 'claude' | 'codex';

export interface ClaudeMdBlockInputs {
  readonly enabledPlugins: readonly string[];
  readonly enabledPacks: readonly PackDescriptor[];
}

export function harnessBlock(input: ClaudeMdBlockInputs, runtime: Runtime = 'claude'): string {
  const packLines = input.enabledPacks.map((p) => `- \`${p.name}\` — ${p.description}`);
  const isClaude = runtime === 'claude';
  const runtimeName = isClaude ? 'Claude Code' : 'Codex';
  const doctrineLead = isClaude
    ? `### Doctrine — loaded into every session`
    : `### Doctrine — read at the start of every session`;
  const imports = isClaude
    ? [`@.void/PHILOSOPHY.md`, `@.void/PROJECT-DOCTRINE.md`]
    : [`- \`.void/PHILOSOPHY.md\``, `- \`.void/PROJECT-DOCTRINE.md\``];
  const captureLine = isClaude
    ? `To capture a new rule, just say it ("ajoute la règle…", "always X here", "never Y"). The \`capture-rule\` skill auto-invokes, classifies project-specific vs universal, proposes the wording, waits for your confirmation, then writes. Never silent.`
    : `To capture a new rule, just say it ("ajoute la règle…", "always X here", "never Y"). The capture-rule workflow classifies project-specific vs universal, proposes the wording, waits for your confirmation, then writes. Never silent.`;
  return [
    BEGIN_MARKER,
    '',
    `## void-harness (managed by \`void-harness init\`)`,
    '',
    `Marketplace: \`${MARKETPLACE_NAME}\` (https://github.com/voidcorp-core/void-harness). ${runtimeName} doctrine active in this project:`,
    '',
    `- \`void\` — universal craftsman skills (TDD, TypeScript strict, hexagonal, DDD, ...)`,
    ...packLines,
    '',
    doctrineLead,
    '',
    ...imports,
    '',
    `\`PHILOSOPHY.md\` is the universal void-harness doctrine (managed — overwritten on init). \`PROJECT-DOCTRINE.md\` holds project-specific rules: context, ADRs, in-flight decisions (created once, never overwritten by init).`,
    '',
    captureLine,
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

type PatchResult = 'created' | 'patched' | 'updated' | 'unchanged';

async function patchDoc(
  target: string,
  title: string,
  block: string,
): Promise<PatchResult> {
  if (!existsSync(target)) {
    const fresh = [
      `# ${title}`,
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

export async function patchClaudeMd(
  projectRoot: string,
  input: ClaudeMdBlockInputs,
): Promise<PatchResult> {
  return patchDoc(join(projectRoot, 'CLAUDE.md'), 'CLAUDE.md', harnessBlock(input, 'claude'));
}

export async function patchAgentsMd(
  projectRoot: string,
  input: ClaudeMdBlockInputs,
): Promise<PatchResult> {
  return patchDoc(join(projectRoot, 'AGENTS.md'), 'AGENTS.md', harnessBlock(input, 'codex'));
}
