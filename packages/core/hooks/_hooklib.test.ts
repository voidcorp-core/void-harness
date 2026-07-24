import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// _hooklib.sh is the SOURCED library every PreToolUse hook uses to parse the
// agent's tool-call JSON. These tests cover `hooklib_edits`, the runtime-agnostic
// edit stream that lets a content-scanning hook iterate instead of assuming
// Claude's single-file Edit/Write shape:
//   - Claude: Edit|Write     -> one record (file_path, content|new_string)
//   - Codex:  apply_patch    -> one record per "*** (Add|Update) File:" section,
//                               carrying only that section's ADDED (+) lines.
// Without it, wiring the content-scan hooks for Codex would fire them against an
// empty payload — a wired-but-dead hook, a silent enforcement hole.
const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '_hooklib.sh');
const BASH = process.env.SHELL?.includes('bash') ? process.env.SHELL : '/opt/homebrew/bin/bash';

const RS = '\x1e'; // record separator: ends one <path,content> record
const US = '\x1f'; // unit separator: splits path from content

interface Edit {
  readonly path: string;
  readonly content: string;
}

/** Feed a tool-call JSON to hooklib_edits and decode the record stream. */
function runEdits(input: string): Edit[] {
  const res = spawnSync(BASH, ['-c', `source "${lib}"; hooklib_read; hooklib_edits`], {
    input,
    encoding: 'utf8',
  });
  const out = res.stdout ?? '';
  return out
    .split(RS)
    .filter((r) => r.length > 0)
    .map((r) => {
      const i = r.indexOf(US);
      return { path: r.slice(0, i), content: r.slice(i + 1) };
    });
}

describe('hooklib_edits — Claude Edit|Write shape', () => {
  it('yields one record from a Write (file_path + content)', () => {
    const edits = runEdits(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: 'src/a.ts', content: 'const x = 1\n' },
      }),
    );
    expect(edits).toEqual([{ path: 'src/a.ts', content: 'const x = 1\n' }]);
  });

  it('yields one record from an Edit (file_path + new_string)', () => {
    const edits = runEdits(
      JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: 'src/b.ts', old_string: 'a', new_string: 'const y: any = 2\n' },
      }),
    );
    expect(edits).toEqual([{ path: 'src/b.ts', content: 'const y: any = 2\n' }]);
  });
});

describe('hooklib_edits — Codex apply_patch shape', () => {
  it('yields the ADDED lines only, so a removed or untouched line never trips a scan', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/c.ts',
      '@@ context',
      ' const untouched = console.log',
      '-const removed: any = 1',
      '+const added = 2',
      '*** End Patch',
    ].join('\n');
    const edits = runEdits(JSON.stringify({ tool_name: 'apply_patch', tool_input: { input: patch } }));
    expect(edits).toEqual([{ path: 'src/c.ts', content: 'const added = 2\n' }]);
  });

  it('yields one record per file in a multi-file patch', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/one.ts',
      '+const one = 1',
      '*** Add File: src/two.ts',
      '+const two = 2',
      '+const three = 3',
      '*** End Patch',
    ].join('\n');
    const edits = runEdits(JSON.stringify({ tool_name: 'apply_patch', tool_input: { input: patch } }));
    expect(edits).toEqual([
      { path: 'src/one.ts', content: 'const one = 1\n' },
      { path: 'src/two.ts', content: 'const two = 2\nconst three = 3\n' },
    ]);
  });

  it('emits no record for a Delete File section (nothing to content-scan)', () => {
    const patch = ['*** Begin Patch', '*** Delete File: src/gone.ts', '*** End Patch'].join('\n');
    expect(runEdits(JSON.stringify({ tool_name: 'apply_patch', tool_input: { input: patch } }))).toEqual([]);
  });

  it('reads the patch from .tool_input.patch as well as .input', () => {
    const patch = ['*** Begin Patch', '*** Update File: src/d.ts', '+const d = 4', '*** End Patch'].join('\n');
    const edits = runEdits(JSON.stringify({ tool_name: 'apply_patch', tool_input: { patch } }));
    expect(edits).toEqual([{ path: 'src/d.ts', content: 'const d = 4\n' }]);
  });

  it('does not mistake a +++ diff header for an added line', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/e.ts',
      '+++ b/src/e.ts',
      '+const e = 5',
      '*** End Patch',
    ].join('\n');
    const edits = runEdits(JSON.stringify({ tool_name: 'apply_patch', tool_input: { patch } }));
    expect(edits).toEqual([{ path: 'src/e.ts', content: 'const e = 5\n' }]);
  });
});

describe('hooklib_edits — without jq', () => {
  const BARE_PATH = '/usr/bin:/bin';
  const jqHidden = spawnSync('/bin/sh', ['-c', 'command -v jq'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: BARE_PATH },
  }).status !== 0;

  /** Same call, but with jq unresolvable. */
  function runEditsNoJq(input: string): Edit[] {
    const res = spawnSync(BASH, ['-c', `source "${lib}"; hooklib_read; hooklib_edits`], {
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: BARE_PATH },
    });
    return (res.stdout ?? '')
      .split(RS)
      .filter((r) => r.length > 0)
      .map((r) => {
        const i = r.indexOf(US);
        return { path: r.slice(0, i), content: r.slice(i + 1) };
      });
  }

  // The PATH-only hooks (tdd-guard, auto-format) must keep enforcing on a
  // jq-less machine exactly as they did before this stream existed. The
  // content-scanning hooks are unaffected: they fail closed via
  // hooklib_require_jq before ever reading a record (#63).
  it.runIf(jqHidden)('still yields the Claude file_path, with no content', () => {
    const edits = runEditsNoJq(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'src/a.ts', content: 'x' } }),
    );
    expect(edits).toEqual([{ path: 'src/a.ts', content: '' }]);
  });
});

describe('hooklib_edits — degenerate payloads', () => {
  it('emits nothing when there is neither a file_path nor a patch', () => {
    expect(runEdits(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }))).toEqual([]);
  });

  it('emits nothing on a non-JSON payload rather than throwing', () => {
    expect(runEdits('not json at all')).toEqual([]);
  });
});
