import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The entrypoint runs on import, so it is exercised the way a hook actually runs
// it: bundled exactly as `pnpm build` does, then executed as a child process with
// a payload on stdin. Testing the committed bundle instead would prove the
// artefact, not the source it is built from.
const here = dirname(fileURLToPath(import.meta.url));
let hook = '';
let workspace = '';

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'void-hook-cli-'));
  hook = join(workspace, 'cli.mjs');
  await build({
    entryPoints: [join(here, 'cli.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: hook,
  });
}, 30_000);

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function enforce(rule: string, payload: unknown): { code: number; stderr: string } {
  const result = spawnSync(process.execPath, [hook, 'enforce', rule], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    // Telemetry writes under the project root; keep the run out of the real one.
    env: { ...process.env, VOID_PROJECT_ROOT: workspace },
  });
  return { code: result.status ?? 0, stderr: result.stderr ?? '' };
}

const write = (file: string, content: string): unknown => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content },
});

function stageLifecycle(
  root: string,
  payload: unknown,
): { readonly release: () => void; readonly completed: Promise<number | null> } {
  const child = spawn(
    process.execPath,
    [hook, 'lifecycle', 'context-continuity', 'codex'],
    {
      env: { ...process.env, VOID_PROJECT_ROOT: root },
      stdio: ['pipe', 'ignore', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const completed = new Promise<number | null>((resolveRun, rejectRun) => {
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun(code);
      else rejectRun(new Error(`staged hook failed (${String(code)}): ${stderr}`));
    });
  });
  return {
    release: () => child.stdin.end(JSON.stringify(payload)),
    completed,
  };
}

describe('enforce', () => {
  it('names the doctrine a refusal comes from, so the skill can be reached from the message', () => {
    const { code, stderr } = enforce('no-any', write('src/x.ts', 'const a: any = 1;'));
    expect(code).toBe(2);
    expect(stderr).toContain('TYPESCRIPT_ANY:');
    expect(stderr).toContain('(doctrine: the void-typescript-strict skill)');
  });

  it('keeps the evidence under the named doctrine rather than inside the sentence', () => {
    const { stderr } = enforce('no-console', write('src/x.ts', 'console.log("x");'));
    const [first] = stderr.split('\n');
    expect(first).toMatch(/\(doctrine: the void-observability skill\)$/);
    expect(stderr).toContain('\n- console.* in src/x.ts:1');
  });

  it('stays silent and allows when the rule finds nothing', () => {
    const { code, stderr } = enforce('no-any', write('src/x.ts', 'const a: number = 1;'));
    expect(code).toBe(0);
    expect(stderr).toBe('');
  });

  it('refuses an unknown rule rather than failing open on it', () => {
    const { code, stderr } = enforce('no-such-rule', write('src/x.ts', 'const a: any = 1;'));
    expect(code).toBe(2);
    expect(stderr).toContain('HOOK_INPUT_REJECTED: UNKNOWN_ENFORCEMENT_RULE');
  });

  it('refuses a payload it cannot parse rather than letting the write through', () => {
    const result = spawnSync(process.execPath, [hook, 'enforce', 'no-any'], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, VOID_PROJECT_ROOT: workspace },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('HOOK_INPUT_REJECTED:');
  });
});

describe('lifecycle context', () => {
  function banner(root: string): string {
    const result = spawnSync(process.execPath, [hook, 'lifecycle', 'context', 'claude'], {
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, VOID_PROJECT_ROOT: root },
    });
    return result.stdout ?? '';
  }

  function projectWith(skill: string, recorded: string): string {
    const root = mkdtempSync(join(tmpdir(), 'void-banner-'));
    mkdirSync(join(root, '.claude', 'skills', skill), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', skill, 'SKILL.md'), '---\n---\n');
    const mission = join(root, '.void', 'machine', 'runs', 'mis_aaaaaaaaaaaaaaaa');
    mkdirSync(mission, { recursive: true });
    writeFileSync(
      join(mission, 'events.jsonl'),
      `${JSON.stringify({
        kind: 'runtime.tool.started',
        subject: `skill:${recorded}`,
        ts: '2026-08-19T10:00:00.000Z',
        payload: { category: 'skill', tool: 'Skill' },
      })}\n`,
    );
    return root;
  }

  it('names a skill the project recorded but can no longer resolve, from the session after', () => {
    const root = projectWith('void-ticket', 'ticket-writer');
    try {
      // The first opening computes the verdict after its own stdout, so it is
      // the next one that carries it. One session of delay costs nothing here,
      // and it is what keeps the start instant.
      expect(banner(root)).not.toContain('ticket-writer');
      expect(banner(root)).toContain('ticket-writer');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('says nothing extra when every recorded name still resolves', () => {
    const root = projectWith('void-ticket', 'void-ticket');
    try {
      banner(root);
      expect(banner(root)).not.toContain('cannot resolve');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('injects identical resume context for Claude Code and Codex', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-resume-parity-'));
    mkdirSync(join(root, '.void', 'machine'), { recursive: true });
    writeFileSync(join(root, '.void', 'config.json'), '{}\n');
    writeFileSync(
      join(root, '.void', 'program.md'),
      '---\nschemaVersion: 1\nstatus: executing\nprogram: parity\nplan: docs/plan.md\nspec: docs/spec.md\nautopilot:\n  enabled: false\n---\n',
    );
    writeFileSync(join(root, '.void', 'machine', 'checkpoint.md'), '## Objective\n\nResume equally.\n');

    try {
      const context = (agentRuntime: 'claude' | 'codex'): string => {
        const result = spawnSync(process.execPath, [hook, 'lifecycle', 'context', agentRuntime], {
          input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
          encoding: 'utf8',
          env: { ...process.env, VOID_PROJECT_ROOT: root },
        });
        return JSON.parse(result.stdout ?? '{}').hookSpecificOutput.additionalContext as string;
      };
      expect(context('claude')).toBe(context('codex'));
      expect(context('codex')).toContain('Program: parity');
      expect(context('codex')).toContain('Objective: Resume equally.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('seals PreCompact and resumes through the unique continuity handler', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-continuity-cli-'));
    mkdirSync(join(root, '.void', 'machine'), { recursive: true });
    writeFileSync(join(root, '.void', 'config.json'), '{}\n');
    writeFileSync(join(root, '.void', 'machine', 'checkpoint.md'), '## Objective\n\nCLI parity.\n');

    try {
      const compact = spawnSync(
        process.execPath,
        [hook, 'lifecycle', 'context-continuity', 'codex'],
        {
          input: JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'auto' }),
          encoding: 'utf8',
          env: { ...process.env, VOID_PROJECT_ROOT: root },
        },
      );
      expect(compact.status).toBe(0);
      expect(readFileSync(join(root, '.void', 'machine', 'checkpoint.md'), 'utf8')).toContain(
        'void-harness:context-continuity:begin',
      );

      const resume = spawnSync(
        process.execPath,
        [hook, 'lifecycle', 'context-continuity', 'claude'],
        {
          input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
          encoding: 'utf8',
          env: { ...process.env, VOID_PROJECT_ROOT: root },
        },
      );
      expect(JSON.parse(resume.stdout ?? '{}').hookSpecificOutput.additionalContext).toContain(
        'Context continuity: complete',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lets each stale-lock takeover read what the previous one wrote', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-continuity-concurrent-'));
    mkdirSync(join(root, '.void', 'machine'), { recursive: true });
    writeFileSync(join(root, '.void', 'config.json'), '{}\n');
    const checkpoint = join(root, '.void', 'machine', 'checkpoint.md');
    const lock = `${checkpoint}.lock`;
    const orphanClaim = `${lock}.recovery`;
    writeFileSync(
      checkpoint,
      `## Objective\n\nSerialize stale recovery.\n\n${'bounded context '.repeat(25_000)}`,
    );
    writeFileSync(lock, 'stale\n');
    utimesSync(lock, new Date(0), new Date(0));
    writeFileSync(orphanClaim, 'abandoned\n');
    utimesSync(orphanClaim, new Date(0), new Date(0));

    try {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_100));
      const paths = ['src/first.ts', 'src/second.ts', 'src/third.ts'];
      const contenders = paths.map((path) => stageLifecycle(root, {
          hook_event_name: 'PostToolUse',
          session_id: 'concurrent-context',
          tool_name: 'read_file',
          tool_input: { path },
          tool_response: { success: true },
      }));
      await new Promise((resolveReady) => setTimeout(resolveReady, 500));
      for (const contender of contenders) contender.release();
      await Promise.all(contenders.map((contender) => contender.completed));

      // How many contenders meet each other on the lock is the operating system's
      // business: on a loaded machine the first one releases before the next one
      // even asks, and that one takes a free lock legitimately. What must hold
      // whatever the interleaving is that no admitted writer erased another. A
      // writer reads the checkpoint only after taking the lock and replaces it by
      // rename, so two overlapping critical sections would leave the later
      // observation alone; every observation still present therefore proves its
      // writer read the one before it.
      const concurrent = readFileSync(checkpoint, 'utf8');
      const admitted = paths.filter((path) => concurrent.includes(path));
      expect(admitted.length).toBeGreaterThanOrEqual(1);
      expect(concurrent.match(/void-harness:context-continuity:begin/g)).toHaveLength(1);
      expect(concurrent).toContain('Serialize stale recovery.');
      expect(concurrent.match(/bounded context /g)).toHaveLength(25_000);
      expect(existsSync(orphanClaim)).toBe(false);
      expect(
        readdirSync(join(root, '.void', 'machine')).filter((entry) => entry.includes('.lock')),
      ).toEqual([]);
      const runs = join(root, '.void', 'machine', 'runs');
      const statuses = readdirSync(runs).flatMap((mission) =>
        readFileSync(join(runs, mission, 'events.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => JSON.parse(line) as { readonly payload?: { readonly status?: string } })
          .map((event) => event.payload?.status)
          .filter((status): status is string => status !== undefined));
      // An 'ok' with no observation left in the checkpoint would be a writer whose
      // work another one overwrote, which is the failure this test exists to refuse.
      expect(statuses.sort()).toEqual([
        ...admitted.map(() => 'ok'),
        ...paths.slice(admitted.length).map(() => 'skipped'),
      ]);
      for (const path of paths.filter((candidate) => !concurrent.includes(candidate))) {
        spawnSync(process.execPath, [hook, 'lifecycle', 'context-continuity', 'codex'], {
          input: JSON.stringify({
            hook_event_name: 'PostToolUse',
            session_id: 'concurrent-context',
            tool_name: 'read_file',
            tool_input: { path },
            tool_response: { success: true },
          }),
          encoding: 'utf8',
          env: { ...process.env, VOID_PROJECT_ROOT: root },
        });
      }
      const recovered = readFileSync(checkpoint, 'utf8');
      expect(recovered).toContain('src/first.ts');
      expect(recovered).toContain('src/second.ts');
      expect(recovered).toContain('src/third.ts');
      expect(recovered.match(/void-harness:context-continuity:begin/g)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('injects a threshold nudge without replacing the submitted prompt', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-continuity-nudge-'));
    mkdirSync(join(root, '.void', 'machine'), { recursive: true });
    writeFileSync(
      join(root, '.void', 'config.json'),
      '{"context":{"windowTokens":1000,"checkpointThresholdPercent":50}}\n',
    );
    writeFileSync(join(root, '.void', 'machine', 'checkpoint.md'), '## Objective\n\nNudge once.\n');
    const transcript = join(root, 'transcript.jsonl');
    writeFileSync(transcript, `${JSON.stringify({
      message: {
        usage: {
          input_tokens: 470,
          output_tokens: 10,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 10,
        },
      },
    })}\n`);

    try {
      spawnSync(process.execPath, [hook, 'lifecycle', 'context-continuity', 'codex'], {
        input: JSON.stringify({ hook_event_name: 'PreCompact' }),
        encoding: 'utf8',
        env: { ...process.env, VOID_PROJECT_ROOT: root },
      });
      const result = spawnSync(
        process.execPath,
        [hook, 'lifecycle', 'context-continuity', 'codex'],
        {
          input: JSON.stringify({
            hook_event_name: 'UserPromptSubmit',
            transcript_path: transcript,
            prompt: 'continue the implementation',
          }),
          encoding: 'utf8',
          env: { ...process.env, VOID_PROJECT_ROOT: root },
        },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout ?? '{}').hookSpecificOutput.additionalContext).toMatch(
        /void-checkpoint/i,
      );
      expect(result.stdout).not.toContain('continue the implementation');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('session close lifecycle', () => {
  it('emits a checkpoint reminder only for explicit close intent', () => {
    const invoke = (prompt: string): string => {
      const result = spawnSync(process.execPath, [hook, 'lifecycle', 'checkpoint-reminder', 'codex'], {
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }),
        encoding: 'utf8',
        env: { ...process.env, VOID_PROJECT_ROOT: workspace },
      });
      return result.stdout ?? '';
    };
    expect(invoke('on reprend demain')).toContain('void-checkpoint');
    expect(invoke('stop the process')).toBe('');
  });

  it('audits SessionEnd without creating or changing a checkpoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-session-end-'));
    mkdirSync(join(root, '.void'), { recursive: true });
    writeFileSync(join(root, '.void', 'config.json'), '{}\n');
    const checkpoint = join(root, '.void', 'machine', 'checkpoint.md');

    try {
      const result = spawnSync(process.execPath, [hook, 'lifecycle', 'checkpoint-audit', 'claude'], {
        input: JSON.stringify({ hook_event_name: 'SessionEnd', reason: 'other' }),
        encoding: 'utf8',
        env: { ...process.env, VOID_PROJECT_ROOT: root },
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('checkpoint-absent');
      expect(existsSync(checkpoint)).toBe(false);
      expect(readFileSync(join(root, '.void', 'config.json'), 'utf8')).toBe('{}\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Neutralising the freshness call in `cli.ts` changed nothing any test could see,
// so the wiring was carried by nobody. It matters more than the wording: a
// SessionStart hook cannot write to the user, so if this line stops being emitted
// the upgrade prompt does not degrade, it disappears.
describe('the upgrade prompt the session banner carries', () => {
  function staleProject(): { root: string; cache: string } {
    const root = mkdtempSync(join(tmpdir(), 'void-freshness-root-'));
    const cache = mkdtempSync(join(tmpdir(), 'void-freshness-cache-'));
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
    writeFileSync(
      join(root, '.void', 'machine', 'receipts', 'install-v1.json'),
      JSON.stringify({ schemaVersion: 1, version: '0.17.0', source: 'local', runtimes: ['claude'], files: [] }),
    );
    mkdirSync(join(cache, 'void-harness'), { recursive: true });
    writeFileSync(
      join(cache, 'void-harness', 'freshness.json'),
      JSON.stringify({ latest: '2.1.0', checkedAt: Date.now() }),
    );
    return { root, cache };
  }

  const banner = (root: string, cache: string): string =>
    spawnSync(process.execPath, [hook, 'lifecycle', 'context', 'claude'], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'freshness', source: 'startup' }),
      encoding: 'utf8',
      env: { ...process.env, VOID_PROJECT_ROOT: root, XDG_CACHE_HOME: cache },
    }).stdout ?? '';

  it('names both versions and asks for the relay when the install is behind', () => {
    const { root, cache } = staleProject();
    const out = banner(root, cache);

    expect(out).toContain('0.17.0');
    expect(out).toContain('2.1.0');
    expect(out).toContain('void-harness update');
    expect(out.toLowerCase()).toContain('tell the user');
  });

  it('says nothing at all when the install is current', () => {
    const { root, cache } = staleProject();
    writeFileSync(
      join(cache, 'void-harness', 'freshness.json'),
      JSON.stringify({ latest: '0.17.0', checkedAt: Date.now() }),
    );

    expect(banner(root, cache).toLowerCase()).not.toContain('tell the user');
  });
});

// The mechanism the Codex adapter relies on, proven against a real linked
// worktree rather than asserted in a reference page. Measured on 2026-09-02: a
// worker whose runtime sets neither variable writes the run's telemetry into the
// worktree, and the reconciler deletes that worktree before anyone reads the
// pull request -- one run, two halves, one gone.
describe('a hook fired from a worktree', () => {
  function repositoryWithWorktree(): { readonly main: string; readonly worktree: string } {
    const main = mkdtempSync(join(tmpdir(), 'void-hook-worktree-'));
    const git = (...argv: readonly string[]): void => {
      const done = spawnSync('git', argv, { cwd: main, encoding: 'utf8' });
      if (done.status !== 0) throw new Error(`git ${argv.join(' ')}: ${done.stderr ?? ''}`);
    };
    git('init', '--initial-branch', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(main, 'README.md'), '# root\n');
    git('add', 'README.md');
    git('commit', '--no-gpg-sign', '-m', 'root');
    const worktree = join(main, 'wt');
    git('worktree', 'add', '-b', 'worker', worktree);
    return { main, worktree };
  }

  function runsIn(root: string): readonly string[] {
    const runs = join(root, '.void', 'machine', 'runs');
    return existsSync(runs) ? readdirSync(runs) : [];
  }

  it('writes its event under the installation root, never under the worktree it ran in', () => {
    const { main, worktree } = repositoryWithWorktree();
    try {
      const done = spawnSync(process.execPath, [hook, 'activation', 'codex'], {
        input: '{}',
        encoding: 'utf8',
        // Exactly what the Codex adapter does at spawn: the worker's working
        // directory is the worktree, and the root it writes to is the install.
        cwd: worktree,
        env: { ...process.env, VOID_PROJECT_ROOT: main, VOID_MISSION_ID: 'mis_aaaaaaaaaaaaaaaa' },
      });

      expect(done.status ?? 0).toBe(0);
      expect(runsIn(main)).toContain('mis_aaaaaaaaaaaaaaaa');
      expect(readFileSync(join(main, '.void', 'machine', 'runs', 'mis_aaaaaaaaaaaaaaaa', 'events.jsonl'), 'utf8')).toContain('runtime.');
      expect(runsIn(worktree)).toEqual([]);
    } finally {
      rmSync(main, { recursive: true, force: true });
    }
  });

  // And without it, the same hook writes into the tree that gets deleted. The
  // refusal to set it is what costs the evidence, so the cost is measured here.
  it('falls back to the worktree it discovered when no root is exported', () => {
    const { main, worktree } = repositoryWithWorktree();
    try {
      // Annotated and indexed: a spread of `process.env` narrows to the keys it
      // happens to carry, and this package forbids property access on an index
      // signature, so both roots are removed by their names.
      const env: NodeJS.ProcessEnv = { ...process.env, VOID_MISSION_ID: 'mis_bbbbbbbbbbbbbbbb' };
      delete env['VOID_PROJECT_ROOT'];
      delete env['CLAUDE_PROJECT_DIR'];
      spawnSync(process.execPath, [hook, 'activation', 'codex'], {
        input: '{}',
        encoding: 'utf8',
        cwd: worktree,
        env,
      });

      expect(runsIn(worktree)).toContain('mis_bbbbbbbbbbbbbbbb');
      expect(runsIn(main)).not.toContain('mis_bbbbbbbbbbbbbbbb');
    } finally {
      rmSync(main, { recursive: true, force: true });
    }
  });
});
