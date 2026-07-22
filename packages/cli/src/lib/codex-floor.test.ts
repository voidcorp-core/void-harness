import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CODEX_FLOOR_SCRIPTS,
  CODEX_HOOKS_DIR,
  codexFloorDrift,
  codexFloorHealth,
  compileCodexHooksManifest,
  referencedScripts,
  refreshCodexFloor,
  wireCodexFloor,
} from './codex-floor.js';

// The real shipped template — the single source the CLI compiles at init time.
// Reading it here makes the drift guard meaningful: adding a hook to the
// template without staging its script fails this suite.
const here = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolve(here, '..', '..', '..', 'core');
const templatePath = resolve(CORE_ROOT, 'codex', 'hooks.json');
const template = readFileSync(templatePath, 'utf8');

describe('compileCodexHooksManifest', () => {
  it('substitutes every VOID_HOOKS_DIR placeholder with the staged dir', () => {
    const out = compileCodexHooksManifest(template);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the literal placeholder is gone.
    expect(out).not.toContain('${VOID_HOOKS_DIR}');
    expect(out).toContain(`${CODEX_HOOKS_DIR}/block-dangerous-bash.sh`);
  });

  it('produces valid JSON', () => {
    expect(() => JSON.parse(compileCodexHooksManifest(template))).not.toThrow();
  });

  it('honors a custom hooks dir', () => {
    const out = compileCodexHooksManifest(template, '/abs/hooks');
    expect(out).toContain('/abs/hooks/protect-sensitive-files.sh');
  });

  it('throws on a template that is valid JSON but not an object', () => {
    expect(() => compileCodexHooksManifest('42')).toThrow(/not a JSON object/);
    expect(() => compileCodexHooksManifest('null')).toThrow(/not a JSON object/);
    expect(() => compileCodexHooksManifest('[1,2]')).toThrow(/not a JSON object/);
  });
});

describe('referencedScripts drift guard', () => {
  it('every script the template invokes is in the staged floor set', () => {
    const referenced = referencedScripts(template);
    expect(referenced.length).toBeGreaterThan(0);
    for (const script of referenced) {
      expect(CODEX_FLOOR_SCRIPTS).toContain(script);
    }
  });

  it('never throws on a malformed (scalar/null) manifest — returns no scripts', () => {
    expect(referencedScripts('42')).toEqual([]);
    expect(referencedScripts('null')).toEqual([]);
    expect(referencedScripts('not json at all')).toEqual([]);
  });
});

describe('wireCodexFloor', () => {
  it('stages every floor script and writes a valid, placeholder-free manifest', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-floor-'));
    await wireCodexFloor(project, CORE_ROOT);

    for (const script of CODEX_FLOOR_SCRIPTS) {
      expect(existsSync(join(project, CODEX_HOOKS_DIR, script))).toBe(true);
    }
    // The two entry-point hooks (invoked as commands) keep their executable bit;
    // the sourced libraries (_hooklib.sh, _checks.sh) are not executed, so mode
    // is copied verbatim rather than force-set.
    for (const entry of ['block-dangerous-bash.sh', 'protect-sensitive-files.sh']) {
      expect(statSync(join(project, CODEX_HOOKS_DIR, entry)).mode & 0o100).toBeTruthy();
    }

    const manifest = readFileSync(join(project, '.codex', 'hooks.json'), 'utf8');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the literal placeholder is gone.
    expect(manifest).not.toContain('${VOID_HOOKS_DIR}');
    expect(() => JSON.parse(manifest)).not.toThrow();
    expect(manifest).toContain('.void/hooks/block-dangerous-bash.sh');
    // every referenced script actually landed on disk (no wired-but-absent hook)
    for (const script of referencedScripts(manifest)) {
      expect(existsSync(join(project, CODEX_HOOKS_DIR, script))).toBe(true);
    }
  });

  it('returns the staged-script count and is idempotent', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-floor-'));
    expect(await wireCodexFloor(project, CORE_ROOT)).toBe(CODEX_FLOOR_SCRIPTS.length);
    await expect(wireCodexFloor(project, CORE_ROOT)).resolves.toBe(CODEX_FLOOR_SCRIPTS.length);
  });

  it('makes the entry hooks executable even when the source lost its exec bit (npm/pnpm pack)', async () => {
    // Simulate the published package: a source tree whose hook scripts are 0644.
    const src = mkdtempSync(join(tmpdir(), 'void-codex-src-'));
    mkdirSync(join(src, 'hooks'), { recursive: true });
    mkdirSync(join(src, 'codex'), { recursive: true });
    for (const s of CODEX_FLOOR_SCRIPTS) {
      copyFileSync(join(CORE_ROOT, 'hooks', s), join(src, 'hooks', s));
      chmodSync(join(src, 'hooks', s), 0o644); // stripped, as in a packed tarball
    }
    copyFileSync(join(CORE_ROOT, 'codex', 'hooks.json'), join(src, 'codex', 'hooks.json'));

    const project = mkdtempSync(join(tmpdir(), 'void-codex-floor-'));
    await wireCodexFloor(project, src);

    // The floor must be live: codexFloorHealth checks the entry hooks are executable.
    expect((await codexFloorHealth(project)).ok).toBe(true);
    for (const entry of ['block-dangerous-bash.sh', 'protect-sensitive-files.sh']) {
      expect(statSync(join(project, CODEX_HOOKS_DIR, entry)).mode & 0o111).toBeTruthy();
    }
  });
});

describe('codexFloorDrift', () => {
  it('reports a freshly wired floor as in sync (no drift)', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-drift-'));
    await wireCodexFloor(project, CORE_ROOT);
    expect(await codexFloorDrift(project, CORE_ROOT)).toEqual([]);
  });

  it('flags a never-wired project: every file drifts', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-drift-'));
    const drift = await codexFloorDrift(project, CORE_ROOT);
    expect(drift).toContain('hooks.json');
    for (const script of CODEX_FLOOR_SCRIPTS) expect(drift).toContain(script);
  });

  it('flags a staged script whose content diverged', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-drift-'));
    await wireCodexFloor(project, CORE_ROOT);
    writeFileSync(join(project, CODEX_HOOKS_DIR, 'block-dangerous-bash.sh'), '# tampered\n');
    const drift = await codexFloorDrift(project, CORE_ROOT);
    expect(drift).toEqual(['block-dangerous-bash.sh']);
  });

  it('ignores a trailing-newline-only difference in the manifest', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-drift-'));
    await wireCodexFloor(project, CORE_ROOT);
    const manifestPath = join(project, '.codex', 'hooks.json');
    writeFileSync(manifestPath, `${readFileSync(manifestPath, 'utf8').replace(/\n+$/, '')}\n\n\n`);
    expect(await codexFloorDrift(project, CORE_ROOT)).toEqual([]);
  });
});

describe('codexFloorHealth', () => {
  it('reports a freshly wired floor as healthy', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    await wireCodexFloor(project, CORE_ROOT);
    const health = await codexFloorHealth(project);
    expect(health.ok).toBe(true);
    expect(health.detail).toContain('wired');
  });

  it('flags a missing manifest', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    const health = await codexFloorHealth(project);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('missing');
  });

  it('does not crash on a valid-JSON-but-non-object manifest (null or array)', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    await wireCodexFloor(project, CORE_ROOT);
    for (const scalar of ['null\n', '[1,2]\n', '42\n']) {
      writeFileSync(join(project, '.codex', 'hooks.json'), scalar);
      const health = await codexFloorHealth(project);
      expect(health.ok).toBe(false);
      expect(health.detail).toContain('not a JSON object');
    }
  });

  it('flags invalid JSON', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    await wireCodexFloor(project, CORE_ROOT);
    writeFileSync(join(project, '.codex', 'hooks.json'), '{ broken');
    const health = await codexFloorHealth(project);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('not valid JSON');
  });

  it('flags a missing sourced library, not just a missing entry hook (wired-but-dead)', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    await wireCodexFloor(project, CORE_ROOT);
    await rm(join(project, CODEX_HOOKS_DIR, '_hooklib.sh'));
    const health = await codexFloorHealth(project);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('_hooklib.sh');
  });

  it('flags an entry hook that lost its executable bit', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-health-'));
    await wireCodexFloor(project, CORE_ROOT);
    chmodSync(join(project, CODEX_HOOKS_DIR, 'block-dangerous-bash.sh'), 0o644);
    const health = await codexFloorHealth(project);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('not executable');
  });
});

describe('refreshCodexFloor', () => {
  it('reports fresh and writes nothing when the floor is in sync', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-refresh-'));
    await wireCodexFloor(project, CORE_ROOT);
    const result = await refreshCodexFloor(project, CORE_ROOT, false);
    expect(result.status).toBe('fresh');
    expect(result.drift).toEqual([]);
  });

  it('previews a re-stage under dry-run without touching the file', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-refresh-'));
    await wireCodexFloor(project, CORE_ROOT);
    const staged = join(project, CODEX_HOOKS_DIR, 'block-dangerous-bash.sh');
    writeFileSync(staged, '# tampered\n');
    const result = await refreshCodexFloor(project, CORE_ROOT, true);
    expect(result.status).toBe('would-refresh');
    expect(result.drift).toEqual(['block-dangerous-bash.sh']);
    expect(readFileSync(staged, 'utf8')).toBe('# tampered\n'); // untouched
  });

  it('re-stages on drift when not a dry-run, restoring the file', async () => {
    const project = mkdtempSync(join(tmpdir(), 'void-codex-refresh-'));
    await wireCodexFloor(project, CORE_ROOT);
    const staged = join(project, CODEX_HOOKS_DIR, 'block-dangerous-bash.sh');
    writeFileSync(staged, '# tampered\n');
    const result = await refreshCodexFloor(project, CORE_ROOT, false);
    expect(result.status).toBe('refreshed');
    expect(readFileSync(staged, 'utf8')).not.toBe('# tampered\n');
    expect(await codexFloorDrift(project, CORE_ROOT)).toEqual([]);
  });
});
