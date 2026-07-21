#!/usr/bin/env node
// build-decisions-index — regenerates docs/DECISIONS.md from the per-decision
// files in docs/decisions-log/. DECISIONS.md is a GENERATED index; one file per
// decision is the source of truth, so parallel workers never race a shared
// append (the shared-append conflict class, see backlog-autopilot): each worker
// drops its own dated file, this concatenates them newest-first.
//
// Usage:
//   node scripts/build-decisions-index.mjs           # write docs/DECISIONS.md
//   node scripts/build-decisions-index.mjs --check   # exit 1 on drift (CI gate)
// Env override (tests): DECISIONS_LOG_DIR, DECISIONS_INDEX_FILE.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREAMBLE = `# Decisions log

Non-obvious decisions taken on the harness itself, where a credible alternative
existed. One entry per decision. Newest first. See CLAUDE.md meta-rules.

> **Generated file — do not edit here.** Each decision is one file under
> \`docs/decisions-log/<YYYY-MM-DD>-<slug>.md\`; this index is rebuilt by
> \`pnpm decisions:build\` and gated by \`pnpm decisions:check\` in CI. To add a
> decision, create a new dated file (never append to this index) — that is what
> makes parallel work conflict-free.
`;

// Split a decision file into {date, body}. Frontmatter carries date/title for
// ordering; the body (the `## DATE: title` heading + prose) is emitted verbatim.
export function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { date: '0000-00-00', body: text.trim() };
  const dateLine = m[1].match(/^date:\s*(.+)$/m);
  return { date: (dateLine ? dateLine[1] : '0000-00-00').trim(), body: m[2].trim() };
}

// Build the index text from a log directory. Deterministic and coordination-free:
// newest date first, tiebreak by filename DESC.
export function buildIndex(logDir) {
  const files = readdirSync(logDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const entries = files.map((f) => ({ file: f, ...parse(readFileSync(join(logDir, f), 'utf8')) }));
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.file < b.file ? 1 : -1));
  return { text: `${PREAMBLE}\n${entries.map((e) => e.body).join('\n\n')}\n`, count: entries.length };
}

function main() {
  const logDir = process.env.DECISIONS_LOG_DIR ?? 'docs/decisions-log';
  const index = process.env.DECISIONS_INDEX_FILE ?? 'docs/DECISIONS.md';
  const { text, count } = buildIndex(logDir);
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(index, 'utf8');
    } catch {
      current = '';
    }
    if (current !== text) {
      console.error(`decisions:check — ${index} is out of sync with ${logDir}/. Run: pnpm decisions:build`);
      process.exit(1);
    }
    console.log(`decisions:check — ${index} in sync (${count} decisions).`);
  } else {
    writeFileSync(index, text);
    console.log(`decisions:build — wrote ${index} from ${count} decisions.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
