import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalRuntime } from '../cli-args.js';

const TEAM_SPECIALISTS = [
  'solution-architect',
  'security-engineer',
  'test-qa-engineer',
] as const;
const MAX_NATIVE_AGENT_BYTES = 128 * 1024;

export function specialistRelativePaths(runtime: EvalRuntime): readonly string[] {
  return TEAM_SPECIALISTS.map((name) => runtime === 'claude'
    ? `.claude/agents/${name}.md`
    : `.codex/agents/${name}.toml`);
}

export function nativeSpecialistFixture(
  installationRoot: string,
  runtime: EvalRuntime,
): Readonly<Record<string, string>> {
  const fixture: Record<string, string> = {};
  for (const relativePath of specialistRelativePaths(runtime)) {
    const path = join(installationRoot, relativePath);
    if (!existsSync(path)) {
      throw new Error(`native specialist '${relativePath}' is missing after local install`);
    }
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`native specialist '${relativePath}' must be a regular file`);
    }
    if (metadata.size > MAX_NATIVE_AGENT_BYTES) {
      throw new Error(
        `native specialist '${relativePath}' exceeds ${String(MAX_NATIVE_AGENT_BYTES)} bytes`,
      );
    }
    fixture[relativePath] = readFileSync(path, 'utf8');
  }
  return fixture;
}

/** Install through the real local CLI, then retain only the three native team agents. */
export function provisionNativeSpecialists(
  repoRoot: string,
  runtime: EvalRuntime,
): Readonly<Record<string, string>> {
  const root = mkdtempSync(join(tmpdir(), 'void-eval-native-'));
  const cli = join(repoRoot, 'packages', 'cli', 'bin', 'void-harness.mjs');
  const builtCli = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
  try {
    if (!existsSync(builtCli)) {
      throw new Error('void-harness CLI is not built; run pnpm build:cli before the eval');
    }
    execFileSync(
      process.execPath,
      [cli, 'init', '--runtime', runtime, '--no-interactive'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CI: 'true', NO_COLOR: '1' },
      },
    );
    return nativeSpecialistFixture(root, runtime);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
