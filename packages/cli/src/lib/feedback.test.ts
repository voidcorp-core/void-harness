import { describe, expect, it } from 'vitest';
import { issueCreateArgs, parseProposedNote } from './feedback.js';

// `void-harness feedback push` (issue #17 cluster C) promotes the HITL inbound
// queue (.void/harness-feedback/proposed/*.md) to GitHub issues on the harness
// repo. Frontmatter varies across notes (trigger/observation/target vs
// source/kind/severity), so the parse is tolerant; the body is filed verbatim.

const NOTE_TRIGGER = `---
date: 2026-06-19
trigger: protect-sensitive-files is Edit|Write-only, so cat > .env bypasses it.
target: hook
component: protect-sensitive-files.sh
confidence: high
---

# Trigger

A Bash write to .env is never seen by the hook.
`;

const NOTE_SKILL_STYLE = `---
date: 2026-06-01
source: no-null-grep flags idiomatic JSX return null
kind: hook
severity: medium
status: proposed
---

The hook is line-oriented, not AST-aware.
`;

describe('parseProposedNote', () => {
  it('derives the title from the trigger field and keeps the full body', () => {
    const note = parseProposedNote('2026-06-19-1.md', NOTE_TRIGGER);
    expect(note.title).toContain('protect-sensitive-files is Edit|Write-only');
    expect(note.kind).toBe('hook');
    expect(note.body).toBe(NOTE_TRIGGER);
  });

  it('falls back to the source field when there is no trigger', () => {
    const note = parseProposedNote('2026-06-01-1.md', NOTE_SKILL_STYLE);
    expect(note.title).toContain('no-null-grep flags idiomatic JSX return null');
    expect(note.kind).toBe('hook');
    expect(note.severity).toBe('medium');
  });

  it('falls back to the filename when frontmatter carries no descriptor', () => {
    const note = parseProposedNote('2026-07-01-3.md', 'no frontmatter here\n');
    expect(note.title).toContain('2026-07-01-3');
  });
});

describe('issueCreateArgs', () => {
  it('targets the harness repo with the harness-feedback label + the note body', () => {
    const note = parseProposedNote('2026-06-19-1.md', NOTE_TRIGGER);
    const args = issueCreateArgs('voidcorp-core/void-harness', note);
    expect(args[0]).toBe('issue');
    expect(args[1]).toBe('create');
    expect(args).toContain('--repo');
    expect(args[args.indexOf('--repo') + 1]).toBe('voidcorp-core/void-harness');
    expect(args[args.indexOf('--body') + 1]).toBe(NOTE_TRIGGER);
    expect(args).toContain('--label');
    expect(args[args.indexOf('--label') + 1]).toBe('harness-feedback');
  });

  it('caps the issue title length', () => {
    const long = `---\ntrigger: ${'x'.repeat(200)}\n---\nbody\n`;
    const note = parseProposedNote('long.md', long);
    const args = issueCreateArgs('o/r', note);
    expect((args[args.indexOf('--title') + 1] ?? '').length).toBeLessThanOrEqual(72);
  });
});
