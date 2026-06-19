// `void-harness feedback push` — the outbound half of the inbound self-evolution
// queue (issue #17 cluster C). Reads .void/harness-feedback/proposed/*.md (notes
// captured by the /void-feedback skill) and files each as a GitHub issue on the
// harness repo, then moves it to pushed/. HITL by default: a bare invocation
// PREVIEWS what it would file and changes nothing; --open performs the writes.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { HARNESS_REPO } from '../lib/packs.js';
import { type ProposedNote, issueCreateArgs, parseProposedNote } from '../lib/feedback.js';
import { banner, blank, c, footer, glyph, line, status } from '../lib/render.js';

const PROPOSED_REL = join('.void', 'harness-feedback', 'proposed');
const PUSHED_REL = join('.void', 'harness-feedback', 'pushed');

function loadNotes(dir: string, only: readonly string[]): ProposedNote[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => only.length === 0 || only.includes(f))
    .sort()
    .map((f) => parseProposedNote(f, readFileSync(join(dir, f), 'utf8')));
}

function printNote(note: ProposedNote): void {
  const tag = note.kind !== undefined ? c.dim(`[${note.kind}]`) : '';
  line(`  ${c.dim(glyph.dot)} ${c.cyan(note.file)} ${tag} ${note.title}`);
}

export async function feedback(args: readonly string[]): Promise<void> {
  if (args[0] !== 'push') {
    status('usage: void-harness feedback push [--open] [file.md ...]', 'err');
    process.exitCode = 2;
    return;
  }
  const rest = args.slice(1);
  const open = rest.includes('--open');
  const only = rest.filter((a) => !a.startsWith('--'));

  const root = process.cwd();
  const proposedDir = join(root, PROPOSED_REL);
  const notes = loadNotes(proposedDir, only);

  banner('feedback push');
  blank();
  if (notes.length === 0) {
    footer(c.dim(`no proposed notes in ${PROPOSED_REL}/ — capture one with /void-feedback.`));
    return;
  }

  if (!open) {
    line(c.dim(`  would file ${notes.length} note(s) as issues on ${HARNESS_REPO}:`));
    for (const note of notes) printNote(note);
    blank();
    footer(c.dim('preview only (HITL). Re-run with --open to file them; add file names to scope.'));
    return;
  }

  const pushedDir = join(root, PUSHED_REL);
  mkdirSync(pushedDir, { recursive: true });
  let filed = 0;
  for (const note of notes) {
    const res = spawnSync('gh', issueCreateArgs(HARNESS_REPO, note), { cwd: root, encoding: 'utf8' });
    if (res.status !== 0) {
      line(c.red(`  ✗ ${note.file}: ${(res.stderr || res.stdout || 'gh failed').trim()}`));
      continue;
    }
    const url = (res.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '(issue created)';
    line(`  ${c.green(glyph.check)} ${note.file} ${c.cyan(url)}`);
    renameSync(join(proposedDir, note.file), join(pushedDir, note.file));
    filed++;
  }

  blank();
  footer(
    filed === notes.length
      ? c.dim(`filed ${filed} issue(s); notes moved to ${PUSHED_REL}/.`)
      : c.yellow(`filed ${filed}/${notes.length}; the rest stay in proposed/ for a retry.`),
  );
  if (filed < notes.length) process.exitCode = 1;
}
