// The runtime seam. The harness authors ONE doctrine and compiles it to each
// agent runtime through an adapter. Core commands (init / runtime add / doctor)
// never branch on a runtime name — they iterate the adapters. Adding a runtime
// (Codex exec, Hermes, a local agent, ...) is a new adapter object registered in
// ADAPTERS here, with zero edits to the commands.
//
// This is the AGENT-RUNTIME axis only. The orthogonal MODEL-PROVIDER axis
// (Anthropic / OpenAI-compatible / Ollama / custom) is a separate seam and is
// deliberately NOT conflated here — see docs/specs/2026-07-21-...-multiruntime.
//
// Each adapter owns exactly its runtime-specific surface: how to detect it, its
// extra prerequisites, how to wire its active layer (including its own doctrine
// doc), the "how to start using it" steps, and its health checks. Everything
// runtime-agnostic (stack detection, .void/config.json, PHILOSOPHY /
// PROJECT-DOCTRINE, pack selection) stays in the commands.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CORE_PLUGIN_NAME,
  MARKETPLACE_NAME,
  enabledPluginsKey,
  type PackDescriptor,
} from './packs.js';
import {
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from './settings.js';
import { docFileFor, HARNESS_BLOCK_MARKER, patchRuntimeDoc } from './claude-md.js';
import {
  CODEX_HOOKS_DIR,
  codexFloorHealth,
  wireCodexFloor,
} from './codex-floor.js';
import { checkGh, checkMarketplaceAccess, type CheckResult } from './prerequisites.js';
import { detectRuntimes, type Runtime } from './runtime.js';

/** Everything an adapter's `wire` may need. Runtime-agnostic inputs the command computed. */
export interface RuntimeWireContext {
  readonly projectRoot: string;
  readonly sourceRoot: string;
  readonly enabledPlugins: readonly string[];
  readonly enabledPacks: readonly PackDescriptor[];
  readonly marketplaceRepo: string;
  /** undefined when the Claude marketplace pin could not be resolved (offline). */
  readonly pinVersion: string | undefined;
}

export interface RuntimeWireOutcome {
  /** Raw status messages; the command renders each as a `✓ <id> <message>` line. */
  readonly statusLines: readonly string[];
  /** "How to start using it" checklist items; a `FAILED:`-prefixed item is a blocker. */
  readonly nextSteps: readonly string[];
}

export interface RuntimeAdapter {
  readonly id: Runtime;
  readonly label: string;
  /** Does this runtime already show a footprint in the project? */
  detect(projectRoot: string): boolean;
  /** Extra prerequisite checks beyond the always-checked jq (empty for a runtime with none). */
  prerequisites(marketplaceRepo: string): readonly CheckResult[];
  /** Materialize this runtime's active layer + its own doctrine doc. Idempotent. */
  wire(ctx: RuntimeWireContext): Promise<RuntimeWireOutcome>;
  /** Health checks for this runtime's wiring + doc, for `doctor`. Never throws. */
  doctorChecks(projectRoot: string): Promise<readonly CheckResult[]>;
}

async function docBlockCheck(projectRoot: string, runtime: Runtime): Promise<CheckResult> {
  const file = docFileFor(runtime);
  const path = join(projectRoot, file);
  if (!existsSync(path)) {
    return { name: file, ok: false, message: 'missing', fix: `void-harness runtime add ${runtime}` };
  }
  const text = await readFile(path, 'utf8');
  return text.includes(HARNESS_BLOCK_MARKER)
    ? { name: file, ok: true, message: 'void-harness block present' }
    : { name: file, ok: false, message: 'void-harness block missing', fix: `void-harness runtime add ${runtime}` };
}

const claudeAdapter: RuntimeAdapter = {
  id: 'claude',
  label: 'Claude Code',
  detect: (root) => existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md')),
  prerequisites: (repo) => [checkGh(), checkMarketplaceAccess(repo)],
  async wire(ctx) {
    const settingsPath = settingsPathFor(ctx.projectRoot);
    const existing = await readSettings(settingsPath);
    const merged = mergeSettings(existing, {
      enabledPlugins: ctx.enabledPlugins,
      marketplaceRepo: ctx.marketplaceRepo,
    });
    await writeSettings(settingsPath, merged);
    const docResult = await patchRuntimeDoc(ctx.projectRoot, 'claude', {
      enabledPlugins: ctx.enabledPlugins,
      enabledPacks: ctx.enabledPacks,
    });
    const nextSteps = [
      'restart Claude Code (skills load on session start)',
      'accept the plugin trust prompt on first load',
    ];
    if (ctx.pinVersion === undefined) {
      nextSteps.push(
        'FAILED: core version unresolved (marketplace unreachable) — run gh auth login, then void-harness update to pin it',
      );
    }
    return {
      statusLines: [
        `settings.json: extraKnownMarketplaces.${MARKETPLACE_NAME} + enabledPlugins merged`,
        `CLAUDE.md: ${docResult}`,
      ],
      nextSteps,
    };
  },
  async doctorChecks(projectRoot) {
    const checks: CheckResult[] = [];
    const settingsPath = settingsPathFor(projectRoot);
    if (!existsSync(settingsPath)) {
      checks.push({ name: 'settings.json', ok: false, message: '.claude/settings.json missing', fix: 'void-harness runtime add claude' });
    } else {
      const settings = await readSettings(settingsPath);
      const markets = settings.extraKnownMarketplaces ?? {};
      const enabledPlugins = settings.enabledPlugins ?? {};
      const hasMarketplace = markets[MARKETPLACE_NAME] !== undefined;
      const hasCore = enabledPlugins[enabledPluginsKey(CORE_PLUGIN_NAME)] === true;
      if (hasMarketplace && hasCore) {
        const active = Object.keys(enabledPlugins).filter((k) => enabledPlugins[k] === true).length;
        checks.push({ name: 'settings.json', ok: true, message: `marketplace registered, ${active} plugin(s) enabled` });
      } else {
        const missing = [
          !hasMarketplace && `extraKnownMarketplaces.${MARKETPLACE_NAME}`,
          !hasCore && `enabledPlugins["${enabledPluginsKey(CORE_PLUGIN_NAME)}"]`,
        ].filter(Boolean).join(', ');
        checks.push({ name: 'settings.json', ok: false, message: `missing: ${missing}`, fix: 'void-harness runtime add claude' });
      }
    }
    checks.push(await docBlockCheck(projectRoot, 'claude'));
    return checks;
  },
};

const codexAdapter: RuntimeAdapter = {
  id: 'codex',
  label: 'Codex',
  detect: (root) => existsSync(join(root, '.codex')) || existsSync(join(root, 'AGENTS.md')),
  prerequisites: () => [],
  async wire(ctx) {
    const staged = await wireCodexFloor(ctx.projectRoot, ctx.sourceRoot);
    const docResult = await patchRuntimeDoc(ctx.projectRoot, 'codex', {
      enabledPlugins: ctx.enabledPlugins,
      enabledPacks: ctx.enabledPacks,
    });
    return {
      statusLines: [
        `.codex/hooks.json: floor wired (${staged} scripts → ${CODEX_HOOKS_DIR}/)`,
        `AGENTS.md: ${docResult}`,
      ],
      nextSteps: ['trust the project .codex/ layer per your Codex config (the safety floor is wired)'],
    };
  },
  async doctorChecks(projectRoot) {
    const floor = await codexFloorHealth(projectRoot);
    return [
      {
        name: 'codex floor',
        ok: floor.ok,
        message: floor.detail,
        ...(floor.ok ? {} : { fix: 'void-harness runtime add codex' }),
      },
      await docBlockCheck(projectRoot, 'codex'),
    ];
  },
};

/** The registry. Adding a runtime = one more adapter here. */
export const ADAPTERS: readonly RuntimeAdapter[] = [claudeAdapter, codexAdapter];

export function adapterFor(runtime: Runtime): RuntimeAdapter {
  const found = ADAPTERS.find((a) => a.id === runtime);
  if (!found) throw new Error(`no adapter for runtime '${runtime}'`);
  return found;
}

/** Adapters for a selected set, in registry order. */
export function adaptersFor(runtimes: readonly Runtime[]): readonly RuntimeAdapter[] {
  return ADAPTERS.filter((a) => runtimes.includes(a.id));
}

/** Adapters whose runtime shows a footprint in the project, in registry order. */
export function detectedAdapters(projectRoot: string): readonly RuntimeAdapter[] {
  const detected = detectRuntimes(projectRoot);
  return ADAPTERS.filter((a) => detected.has(a.id));
}
