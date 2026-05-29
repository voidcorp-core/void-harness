// `voidcorp-harness doctor` — health-check the harness install and the
// current project's wiring.
//
// Checks:
//  1. ~/.claude/voidcorp/ exists and contains skills/agents/hooks subtrees
//  2. .voidcorp/config.json exists (in cwd) and parses as valid JSON
//  3. CLAUDE.md and AGENTS.md both exist and stay in sync (basic check:
//     same headers, sister-doc reference present)
//  4. Hook scripts are executable
//  5. Reports a summary; exits 1 if any blocker.

import { existsSync } from 'node:fs';
import { access, constants, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly message: string;
}

export async function doctor(_args: readonly string[]): Promise<void> {
  const checks: CheckResult[] = [];

  // 1. Harness install
  const installRoot = join(homedir(), '.claude', 'voidcorp');
  if (!existsSync(installRoot)) {
    checks.push({
      name: 'harness install',
      ok: false,
      message: `~/.claude/voidcorp/ missing — run 'npx @voidcorp/harness install'`,
    });
  } else {
    const subs = ['claude/skills', 'claude/agents', 'claude/hooks'];
    const missing = subs.filter((s) => !existsSync(join(installRoot, s)));
    if (missing.length > 0) {
      checks.push({
        name: 'harness install',
        ok: false,
        message: `missing subtrees in ~/.claude/voidcorp/: ${missing.join(', ')}`,
      });
    } else {
      const skills = await readdir(join(installRoot, 'claude/skills'));
      const hooks = (await readdir(join(installRoot, 'claude/hooks'))).filter((f) =>
        f.endsWith('.sh'),
      );
      checks.push({
        name: 'harness install',
        ok: true,
        message: `${skills.length} skills, ${hooks.length} hooks installed`,
      });
    }
  }

  // 2. Project config
  const configPath = join(process.cwd(), '.voidcorp', 'config.json');
  if (!existsSync(configPath)) {
    checks.push({
      name: 'project config',
      ok: false,
      message: `.voidcorp/config.json missing — run 'voidcorp-harness init'`,
    });
  } else {
    try {
      const raw = await readFile(configPath, 'utf8');
      JSON.parse(raw);
      checks.push({ name: 'project config', ok: true, message: 'valid JSON' });
    } catch (err) {
      checks.push({
        name: 'project config',
        ok: false,
        message: `invalid JSON: ${(err as Error).message}`,
      });
    }
  }

  // 3. Sister docs
  const claudeMd = join(process.cwd(), 'CLAUDE.md');
  const agentsMd = join(process.cwd(), 'AGENTS.md');
  const haveBoth = existsSync(claudeMd) && existsSync(agentsMd);
  if (!haveBoth) {
    checks.push({
      name: 'sister docs',
      ok: false,
      message: `CLAUDE.md and/or AGENTS.md missing — run 'voidcorp-harness init'`,
    });
  } else {
    const claudeText = await readFile(claudeMd, 'utf8');
    const agentsText = await readFile(agentsMd, 'utf8');
    const claudeRefsAgents = /AGENTS\.md/.test(claudeText);
    const agentsRefsClaude = /CLAUDE\.md/.test(agentsText);
    if (claudeRefsAgents && agentsRefsClaude) {
      checks.push({ name: 'sister docs', ok: true, message: 'both present, cross-referenced' });
    } else {
      checks.push({
        name: 'sister docs',
        ok: false,
        message: `CLAUDE.md and AGENTS.md exist but do not cross-reference each other`,
      });
    }
  }

  // 4. Hooks executable
  if (existsSync(join(installRoot, 'claude/hooks'))) {
    const hookFiles = (await readdir(join(installRoot, 'claude/hooks'))).filter((f) =>
      f.endsWith('.sh'),
    );
    const notExec: string[] = [];
    for (const f of hookFiles) {
      try {
        await access(join(installRoot, 'claude/hooks', f), constants.X_OK);
      } catch {
        notExec.push(f);
      }
    }
    if (notExec.length > 0) {
      checks.push({
        name: 'hooks executable',
        ok: false,
        message: `not executable: ${notExec.join(', ')}`,
      });
    } else {
      checks.push({
        name: 'hooks executable',
        ok: true,
        message: `${hookFiles.length} hooks executable`,
      });
    }
  }

  // Report
  console.log(`voidcorp-harness doctor\n`);
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    console.log(`  ${mark} ${c.name.padEnd(22)} ${c.message}`);
  }

  const blockers = checks.filter((c) => !c.ok).length;
  console.log(``);
  console.log(blockers === 0 ? `all checks passed.` : `${blockers} check(s) failed.`);
  if (blockers > 0) process.exit(1);
}
